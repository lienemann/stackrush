import numpy as np
from scipy import signal

FS = 48000
rng = np.random.default_rng(42)

def phone_channel(x, snr_db, rolloff=True, multipath=True):
    """Simuliert Handy-Lautsprecher -> Raum -> Handy-Mikro."""
    y = x.copy()
    if rolloff:
        # Lautsprecher: steiler Abfall oberhalb ~20 kHz (Butterworth LP @ 20.5k, 4. Ordnung)
        sos = signal.butter(4, 20500, 'lp', fs=FS, output='sos')
        y = signal.sosfilt(sos, y)
        # Mikro-HP unter 100 Hz irrelevant hier
    if multipath:
        # einfache Raum-IR: Direktpfad + 2 Reflexionen (3ms/7ms, gedaempft)
        ir = np.zeros(int(0.008*FS)); ir[0]=1.0
        ir[int(0.003*FS)]=0.35; ir[int(0.007*FS)]=0.18
        y = signal.fftconvolve(y, ir)[:len(y)]
    # AWGN auf Signalband bezogen
    p_sig = np.mean(y**2)
    p_noise = p_sig / (10**(snr_db/10))
    y = y + rng.normal(0, np.sqrt(p_noise), len(y))
    return y

def bfsk_tx(bits, baud, f0, f1):
    spb = int(FS/baud)
    phase = 0.0
    out = np.zeros(len(bits)*spb)
    for i,b in enumerate(bits):
        f = f1 if b else f0
        t = np.arange(spb)
        out[i*spb:(i+1)*spb] = np.sin(phase + 2*np.pi*f*t/FS)
        phase = (phase + 2*np.pi*f*spb/FS) % (2*np.pi)  # phasenkontinuierlich (CPFSK)
    # sanfte Fensterung gegen Klicks
    ramp = int(0.002*FS)
    out[:ramp] *= np.linspace(0,1,ramp); out[-ramp:] *= np.linspace(1,0,ramp)
    return out

def bfsk_rx(y, nbits, baud, f0, f1):
    spb = int(FS/baud)
    t = np.arange(spb)/FS
    # nichtkohaerente Detektion: Korrelation mit sin/cos beider Toene
    refs = {f: (np.sin(2*np.pi*f*t), np.cos(2*np.pi*f*t)) for f in (f0,f1)}
    bits = []
    for i in range(nbits):
        seg = y[i*spb:(i+1)*spb]
        if len(seg)<spb: seg = np.pad(seg,(0,spb-len(seg)))
        e = {}
        for f,(s,c) in refs.items():
            e[f] = (seg@s)**2 + (seg@c)**2
        bits.append(1 if e[f1]>e[f0] else 0)
    return np.array(bits)

print(f"{'Baud':>6} {'Toene (kHz)':>14} {'SNR':>5} {'BER':>8}  Frame(30B+FEC~60B)")
N = 4000
for baud, f0, f1 in [(500, 18500, 19500), (1000, 18500, 20500), (1500, 18250, 21250), (2000, 18000, 22000)]:
    for snr in (20, 10, 5):
        bits = rng.integers(0,2,N)
        tx = bfsk_tx(bits, baud, f0, f1)
        rx = phone_channel(tx, snr)
        got = bfsk_rx(rx, N, baud, f0, f1)
        ber = np.mean(got != bits)
        frame_ms = 60*8/baud*1000
        print(f"{baud:>6} {f0/1e3:>6.2f}/{f1/1e3:<6.2f} {snr:>4}dB {ber:>8.4f}  {frame_ms:>6.0f} ms")

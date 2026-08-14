import numpy as np
rng = np.random.default_rng(7)

# Kanalparameter (aus Modem-Sim): Frame 50ms Airtime, Audio-Out 40ms, Audio-In 60ms
FRAME = 0.050; T_OUT = 0.040; T_IN = 0.060
AIR = FRAME + T_OUT + T_IN  # Sendestart -> beim Host dekodiert

def scenario(n_contenders):
    """Tap-Zeiten: Reaktion auf frisch spielbaren Stapel, N(0.4s, 0.1s)."""
    return np.sort(rng.normal(0.4, 0.1, n_contenders))

def tdma(taps, slot=0.060, nslots=4):
    """Jeder sendet im eigenen Slot, Intent enthaelt lokalen Tap-Timestamp.
    Host sammelt 1 vollen Zyklus nach erstem Empfang, waehlt min(timestamp)."""
    cycle = slot * nslots
    # Sendestart: naechster eigener Slot nach Tap (Slotzuordnung zufaellig)
    slots = rng.permutation(nslots)[:len(taps)]
    tx = np.array([taps[i] + ((slots[i]*slot - taps[i]) % cycle) for i in range(len(taps))])
    arrive = tx + AIR
    decision = arrive.min() + cycle  # Sammelfenster
    winner = int(np.argmin(taps))    # Host waehlt kleinsten Timestamp -> immer fair
    return decision - taps.min(), winner == int(np.argmin(taps))

def backoff(taps, max_bo=0.100, tries=6):
    """ALOHA: sofort senden; Ueberlappung am Host-Mikro = beide Frames kaputt."""
    pend = [(t, i) for i, t in enumerate(taps)]  # (Sendestart, Spieler)
    for _ in range(tries):
        pend.sort()
        starts = np.array([p[0] for p in pend])
        # Kollision: Frames ueberlappen (Airtime am Mikro)
        ok = []
        collided = []
        j = 0
        while j < len(pend):
            k = j
            while k+1 < len(pend) and starts[k+1] < starts[k] + FRAME:
                k += 1
            (ok if k == j else collided).extend(pend[j:k+1])
            j = k+1
        if ok:
            ok.sort()
            t_win, i_win = ok[0]
            return t_win + AIR - taps.min(), i_win == int(np.argmin(taps))
        pend = [(s + FRAME + rng.uniform(0, max_bo), i) for s, i in collided]
    return np.nan, False

print(f"{'Spieler':>8} {'Verfahren':>10} {'Latenz p50':>11} {'p95':>7} {'fair%':>6}")
for n in (2, 3, 4):
    for name, fn in (("TDMA", tdma), ("Backoff", backoff)):
        res = [fn(scenario(n)) for _ in range(5000)]
        lat = np.array([r[0] for r in res]); fair = np.mean([r[1] for r in res])
        print(f"{n:>8} {name:>10} {np.nanpercentile(lat,50)*1000:>9.0f}ms "
              f"{np.nanpercentile(lat,95)*1000:>5.0f}ms {fair*100:>5.1f}%")

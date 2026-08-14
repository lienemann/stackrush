/**
 * 4-FSK modem DSP, ported from the reference simulation docs/modem_sim.py.
 * Pure functions over Float32Array — no Web Audio here, so the whole modem is
 * unit-testable in node (see test/acoustic-dsp.test.ts). The Web Audio glue
 * lives in ./transport.ts.
 *
 * Scheme (see docs/ARCHITECTURE.md "AcousticTransport"):
 *  - 4 tones in the near-ultrasonic band, 2 bits/symbol, CPFSK
 *    (phase-continuous, like bfsk_tx in the sim) with edge ramps.
 *  - default 1000 baud -> 2 kbit/s gross; 12-byte frame ≈ 50 ms airtime.
 *  - non-coherent per-symbol detection via Goertzel energies (the sim's
 *    sin/cos correlation is exactly the Goertzel power).
 *  - sync: 8-symbol alternating preamble + 4-symbol start word, template-
 *    matched on a hop grid of spb/4 samples.
 *  - integrity: CRC-16/CCITT; corrupted frames are dropped silently.
 *
 * The speaker roll-off knee (~20.5 kHz, device-dependent) is the main
 * calibration parameter: TONE_SETS[0] sits right below it; TONE_SETS[1] is
 * the audible-ish fallback for devices that cut off earlier.
 */

export interface ModemConfig {
  sampleRate: number;
  /** 4 tone frequencies, Hz (index = symbol value 0..3) */
  tones: [number, number, number, number];
  /** symbols per second; sampleRate/baud should be an integer */
  baud: number;
  /**
   * FEC by time diversity (the sim's "+FEC" budget): each data symbol is
   * sent `repeat` times; the receiver soft-combines the Goertzel energies of
   * all copies before deciding. repeat=2 halves net rate but survives the
   * symbol errors that multipath + 10 dB SNR produce (CRC alone would drop
   * nearly every frame there).
   */
  repeat: number;
}

/**
 * Tones sit on the baud grid (integer cycles per symbol window) so the four
 * signals are mutually orthogonal under the per-symbol correlation — the
 * digital equivalent of the sim's tone spacing. The primary set spans
 * 17–20 kHz, just below the documented ~20.5 kHz speaker roll-off knee.
 */
export const TONE_SETS: ReadonlyArray<[number, number, number, number]> = [
  [17000, 18000, 19000, 20000], // primary: near-inaudible, below the knee
  [14000, 15000, 16000, 17000], // fallback for early speaker roll-off
];

export const defaultModemConfig = (sampleRate = 48000, toneSet = 0): ModemConfig => ({
  sampleRate,
  tones: TONE_SETS[toneSet] as [number, number, number, number],
  baud: 1000,
  repeat: 2,
});

/** preamble (timing acquisition) + start word (frame alignment) */
const PREAMBLE: number[] = [0, 3, 0, 3, 0, 3, 0, 3];
const START_WORD: number[] = [2, 1, 0, 3];
const SYNC: number[] = [...PREAMBLE, ...START_WORD];
export const MAX_PAYLOAD = 255;

// ---------- CRC-16/CCITT (poly 0x1021, init 0xFFFF) ----------

export function crc16(data: Uint8Array): number {
  let crc = 0xffff;
  for (const byte of data) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++)
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

// ---------- byte <-> symbol mapping (2 bits/symbol, MSB first) ----------

export function bytesToSymbols(bytes: Uint8Array): number[] {
  const syms: number[] = [];
  for (const b of bytes) syms.push((b >> 6) & 3, (b >> 4) & 3, (b >> 2) & 3, b & 3);
  return syms;
}

export function symbolsToBytes(syms: number[]): Uint8Array {
  const out = new Uint8Array(syms.length >> 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = ((syms[4 * i] & 3) << 6) | ((syms[4 * i + 1] & 3) << 4) |
             ((syms[4 * i + 2] & 3) << 2) | (syms[4 * i + 3] & 3);
  }
  return out;
}

// ---------- TX ----------

/**
 * Frame layout (symbols): SYNC | header(2B: sender, length) | payload | crc(2B)
 * All bytes after SYNC are 4 symbols each.
 */
export function buildFrame(sender: number, payload: Uint8Array): Uint8Array {
  if (payload.length > MAX_PAYLOAD) throw new Error('payload too long');
  const body = new Uint8Array(2 + payload.length);
  body[0] = sender & 0xff;
  body[1] = payload.length;
  body.set(payload, 2);
  const crc = crc16(body);
  const frame = new Uint8Array(body.length + 2);
  frame.set(body);
  frame[body.length] = crc >> 8;
  frame[body.length + 1] = crc & 0xff;
  return frame;
}

/** CPFSK modulation, phase-continuous with raised-cosine edge ramps. */
export function modulate(cfg: ModemConfig, frameBytes: Uint8Array): Float32Array {
  const spb = Math.round(cfg.sampleRate / cfg.baud);
  const data = bytesToSymbols(frameBytes).flatMap(s => new Array<number>(cfg.repeat).fill(s));
  const syms = [...SYNC, ...data];
  const out = new Float32Array(syms.length * spb);
  let phase = 0;
  for (let i = 0; i < syms.length; i++) {
    const w = (2 * Math.PI * cfg.tones[syms[i]]) / cfg.sampleRate;
    for (let n = 0; n < spb; n++) {
      out[i * spb + n] = Math.sin(phase);
      phase += w;
    }
    phase %= 2 * Math.PI;
  }
  const ramp = Math.min(Math.floor(0.002 * cfg.sampleRate), out.length >> 1);
  for (let n = 0; n < ramp; n++) {
    const g = n / ramp;
    out[n] *= g;
    out[out.length - 1 - n] *= g;
  }
  return out;
}

/** convenience: payload -> passband samples */
export function encodeFrame(cfg: ModemConfig, sender: number, payload: Uint8Array): Float32Array {
  return modulate(cfg, buildFrame(sender, payload));
}

// ---------- RX ----------

/**
 * Goertzel power at the exact frequency f over samples[start..start+len).
 * No bin quantization: w comes straight from f, matching the sim's
 * sin/cos correlation detector (non-coherent energy).
 */
export function goertzel(samples: Float32Array, start: number, len: number, f: number, fs: number): number {
  const w = (2 * Math.PI * f) / fs;
  const coeff = 2 * Math.cos(w);
  let s0 = 0, s1 = 0, s2 = 0;
  for (let n = 0; n < len; n++) {
    s0 = samples[start + n] + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return s1 * s1 + s2 * s2 - coeff * s1 * s2;
}

export interface DecodedFrame {
  sender: number;
  payload: Uint8Array;
  /** sample index just past the end of the frame (for stream advance) */
  end: number;
}

/**
 * Streaming demodulator. Feed arbitrary-size sample chunks; complete,
 * CRC-clean frames are returned as they are found. Keeps a bounded internal
 * buffer, so it can run forever on live microphone input.
 */
export class Demodulator {
  private buf: Float32Array;
  private filled = 0;
  private readonly spb: number;
  private readonly hop: number;

  constructor(private cfg: ModemConfig, bufferSeconds = 3) {
    this.spb = Math.round(cfg.sampleRate / cfg.baud);
    this.hop = Math.max(1, this.spb >> 2);
    this.buf = new Float32Array(Math.ceil(cfg.sampleRate * bufferSeconds));
  }

  push(chunk: Float32Array): DecodedFrame[] {
    // append, shifting out old samples if needed
    if (this.filled + chunk.length > this.buf.length) {
      const keep = Math.max(0, this.buf.length - chunk.length);
      const drop = this.filled - keep;
      if (drop > 0) {
        this.buf.copyWithin(0, drop, this.filled);
        this.filled -= drop;
      }
    }
    const n = Math.min(chunk.length, this.buf.length - this.filled);
    this.buf.set(chunk.subarray(chunk.length - n), this.filled);
    this.filled += n;

    const frames: DecodedFrame[] = [];
    for (;;) {
      const frame = this.scan();
      if (!frame) break;
      frames.push(frame);
      // drop everything up to the end of the decoded frame
      this.buf.copyWithin(0, frame.end, this.filled);
      this.filled -= frame.end;
    }
    return frames;
  }

  private energies(start: number): number[] {
    return this.cfg.tones.map(f => goertzel(this.buf, start, this.spb, f, this.cfg.sampleRate));
  }

  /** score a candidate sync position: dominance of expected tone per symbol */
  private syncScore(start: number): { score: number; hits: number } {
    let score = 0, hits = 0;
    for (let i = 0; i < SYNC.length; i++) {
      const e = this.energies(start + i * this.spb);
      const want = e[SYNC[i]];
      const other = Math.max(...e.filter((_, t) => t !== SYNC[i]));
      score += want - other;
      if (want > other) hits++;
    }
    return { score, hits };
  }

  private scan(): DecodedFrame | null {
    // sync + (header + crc) minimum, data symbols carry the repeat factor
    const minLen = (SYNC.length + 4 * 4 * this.cfg.repeat) * this.spb;
    if (this.filled < minLen) return null;
    const lastStart = this.filled - minLen;
    for (let k = 0; k * this.hop <= lastStart; k++) {
      const pos = k * this.hop;
      const { score, hits } = this.syncScore(pos);
      if (hits < SYNC.length - 1 || score <= 0) continue;
      // refine alignment around pos at quarter-hop resolution
      let best = pos, bestScore = score;
      const step = Math.max(1, this.hop >> 2);
      for (let d = -this.hop; d <= this.hop; d += step) {
        const p = pos + d;
        if (p < 0 || p > lastStart + this.hop) continue;
        const s = this.syncScore(p).score;
        if (s > bestScore) { bestScore = s; best = p; }
      }
      const frame = this.tryDecodeAt(best);
      if (frame) return frame;
      // sync looked right but CRC failed: skip past this false sync
      k += Math.floor((SYNC.length * this.spb) / this.hop);
    }
    return null;
  }

  private tryDecodeAt(syncStart: number): DecodedFrame | null {
    const dataStart = syncStart + SYNC.length * this.spb;
    const rep = this.cfg.repeat;
    const readByte = (idx: number): number | null => {
      const syms: number[] = [];
      for (let s = 0; s < 4; s++) {
        // soft-combine the energies of all repeated copies of this symbol
        const combined = [0, 0, 0, 0];
        for (let r = 0; r < rep; r++) {
          const at = dataStart + ((idx * 4 + s) * rep + r) * this.spb;
          if (at + this.spb > this.filled) return null;
          const e = this.energies(at);
          for (let t = 0; t < 4; t++) combined[t] += e[t];
        }
        syms.push(combined.indexOf(Math.max(...combined)));
      }
      return symbolsToBytes(syms)[0];
    };
    const sender = readByte(0);
    const length = readByte(1);
    if (sender === null || length === null) return null;
    const total = 2 + length + 2;
    const bytes = new Uint8Array(total);
    bytes[0] = sender;
    bytes[1] = length;
    for (let i = 2; i < total; i++) {
      const b = readByte(i);
      if (b === null) return null; // frame not fully buffered yet
      bytes[i] = b;
    }
    const crc = (bytes[total - 2] << 8) | bytes[total - 1];
    if (crc !== crc16(bytes.subarray(0, total - 2))) return null;
    return {
      sender,
      payload: bytes.slice(2, 2 + length),
      end: dataStart + total * 4 * rep * this.spb,
    };
  }
}

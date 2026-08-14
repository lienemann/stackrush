import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Demodulator, TONE_SETS, buildFrame, bytesToSymbols, crc16, defaultModemConfig,
  encodeFrame, modulate, symbolsToBytes,
} from '../src/acoustic/dsp.js';

/**
 * Channel model ported from docs/modem_sim.py phone_channel():
 * multipath (direct + reflections at 3 ms / 7 ms) + AWGN at a given SNR.
 * (The sim's 20.5 kHz Butterworth speaker roll-off is represented by testing
 * the fallback tone set, which sits well below any roll-off knee.)
 */
function channel(x: Float32Array, snrDb: number, fs = 48000, seed = 42): Float32Array {
  const taps: Array<[number, number]> = [[0, 1.0], [Math.round(0.003 * fs), 0.35], [Math.round(0.007 * fs), 0.18]];
  const y = new Float32Array(x.length);
  for (const [d, g] of taps)
    for (let n = d; n < x.length; n++) y[n] += g * x[n - d];
  let pSig = 0;
  for (let n = 0; n < y.length; n++) pSig += y[n] * y[n];
  pSig /= y.length;
  const sigma = Math.sqrt(pSig / 10 ** (snrDb / 10));
  // deterministic gaussian noise (Box-Muller over mulberry32)
  let a = seed >>> 0;
  const rand = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let n = 0; n < y.length; n += 2) {
    const u1 = Math.max(rand(), 1e-12), u2 = rand();
    const r = Math.sqrt(-2 * Math.log(u1));
    y[n] += sigma * r * Math.cos(2 * Math.PI * u2);
    if (n + 1 < y.length) y[n + 1] += sigma * r * Math.sin(2 * Math.PI * u2);
  }
  return y;
}

function silence(ms: number, fs = 48000): Float32Array {
  return new Float32Array(Math.round((ms / 1000) * fs));
}

function concat(...parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

test('symbol mapping round-trips', () => {
  const bytes = new Uint8Array([0x00, 0xff, 0xa5, 0x3c, 0x01]);
  assert.deepEqual(symbolsToBytes(bytesToSymbols(bytes)), bytes);
});

test('crc16 detects corruption', () => {
  const frame = buildFrame(7, new Uint8Array([1, 2, 3]));
  const body = frame.subarray(0, frame.length - 2);
  assert.equal((frame[frame.length - 2] << 8) | frame[frame.length - 1], crc16(body));
  const bad = frame.slice();
  bad[3] ^= 0x10;
  assert.notEqual((bad[bad.length - 2] << 8) | bad[bad.length - 1], crc16(bad.subarray(0, bad.length - 2)));
});

test('frame airtime: ≈50 ms gross for 12 B, ≈2x with rate-1/2 FEC', () => {
  const raw = { ...defaultModemConfig(), repeat: 1 };
  const grossMs = (modulate(raw, buildFrame(1, new Uint8Array(8))).length / raw.sampleRate) * 1000;
  assert.ok(grossMs > 30 && grossMs < 80, `gross airtime ${grossMs.toFixed(0)} ms`); // 12 B ≈ 50 ms budget
  const fec = defaultModemConfig();
  const fecMs = (modulate(fec, buildFrame(1, new Uint8Array(8))).length / fec.sampleRate) * 1000;
  assert.ok(fecMs > 80 && fecMs < 160, `FEC airtime ${fecMs.toFixed(0)} ms`);
});

test('clean channel: frame decodes with arbitrary chunking', () => {
  const cfg = defaultModemConfig();
  const payload = new TextEncoder().encode('ROOM:KX7Q2');
  const tx = concat(silence(35), encodeFrame(cfg, 9, payload), silence(35));
  const demod = new Demodulator(cfg);
  const got: Array<{ sender: number; payload: Uint8Array }> = [];
  for (let i = 0; i < tx.length; i += 480) // 10 ms chunks like live capture
    got.push(...demod.push(tx.subarray(i, Math.min(tx.length, i + 480))));
  assert.equal(got.length, 1);
  assert.equal(got[0].sender, 9);
  assert.deepEqual(got[0].payload, payload);
});

test('noisy multipath channel (10 dB SNR): both tone sets decode', () => {
  for (let set = 0; set < TONE_SETS.length; set++) {
    const cfg = defaultModemConfig(48000, set);
    const payload = new Uint8Array([0x53, 0x52, 1, 2, 3, 4, 5, 6, 7, 8]);
    const tx = concat(silence(50), encodeFrame(cfg, 3, payload), silence(50));
    const rx = channel(tx, 10);
    const frames = new Demodulator(cfg).push(rx);
    assert.equal(frames.length, 1, `tone set ${set}`);
    assert.deepEqual(frames[0].payload, payload, `tone set ${set}`);
  }
});

test('back-to-back frames decode as separate frames', () => {
  const cfg = defaultModemConfig();
  const f1 = encodeFrame(cfg, 1, new TextEncoder().encode('one'));
  const f2 = encodeFrame(cfg, 2, new TextEncoder().encode('two'));
  const rx = channel(concat(silence(40), f1, silence(25), f2, silence(40)), 15);
  const demod = new Demodulator(cfg);
  const got: Array<{ sender: number; payload: Uint8Array }> = [];
  for (let i = 0; i < rx.length; i += 1024)
    got.push(...demod.push(rx.subarray(i, Math.min(rx.length, i + 1024))));
  assert.equal(got.length, 2);
  assert.equal(new TextDecoder().decode(got[0].payload), 'one');
  assert.equal(got[1].sender, 2);
});

test('corrupted frame is dropped silently, later frame still decodes', () => {
  const cfg = defaultModemConfig();
  const bad = encodeFrame(cfg, 1, new Uint8Array([9, 9, 9, 9]));
  // destroy the middle of the first frame's data section
  for (let n = Math.floor(bad.length * 0.7); n < Math.floor(bad.length * 0.8); n++) bad[n] = 0;
  const good = encodeFrame(cfg, 2, new Uint8Array([7]));
  const rx = concat(silence(40), bad, silence(40), good, silence(40));
  const demod = new Demodulator(cfg);
  const got: Array<{ sender: number; payload: Uint8Array }> = [];
  for (let i = 0; i < rx.length; i += 512)
    got.push(...demod.push(rx.subarray(i, Math.min(rx.length, i + 512))));
  assert.equal(got.length, 1);
  assert.equal(got[0].sender, 2);
  assert.deepEqual(got[0].payload, new Uint8Array([7]));
});

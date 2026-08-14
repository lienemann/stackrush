import { Emitter, PeerId, Transport, TransportCaps } from '../transport.js';
import {
  Demodulator, MAX_PAYLOAD, ModemConfig, TONE_SETS, defaultModemConfig, encodeFrame,
} from './dsp.js';

/**
 * AcousticTransport: 4-FSK over speaker/microphone (docs/ARCHITECTURE.md).
 * Primary use is "pair by sound" (broadcasting the room code); it also
 * implements the full Transport interface for 2-player fallback play —
 * slow (~250 B/s) but functional.
 *
 * Half-duplex: while we play a frame, our own microphone decode is muted
 * (we would only hear ourselves). Frames longer than MAX_PAYLOAD are
 * fragmented and reassembled. Above 2 players the send queue applies TDMA
 * slots by device id (docs/arb_sim.py) — slot = deviceId % slots.
 *
 * Calibration: TX alternates frames across both tone sets so a receiver
 * behind an early speaker roll-off knee still locks on; RX runs one
 * demodulator per tone set in parallel and reports which set decoded,
 * so a session can pin the working set via `pinToneSet()`.
 */

const FRAG_HEADER = 2; // [seq | moreFlag<<7, fragIndex]

export interface AcousticOptions {
  /** 1..255, unique per device in a room */
  deviceId: number;
  /** TDMA slot count (players using the channel); 1 = free-for-all */
  slots?: number;
  slotMs?: number;
  volume?: number;
}

export class AcousticTransport implements Transport {
  private message = new Emitter<[PeerId, Uint8Array]>();
  private peerJoin = new Emitter<[PeerId]>();
  private peerLeave = new Emitter<[PeerId]>();
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private demods: { set: number; demod: Demodulator }[] = [];
  private seenPeers = new Set<number>();
  private reassembly = new Map<string, Uint8Array[]>();
  private queue: Uint8Array[] = [];
  private sending = false;
  private txUntil = 0;
  private pinnedSet: number | null = null;
  private seq = 0;
  private stream: MediaStream | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private closed = false;

  constructor(private opts: AcousticOptions) {}

  caps(): TransportCaps {
    return { bandwidth: 250, latencyMs: 300, broadcast: true, halfDuplex: true };
  }

  /** Must be called from a user gesture (browser audio policy). */
  async start(listen = true): Promise<void> {
    this.ctx = new AudioContext({ sampleRate: 48000 });
    await this.ctx.resume();
    this.gain = this.ctx.createGain();
    this.gain.gain.value = this.opts.volume ?? 0.9;
    this.gain.connect(this.ctx.destination);
    if (listen) await this.startListening();
  }

  private async startListening(): Promise<void> {
    if (!this.ctx) throw new Error('start() first');
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false, noiseSuppression: false, autoGainControl: false,
        channelCount: 1,
      },
    });
    const fs = this.ctx.sampleRate;
    this.demods = TONE_SETS.map((_, set) => ({ set, demod: new Demodulator(defaultModemConfig(fs, set)) }));

    // Tiny worklet that forwards raw input blocks to the main thread, where
    // the (pure, testable) Demodulator runs. Inlined as a blob so bundlers
    // need no special worklet handling.
    const workletSrc = `
      registerProcessor('sr-tap', class extends AudioWorkletProcessor {
        process(inputs) {
          const ch = inputs[0] && inputs[0][0];
          if (ch) this.port.postMessage(ch.slice(0));
          return true;
        }
      });`;
    const url = URL.createObjectURL(new Blob([workletSrc], { type: 'application/javascript' }));
    await this.ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.workletNode = new AudioWorkletNode(this.ctx, 'sr-tap');
    src.connect(this.workletNode);
    this.workletNode.port.onmessage = (e: MessageEvent<Float32Array>) => {
      if (this.closed) return;
      if (performance.now() < this.txUntil) return; // half-duplex mute
      for (const { set, demod } of this.demods) {
        if (this.pinnedSet !== null && set !== this.pinnedSet) continue;
        for (const frame of demod.push(e.data)) this.onFrame(set, frame.sender, frame.payload);
      }
    };
  }

  /** lock RX/TX to one tone set once it is known to work on this pairing */
  pinToneSet(set: number): void { this.pinnedSet = set; }

  private onFrame(set: number, sender: number, payload: Uint8Array): void {
    if (sender === this.opts.deviceId) return;
    if (this.pinnedSet === null) this.pinnedSet = set;
    if (!this.seenPeers.has(sender)) {
      this.seenPeers.add(sender);
      this.peerJoin.emit(String(sender));
    }
    if (payload.length < FRAG_HEADER) return;
    const seq = payload[0] & 0x7f, more = !!(payload[0] & 0x80), idx = payload[1];
    const key = `${sender}:${seq}`;
    const parts = this.reassembly.get(key) ?? [];
    parts[idx] = payload.slice(FRAG_HEADER);
    this.reassembly.set(key, parts);
    if (!more) {
      if (parts.every(p => p !== undefined)) {
        const total = parts.reduce((n, p) => n + p.length, 0);
        const out = new Uint8Array(total);
        let o = 0;
        for (const p of parts) { out.set(p, o); o += p.length; }
        this.message.emit(String(sender), out);
      }
      this.reassembly.delete(key);
    }
  }

  send(_peer: PeerId | 'all', data: Uint8Array): void {
    // acoustic is inherently broadcast; addressing is done at the session layer
    const chunk = MAX_PAYLOAD - FRAG_HEADER;
    const seq = this.seq = (this.seq + 1) & 0x7f;
    const nFrags = Math.max(1, Math.ceil(data.length / chunk));
    for (let i = 0; i < nFrags; i++) {
      const more = i < nFrags - 1 ? 0x80 : 0;
      const part = data.subarray(i * chunk, Math.min(data.length, (i + 1) * chunk));
      const payload = new Uint8Array(FRAG_HEADER + part.length);
      payload[0] = seq | more;
      payload[1] = i;
      payload.set(part, FRAG_HEADER);
      this.queue.push(payload);
    }
    void this.pump();
  }

  /**
   * Repeatedly broadcast a small payload (e.g. the room code) — the pairing
   * beacon. Goes through the normal framed send path, which alternates tone
   * sets while unpinned (calibration). Returns a stop function.
   */
  beacon(payload: Uint8Array, intervalMs = 1400): () => void {
    const tick = () => {
      if (this.queue.length === 0 && !this.sending) this.send('all', payload);
    };
    tick();
    const timer = setInterval(tick, intervalMs);
    return () => clearInterval(timer);
  }

  private async pump(): Promise<void> {
    if (this.sending || !this.ctx) return;
    this.sending = true;
    try {
      while (this.queue.length > 0 && !this.closed) {
        await this.waitForSlot();
        const payload = this.queue.shift()!;
        const set = this.pinnedSet ?? 0;
        await this.playFrame(payload, set);
        if (this.pinnedSet === null) await this.playFrame(payload, 1); // calibration alternate
      }
    } finally {
      this.sending = false;
    }
  }

  /** TDMA: wait for our slot (docs/arb_sim.py) when >2 devices share the channel */
  private async waitForSlot(): Promise<void> {
    const slots = this.opts.slots ?? 1;
    if (slots <= 1) return;
    const slotMs = this.opts.slotMs ?? 120;
    const mySlot = this.opts.deviceId % slots;
    for (;;) {
      const pos = Math.floor(performance.now() / slotMs) % slots;
      if (pos === mySlot) return;
      const wait = ((mySlot - pos + slots) % slots) * slotMs - (performance.now() % slotMs);
      await new Promise(r => setTimeout(r, Math.max(1, wait)));
    }
  }

  private playFrame(payload: Uint8Array, set: number): Promise<void> {
    const ctx = this.ctx!;
    const cfg: ModemConfig = defaultModemConfig(ctx.sampleRate, set);
    const samples = encodeFrame(cfg, this.opts.deviceId, payload);
    const buf = ctx.createBuffer(1, samples.length, ctx.sampleRate);
    buf.copyToChannel(new Float32Array(samples), 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.gain!);
    const durMs = (samples.length / ctx.sampleRate) * 1000;
    this.txUntil = performance.now() + durMs + 60; // mute own RX + small tail
    return new Promise(resolve => {
      src.onended = () => resolve();
      src.start();
    });
  }

  onMessage(cb: (peer: PeerId, data: Uint8Array) => void): void { this.message.on(cb); }
  onPeerJoin(cb: (peer: PeerId) => void): void { this.peerJoin.on(cb); }
  onPeerLeave(cb: (peer: PeerId) => void): void { this.peerLeave.on(cb); }

  close(): void {
    this.closed = true;
    this.queue.length = 0;
    this.workletNode?.disconnect();
    this.stream?.getTracks().forEach(t => t.stop());
    void this.ctx?.close();
  }
}

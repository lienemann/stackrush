/**
 * Transport abstraction (docs/ARCHITECTURE.md). Every transport carries opaque
 * binary frames between peers; the session layer on top speaks JSON messages.
 *
 * caps() lets the session adapt: the acoustic modem is half-duplex and slow,
 * so the host batches state broadcasts; WebRTC is full-duplex and fast.
 */
export type PeerId = string;

export interface TransportCaps {
  /** approximate goodput, bytes/s */
  bandwidth: number;
  /** typical one-way latency, ms */
  latencyMs: number;
  /** true if send('all') reaches every peer in one emission */
  broadcast: boolean;
  /** true if sending blocks receiving (acoustic) */
  halfDuplex: boolean;
}

export interface Transport {
  caps(): TransportCaps;
  send(peer: PeerId | 'all', data: Uint8Array): void;
  onMessage(cb: (peer: PeerId, data: Uint8Array) => void): void;
  /** peer lifecycle — optional (loopback pairs are static) */
  onPeerJoin(cb: (peer: PeerId) => void): void;
  onPeerLeave(cb: (peer: PeerId) => void): void;
  close(): void;
}

/** tiny multi-listener helper */
export class Emitter<A extends unknown[]> {
  private cbs: Array<(...a: A) => void> = [];
  on(cb: (...a: A) => void): void { this.cbs.push(cb); }
  emit(...a: A): void { for (const cb of this.cbs) cb(...a); }
}

export const encodeMsg = <T = unknown>(msg: T): Uint8Array =>
  new TextEncoder().encode(JSON.stringify(msg));

export const decodeMsg = <T = unknown>(data: Uint8Array): T =>
  JSON.parse(new TextDecoder().decode(data)) as T;

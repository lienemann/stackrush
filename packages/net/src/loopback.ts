import { Emitter, PeerId, Transport, TransportCaps } from './transport.js';

/**
 * In-memory transport for tests and single-device play. A LoopbackHub links
 * n endpoints; each endpoint sees the others as peers. Optional artificial
 * latency for exercising the Arbiter window in tests.
 */
export class LoopbackHub {
  private endpoints = new Map<PeerId, LoopbackEndpoint>();
  constructor(readonly latencyMs = 0) {}

  endpoint(id: PeerId): LoopbackEndpoint {
    const ep = new LoopbackEndpoint(this, id);
    for (const other of this.endpoints.values()) {
      other.peerJoin.emit(id);
      ep.peerJoin.emit(other.id);
    }
    this.endpoints.set(id, ep);
    return ep;
  }

  deliver(from: PeerId, to: PeerId | 'all', data: Uint8Array): void {
    const send = (ep: LoopbackEndpoint) => {
      const run = () => ep.message.emit(from, data);
      this.latencyMs > 0 ? setTimeout(run, this.latencyMs) : queueMicrotask(run);
    };
    for (const [id, ep] of this.endpoints) {
      if (id === from) continue;
      if (to === 'all' || to === id) send(ep);
    }
  }

  remove(id: PeerId): void {
    if (!this.endpoints.delete(id)) return;
    for (const ep of this.endpoints.values()) ep.peerLeave.emit(id);
  }
}

export class LoopbackEndpoint implements Transport {
  readonly message = new Emitter<[PeerId, Uint8Array]>();
  readonly peerJoin = new Emitter<[PeerId]>();
  readonly peerLeave = new Emitter<[PeerId]>();

  constructor(private hub: LoopbackHub, readonly id: PeerId) {}

  caps(): TransportCaps {
    return { bandwidth: 1e9, latencyMs: this.hub.latencyMs, broadcast: true, halfDuplex: false };
  }
  send(peer: PeerId | 'all', data: Uint8Array): void { this.hub.deliver(this.id, peer, data); }
  onMessage(cb: (peer: PeerId, data: Uint8Array) => void): void { this.message.on(cb); }
  onPeerJoin(cb: (peer: PeerId) => void): void { this.peerJoin.on(cb); }
  onPeerLeave(cb: (peer: PeerId) => void): void { this.peerLeave.on(cb); }
  close(): void { this.hub.remove(this.id); }
}

import { joinRoom, selfId } from 'trystero';
import type { MessageAction, Room } from 'trystero';
import { Emitter, PeerId, Transport, TransportCaps } from './transport.js';

/**
 * Primary transport: WebRTC data channels with serverless signaling via
 * public infrastructure (Trystero, default strategy). Only a room code is
 * shared between players; LAN peers connect directly after signaling.
 */
const APP_ID = 'stackrush-v1';

export class TrysteroTransport implements Transport {
  private room: Room;
  private action: MessageAction<Uint8Array>;
  private message = new Emitter<[PeerId, Uint8Array]>();
  private peerJoin = new Emitter<[PeerId]>();
  private peerLeave = new Emitter<[PeerId]>();
  readonly selfId: PeerId = selfId;

  constructor(roomCode: string, opts: { password?: string } = {}) {
    this.room = joinRoom({ appId: APP_ID, password: opts.password }, roomCode.toUpperCase());
    this.action = this.room.makeAction<Uint8Array>('d');
    this.action.onMessage = (data, ctx) => this.message.emit(ctx.peerId, new Uint8Array(data as Uint8Array));
    this.room.onPeerJoin = peer => this.peerJoin.emit(peer);
    this.room.onPeerLeave = peer => this.peerLeave.emit(peer);
  }

  caps(): TransportCaps {
    return { bandwidth: 1e6, latencyMs: 30, broadcast: true, halfDuplex: false };
  }
  send(peer: PeerId | 'all', data: Uint8Array): void {
    void this.action.send(data, peer === 'all' ? undefined : { target: peer }).catch(() => {
      /* peer gone mid-send — the session layer notices via onPeerLeave */
    });
  }
  onMessage(cb: (peer: PeerId, data: Uint8Array) => void): void { this.message.on(cb); }
  onPeerJoin(cb: (peer: PeerId) => void): void { this.peerJoin.on(cb); }
  onPeerLeave(cb: (peer: PeerId) => void): void { this.peerLeave.on(cb); }

  /** continuous RTT probe for the Arbiter window (trystero built-in ping) */
  async ping(peer: PeerId): Promise<number> { return this.room.ping(peer); }

  close(): void { void this.room.leave(); }
}

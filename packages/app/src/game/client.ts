import { Action, GameState, Rejection, apply } from '@stackrush/core';
import { Transport, decodeMsg, encodeMsg } from '@stackrush/net';
import { ClientMsg, HostMsg, LobbyState } from './protocol.js';

/**
 * Client side of the data flow (docs/ARCHITECTURE.md):
 *   tap -> intent { action, stateVersion, reactionMs } -> host
 *   optimistic render immediately; confirm or roll back on the next state.
 *
 * reactionMs = tapTime − renderTime[enablingVersion]: the UI stamps each
 * authoritative version with the requestAnimationFrame timestamp right after
 * painting it (markRendered). No clock sync — only local deltas travel.
 */

export interface ClientEvents {
  lobby: (lobby: LobbyState) => void;
  state: () => void;
  /** an optimistic action was rolled back (lost race or stale) */
  rollback: (action: Action) => void;
  /** join refused: game already running, or not enough free seats */
  refused: (reason: 'started' | 'seats', free: number) => void;
  hostGone: () => void;
}

interface Pending { id: string; action: Action; sentAt: number }

const PENDING_TIMEOUT_MS = 3000;

export class ClientSession {
  lobby: LobbyState | null = null;
  /** host-declared pause (freezes input UI) */
  paused = false;
  private authoritative: GameState | null = null;
  private authoritativeVersion = 0;
  private pending: Pending[] = [];
  private renderTimes = new Map<number, number>();
  private displayCache: GameState | null = null;
  private listeners: Partial<ClientEvents> = {};
  private seq = 0;

  constructor(private transport: Transport, readonly deviceKey: string) {
    transport.onMessage((_peer, data) => this.onMessage(decodeMsg<HostMsg>(data)));
    transport.onPeerLeave(() => this.listeners.hostGone?.());
  }

  on<K extends keyof ClientEvents>(ev: K, cb: ClientEvents[K]): void {
    this.listeners[ev] = cb;
  }

  hello(seatNames: string[]): void {
    this.send({ t: 'hello', deviceKey: this.deviceKey, seats: seatNames });
  }

  private send(msg: ClientMsg): void {
    this.transport.send('all', encodeMsg(msg)); // only the host listens
  }

  private onMessage(msg: HostMsg): void {
    switch (msg.t) {
      case 'lobby':
        this.lobby = msg.lobby;
        if (!msg.lobby.started) {
          // back in the lobby: the previous game's state is gone
          this.authoritative = null;
          this.pending = [];
          this.displayCache = null;
        }
        this.listeners.lobby?.(msg.lobby);
        return;
      case 'ping':
        this.send({ t: 'pong', id: msg.id });
        return;
      case 'full':
        this.listeners.refused?.(msg.reason ?? 'seats', msg.free ?? 0);
        return;
      case 'reject': {
        const idx = this.pending.findIndex(p => p.id === msg.id);
        if (idx >= 0) {
          const [p] = this.pending.splice(idx, 1);
          this.invalidate();
          this.listeners.rollback?.(p.action);
          this.listeners.state?.();
        }
        return;
      }
      case 'state': {
        this.paused = msg.paused ?? false;
        if (msg.version <= this.authoritativeVersion) {
          this.listeners.state?.(); // pause toggles rebroadcast the same version
          return;
        }
        this.authoritative = msg.state;
        this.authoritativeVersion = msg.version;
        // confirmed intents leave the pending list silently; the rest are
        // re-validated in order against the new truth — what no longer fits
        // rolls back (lost race: silent shake, no modal)
        const now = performance.now();
        const kept: Pending[] = [];
        let folded = this.authoritative;
        for (const p of this.pending) {
          if (msg.acceptedIds.includes(p.id)) continue;
          if (now - p.sentAt > PENDING_TIMEOUT_MS) {
            this.listeners.rollback?.(p.action);
            continue;
          }
          const res = apply(folded, p.action);
          if (res.ok) {
            folded = res.state;
            kept.push(p);
          } else {
            this.listeners.rollback?.(p.action);
          }
        }
        this.pending = kept;
        this.invalidate();
        this.listeners.state?.();
        return;
      }
    }
  }

  /** authoritative state with pending optimistic actions folded on top */
  private foldPending(base: GameState): GameState {
    let s = base;
    for (const p of this.pending) {
      const res = apply(s, p.action);
      if (res.ok) s = res.state;
    }
    return s;
  }

  get version(): number { return this.authoritativeVersion; }

  displayState(): GameState | null {
    if (!this.authoritative) return null;
    if (!this.displayCache) this.displayCache = this.foldPending(this.authoritative);
    return this.displayCache;
  }

  private invalidate(): void { this.displayCache = null; }

  /** UI calls this from requestAnimationFrame right after painting a version */
  markRendered(version: number, timestamp: number): void {
    if (!this.renderTimes.has(version)) {
      this.renderTimes.set(version, timestamp);
      if (this.renderTimes.size > 128) {
        const oldest = this.renderTimes.keys().next().value;
        if (oldest !== undefined) this.renderTimes.delete(oldest);
      }
    }
  }

  /**
   * Optimistically apply + send an intent. Returns null on success or the
   * rejection reason for an illegal tap (UI shows the cannotPlayHere toast —
   * lost races later are silent rollbacks instead).
   */
  submit(action: Action, tapTime = performance.now()): Rejection | null {
    const display = this.displayState();
    if (!display) return 'notPlaying';
    const res = apply(display, action);
    if (!res.ok) return res.reason;
    const renderedAt = this.renderTimes.get(this.authoritativeVersion) ?? tapTime;
    const id = `${this.deviceKey}-${++this.seq}`;
    this.pending.push({ id, action, sentAt: tapTime });
    this.displayCache = res.state;
    this.send({
      t: 'intent',
      id,
      action,
      stateVersion: this.authoritativeVersion,
      reactionMs: Math.max(0, tapTime - renderedAt),
    });
    this.listeners.state?.();
    return null;
  }

  close(): void { this.transport.close(); }
}

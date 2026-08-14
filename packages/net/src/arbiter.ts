import { Action } from '../../core/src/types.js';

/**
 * Reaction-time arbitration (see docs/ARCHITECTURE.md, "Latency & fairness").
 *
 * Every intent carries the client's locally measured reaction time:
 *   reactionMs = tapTime − renderTime(stateVersion that enabled the move)
 * No clock sync required — only local deltas are compared. The host buffers
 * intents per conflict group for a collection window and releases them ordered
 * by ascending reactionMs; the engine then applies them in that order and
 * rejects losers naturally (wrongValue/pileFull).
 *
 * The window is sized adaptively from continuously measured per-peer RTTs:
 *   window = clamp(p95(oneWay) + margin, min, max)
 * Host-seated players enjoy no advantage: their intents wait for the same window.
 *
 * Trust model: clients self-report reactionMs (fine for friendly play; a
 * hostile client could lie — documented, not defended).
 */

export interface Intent {
  action: Action;
  /** state version whose render enabled this move (engine event counter) */
  stateVersion: number;
  /** locally measured tap − render delta, ms */
  reactionMs: number;
  /** arbitrary sender id (peer or local seat) */
  sender: string;
}

export interface ArbiterOptions {
  minWindowMs?: number;   // default 40
  maxWindowMs?: number;   // default 400
  marginMs?: number;      // default 30
}

/** Conflict group: intents targeting the same center pile (or 'new' of same color) */
function groupKey(i: Intent): string {
  const a = i.action;
  if (a.type === 'playToCenter') return `c:${String(a.pile)}:${i.stateVersion}`;
  return `solo:${i.sender}:${Math.random()}`; // non-conflicting actions pass through
}

interface Group { due: number; intents: Intent[] }

export class Arbiter {
  private groups = new Map<string, Group>();
  private rtts = new Map<string, number[]>();
  private opts: Required<ArbiterOptions>;

  constructor(opts: ArbiterOptions = {}) {
    this.opts = { minWindowMs: 40, maxWindowMs: 400, marginMs: 30, ...opts };
  }

  /** Feed continuous RTT measurements (piggybacked pings), ms */
  updateRtt(sender: string, rttMs: number): void {
    const a = this.rtts.get(sender) ?? [];
    a.push(rttMs);
    if (a.length > 50) a.shift();
    this.rtts.set(sender, a);
  }

  /** Current collection window from p95 one-way latency across peers */
  windowMs(): number {
    let p95 = 0;
    for (const a of this.rtts.values()) {
      const s = a.slice().sort((x, y) => x - y);
      p95 = Math.max(p95, s[Math.min(s.length - 1, Math.floor(s.length * 0.95))] / 2);
    }
    const w = p95 + this.opts.marginMs;
    return Math.min(this.opts.maxWindowMs, Math.max(this.opts.minWindowMs, w));
  }

  /** Submit an intent at host time now (ms). */
  submit(intent: Intent, now: number): void {
    const key = groupKey(intent);
    const g = this.groups.get(key);
    if (g) g.intents.push(intent);
    else this.groups.set(key, { due: now + this.windowMs(), intents: [intent] });
  }

  /**
   * Release all groups whose window expired, each ordered by ascending
   * reactionMs (ties: submission order). Host applies to the engine in order.
   */
  due(now: number): Intent[] {
    const out: Intent[] = [];
    for (const [key, g] of this.groups) {
      if (now >= g.due) {
        out.push(...g.intents.slice().sort((a, b) => a.reactionMs - b.reactionMs));
        this.groups.delete(key);
      }
    }
    return out;
  }

  /** Earliest pending deadline (for host timer scheduling), or null. */
  nextDue(): number | null {
    let min: number | null = null;
    for (const g of this.groups.values()) min = min === null ? g.due : Math.min(min, g.due);
    return min;
  }
}

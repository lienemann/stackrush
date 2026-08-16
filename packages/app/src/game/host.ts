import {
  Action, BotLevel, Config, GameState, Rejection, apply, botReactionMs, chooseBotAction,
  isDeadlock, isHardStalemate, makeConfig, newGame,
} from '@stackrush/core';
import { Arbiter, PeerId, Transport, decodeMsg, encodeMsg } from '@stackrush/net';
import { ClientMsg, HostMsg, LobbyState } from './protocol.js';

/**
 * Host authority (docs/ARCHITECTURE.md "Round/host lifecycle"):
 * owns the engine + Arbiter, broadcasts versioned state. Intents from every
 * seat — remote or on the host device itself — go through the same
 * collection window, so co-located players gain no edge.
 */

const PING_INTERVAL_MS = 2000;
const WATCHDOG_INTERVAL_MS = 1000;
const BOT_TICK_MS = 60;
/**
 * When earlyStalemate is OFF and a position is provably stuck (isHardStalemate)
 * but not yet a true deadlock, wait this long before ending — long enough for
 * players to flip through and see for themselves, and the mandatory backstop
 * for the shuffleOnRecycle=false livelock (docs/RULES-GAPS G5/G7). Slow-but-
 * playable positions never end on their own.
 */
const STUCK_GRACE_MS = 12_000;
const DEBUG_LOG_CAP = 6000;

interface PeerRef { transport: Transport; peer: PeerId }

interface BotState {
  level: BotLevel;
  /** host time at which the bot may next act (state arrival + reaction) */
  readyAt: number;
  /** the reaction it is currently "spending" — reported to the Arbiter */
  reaction: number;
  /** last state version it acted on (one tap per state, like a human) */
  actedVersion: number;
  lastActAt: number;
}

export class HostSession {
  private arbiter = new Arbiter();
  private state: GameState | null = null;
  private version = 0;
  private lobby: LobbyState;
  private peers = new Map<string, PeerRef>(); // deviceKey -> transport peer
  private peerDevice = new Map<string, string>(); // "ti:peerId" -> deviceKey
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private botTimer: ReturnType<typeof setInterval> | null = null;
  private bots = new Map<number, BotState>(); // player index -> bot driver state
  private botSeq = 0;
  private dbg: string[] = []; // JSONL debug ring buffer
  private pings = new Map<number, { deviceKey: string; sentAt: number }>();
  private pingSeq = 0;
  private lastAcceptedAt = performance.now();
  private closed = false;

  constructor(
    config: Partial<Config>,
    roomCode: string | null,
    private transports: Transport[],
  ) {
    this.lobby = {
      roomCode,
      players: [],
      config: makeConfig({ players: 2, ...config }),
      started: false,
    };
    transports.forEach((tr, ti) => {
      tr.onMessage((peer, data) => this.onMessage(ti, peer, decodeMsg<ClientMsg>(data)));
      tr.onPeerLeave(peer => this.onPeerLeave(ti, peer));
    });
    this.pingTimer = setInterval(() => this.pingAll(), PING_INTERVAL_MS);
    this.watchdog = setInterval(() => this.checkStalemate(), WATCHDOG_INTERVAL_MS);
    this.botTimer = setInterval(() => this.tickBots(), BOT_TICK_MS);
  }

  // ---------- lobby ----------

  updateConfig(patch: Partial<Config>): void {
    this.lobby.config = { ...this.lobby.config, ...patch };
    this.broadcastLobby();
  }

  /** Add a computer player (lobby only). */
  addBot(level: BotLevel): void {
    if (this.lobby.started || this.lobby.players.length >= 4) return;
    const n = this.lobby.players.filter(p => p.bot !== undefined).length + 1;
    this.lobby.players.push({ name: `🤖 ${n}·L${level}`, deviceKey: 'bot', connected: true, bot: level });
    this.broadcastLobby();
  }

  /** Remove any seat by index (lobby only) — bots, ghosts, stray duplicates. */
  removePlayer(index: number): void {
    if (this.lobby.started) return;
    const pl = this.lobby.players[index];
    if (!pl) return;
    this.lobby.players.splice(index, 1);
    this.broadcastLobby();
  }

  private onMessage(ti: number, peer: PeerId, msg: ClientMsg): void {
    const key = `${ti}:${peer}`;
    if (msg.t === 'hello') {
      const existing = this.lobby.players.filter(p => p.deviceKey === msg.deviceKey);
      if (this.lobby.started) {
        if (existing.length === 0) {
          this.transports[ti].send(peer, encodeMsg<HostMsg>({ t: 'full' }));
          return;
        }
        existing.forEach(p => (p.connected = true)); // reconnect into running game
      } else {
        // lobby: a hello is the device's CURRENT seat list — replace, don't
        // append. This keeps repeated hellos, name edits and re-joins from
        // ever duplicating players.
        const others = this.lobby.players.filter(p => p.deviceKey !== msg.deviceKey);
        if (others.length + msg.seats.length > 4) {
          this.transports[ti].send(peer, encodeMsg<HostMsg>({ t: 'full' }));
          return;
        }
        this.lobby.players = [
          ...others,
          ...msg.seats.map(name => ({ name, deviceKey: msg.deviceKey, connected: true })),
        ];
      }
      this.peers.set(msg.deviceKey, { transport: this.transports[ti], peer });
      this.peerDevice.set(key, msg.deviceKey);
      this.broadcastLobby();
      if (this.state) this.sendState(); // late joiner into a running game (reconnect)
      return;
    }
    const deviceKey = this.peerDevice.get(key);
    if (!deviceKey) return;
    if (msg.t === 'pong') {
      const p = this.pings.get(msg.id);
      if (p) {
        this.pings.delete(msg.id);
        this.arbiter.updateRtt(p.deviceKey, performance.now() - p.sentAt);
      }
      return;
    }
    if (msg.t === 'intent') {
      // seat ownership check: the acting player must sit on the sending device
      const owner = this.lobby.players[this.playerOf(msg.action)]?.deviceKey;
      if (owner !== undefined && owner !== deviceKey) return;
      this.submitIntent(deviceKey, msg);
    }
  }

  private playerOf(action: Action): number {
    return 'player' in action ? action.player : -1;
  }

  private onPeerLeave(ti: number, peer: PeerId): void {
    const deviceKey = this.peerDevice.get(`${ti}:${peer}`);
    if (!deviceKey) return;
    this.peerDevice.delete(`${ti}:${peer}`);
    // a page reload re-hellos with a NEW peer id before the OLD one's leave
    // is detected — that stale leave must not detach the re-joined device
    const current = this.peers.get(deviceKey);
    if (!current || current.peer !== peer || current.transport !== this.transports[ti]) return;
    this.peers.delete(deviceKey);
    let changed = false;
    for (const p of this.lobby.players) {
      if (p.deviceKey === deviceKey && p.connected) { p.connected = false; changed = true; }
    }
    if (!this.lobby.started && changed) {
      // in the lobby, a departed device frees its seats
      this.lobby.players = this.lobby.players.filter(p => p.deviceKey !== deviceKey);
    }
    if (changed) this.broadcastLobby();
  }

  // ---------- game flow ----------

  start(): void {
    const players = this.lobby.players.length;
    if (players < 2 || players > 4) return;
    this.lobby.config = makeConfig({ ...this.lobby.config, players });
    this.lobby.started = true;
    this.bots.clear();
    this.lobby.players.forEach((pl, i) => {
      if (pl.bot !== undefined)
        this.bots.set(i, { level: pl.bot as BotLevel, readyAt: 0, reaction: 0, actedVersion: -1, lastActAt: 0 });
    });
    this.state = newGame(this.lobby.config, this.seed());
    // monotonic across games: clients discard versions they have already seen,
    // so a restart after backToLobby must NOT reset the counter
    this.version++;
    this.lastAcceptedAt = performance.now();
    this.stuckSince = null;
    this.logLine('start', {
      config: this.lobby.config,
      players: this.lobby.players.map(p => ({ name: p.name, bot: p.bot ?? null })),
    });
    this.broadcastLobby();
    this.sendState();
  }

  nextRound(): void {
    if (!this.state || this.state.phase !== 'roundEnded') return;
    this.stuckSince = null;
    this.logLine('nextRound');
    this.applyDirect({ type: 'startNextRound', seed: this.seed() });
  }

  rematch(): void {
    if (!this.state || this.state.phase !== 'matchEnded') return;
    this.state = newGame(this.lobby.config, this.seed());
    this.version++;
    this.lastAcceptedAt = performance.now();
    this.stuckSince = null;
    this.logLine('rematch');
    this.sendState();
  }

  backToLobby(): void {
    this.state = null;
    this.lobby.started = false;
    this.broadcastLobby();
  }

  private seed(): number {
    return crypto.getRandomValues(new Uint32Array(1))[0];
  }

  /** host-initiated actions bypass the collection window (no race to win) */
  private applyDirect(action: Action): void {
    if (!this.state) return;
    const res = apply(this.state, action);
    if (res.ok) {
      const ended = res.events.find(e => e.type === 'roundEnded');
      if (ended && ended.type === 'roundEnded')
        this.logLine('roundEnd', { by: ended.by, scores: ended.scores, action: action.type });
      this.state = res.state;
      this.version++;
      this.lastAcceptedAt = performance.now();
      this.sendState();
    }
  }

  // ---------- arbitration ----------

  private submitIntent(deviceKey: string, msg: Extract<ClientMsg, { t: 'intent' }>): void {
    this.arbiter.submit(
      { action: msg.action, stateVersion: msg.stateVersion, reactionMs: msg.reactionMs, sender: `${deviceKey}#${msg.id}` },
      performance.now(),
    );
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    const due = this.arbiter.nextDue();
    if (due === null) return;
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => this.flush(), Math.max(0, due - performance.now()));
  }

  private flush(): void {
    if (!this.state || this.closed) return;
    const intents = this.arbiter.due(performance.now());
    const acceptedIds: string[] = [];
    const rejects: Array<{ deviceKey: string; id: string; reason: Rejection }> = [];
    let anyAccepted = false;
    for (const intent of intents) {
      const [deviceKey, id] = intent.sender.split('#');
      const res = apply(this.state, intent.action);
      if (res.ok) {
        this.state = res.state;
        this.version++;
        anyAccepted = true;
        acceptedIds.push(id);
        this.logLine('accept', { by: deviceKey, action: intent.action, reactionMs: Math.round(intent.reactionMs), events: res.events.map(e => e.type) });
      } else {
        rejects.push({ deviceKey, id, reason: res.reason });
        this.logLine('reject', { by: deviceKey, action: intent.action, reason: res.reason });
      }
    }
    if (anyAccepted) {
      this.lastAcceptedAt = performance.now();
      this.sendState(acceptedIds);
    }
    // rejected: silent for everyone else; the sender gets a targeted note so
    // its optimistic layer can roll back immediately instead of timing out
    for (const r of rejects) {
      const ref = this.peers.get(r.deviceKey);
      ref?.transport.send(ref.peer, encodeMsg<HostMsg>({ t: 'reject', id: r.id, reason: r.reason }));
    }
    this.scheduleFlush();
  }

  // ---------- stalemate watchdog (G7/G10) ----------

  private stuckSince: number | null = null;

  /**
   * A round ends by itself only when it is genuinely over — NOT merely because
   * players are deliberating. A true deadlock (nobody can even flip) ends at
   * once. A position the host can prove is stuck (isHardStalemate, using hidden
   * cards) ends immediately when earlyStalemate is on, otherwise only after a
   * grace period so players discover it themselves (and as the mandatory
   * livelock backstop). Slow-but-playable positions never trigger an end.
   */
  private checkStalemate(): void {
    if (!this.state || this.state.phase !== 'playing') return;
    const now = performance.now();
    if (isDeadlock(this.state)) {
      this.logLine('stalemate', { why: 'deadlock', snapshot: this.snapshot() });
      this.applyDirect({ type: 'endRoundStalemate' });
      return;
    }
    if (isHardStalemate(this.state)) {
      if (this.state.config.earlyStalemate) {
        this.logLine('stalemate', { why: 'earlyHard', snapshot: this.snapshot() });
        this.applyDirect({ type: 'endRoundStalemate' });
        return;
      }
      this.stuckSince ??= now;
      if (now - this.stuckSince > STUCK_GRACE_MS) {
        this.logLine('stalemate', { why: 'grace', stuckMs: Math.round(now - this.stuckSince), snapshot: this.snapshot() });
        this.applyDirect({ type: 'endRoundStalemate' });
      }
      return;
    }
    this.stuckSince = null; // playable again
  }

  // ---------- debug log (JSONL) ----------

  private logLine(kind: string, data: Record<string, unknown> = {}): void {
    this.dbg.push(JSON.stringify({ t: Math.round(performance.now()), v: this.version, round: this.state?.round, kind, ...data }));
    if (this.dbg.length > DEBUG_LOG_CAP) this.dbg.shift();
  }

  /** compact, spoiler-free-per-line snapshot for diagnosing round ends */
  private snapshot(): unknown {
    if (!this.state) return null;
    return {
      earlyStalemate: this.state.config.earlyStalemate,
      quickToCenter: this.state.config.quickToCenter,
      center: this.state.center.map(p => ({ color: p.color, height: p.height })),
      players: this.state.players.map(p => ({
        rowTops: p.row.map(st => st[0] ? `${st[0].color}:${st[0].value}` : null),
        quick: p.quick.length, hand: p.hand.length, waste: p.waste.length,
        wasteTop: p.waste[0] ? `${p.waste[0].color}:${p.waste[0].value}` : null,
      })),
    };
  }

  /** the whole session log as JSONL text (for the download button) */
  debugLogJSONL(): string {
    return this.dbg.join('\n') + (this.dbg.length ? '\n' : '');
  }

  // ---------- IO ----------

  private pingAll(): void {
    for (const [deviceKey, ref] of this.peers) {
      const id = ++this.pingSeq;
      this.pings.set(id, { deviceKey, sentAt: performance.now() });
      ref.transport.send(ref.peer, encodeMsg<HostMsg>({ t: 'ping', id }));
      if (this.pings.size > 64) {
        const oldest = this.pings.keys().next().value;
        if (oldest !== undefined) this.pings.delete(oldest);
      }
    }
  }

  private broadcast(msg: HostMsg): void {
    const data = encodeMsg(msg);
    for (const tr of this.transports) tr.send('all', data);
  }

  private broadcastLobby(): void {
    this.broadcast({ t: 'lobby', lobby: this.lobby });
  }

  private sendState(acceptedIds: string[] = []): void {
    if (!this.state) return;
    this.broadcast({ t: 'state', version: this.version, state: this.state, acceptedIds });
    // a new state enables new moves — arm each bot's reaction clock for it
    const now = performance.now();
    for (const bs of this.bots.values()) {
      bs.reaction = botReactionMs(bs.level, Math.random);
      bs.readyAt = now + bs.reaction;
    }
  }

  // ---------- bot driver ----------

  /**
   * One tap per bot per state, after its (level-derived) reaction delay. The
   * intent carries that same reaction, so faster bots win reaction-time races
   * against slower bots and humans exactly as a quick human would.
   */
  private tickBots(): void {
    if (!this.state || this.state.phase !== 'playing' || this.bots.size === 0) return;
    const now = performance.now();
    for (const [player, bs] of this.bots) {
      if (now < bs.readyAt) continue;
      // one action per state version; retry after a short idle if nothing moved
      if (bs.actedVersion === this.version && now - bs.lastActAt < 1500) continue;
      const action = chooseBotAction(this.state, player, bs.level, Math.random);
      if (!action) { bs.readyAt = now + 300; continue; }
      this.arbiter.submit(
        { action, stateVersion: this.version, reactionMs: Math.max(0, bs.reaction), sender: `bot#${player}#${++this.botSeq}` },
        now,
      );
      this.scheduleFlush();
      bs.actedVersion = this.version;
      bs.lastActAt = now;
      bs.readyAt = now + botReactionMs(bs.level, Math.random);
    }
  }

  close(): void {
    this.closed = true;
    if (this.flushTimer) clearTimeout(this.flushTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.watchdog) clearInterval(this.watchdog);
    if (this.botTimer) clearInterval(this.botTimer);
    for (const tr of this.transports) tr.close();
  }
}

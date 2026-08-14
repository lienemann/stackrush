import {
  Action, BotLevel, Config, GameState, Rejection, apply, botReactionMs, chooseBotAction,
  isHardStalemate, makeConfig, newGame,
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
/** G5/G7: mandatory inactivity timeout — a livelock is reachable by rule */
const STALEMATE_TIMEOUT_MS = 10_000;

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

  /** Remove a seat by index (lobby only; humans free their seats by leaving). */
  removePlayer(index: number): void {
    if (this.lobby.started) return;
    const pl = this.lobby.players[index];
    if (!pl || pl.bot === undefined) return; // only bot seats are host-removable
    this.lobby.players.splice(index, 1);
    this.broadcastLobby();
  }

  private onMessage(ti: number, peer: PeerId, msg: ClientMsg): void {
    const key = `${ti}:${peer}`;
    if (msg.t === 'hello') {
      const existing = this.lobby.players.filter(p => p.deviceKey === msg.deviceKey);
      if (existing.length > 0) {
        // reconnect: re-attach the device to its seats
        existing.forEach(p => (p.connected = true));
      } else {
        if (this.lobby.started ||
            this.lobby.players.length + msg.seats.length > 4) {
          this.transports[ti].send(peer, encodeMsg<HostMsg>({ t: 'full' }));
          return;
        }
        for (const name of msg.seats)
          this.lobby.players.push({ name, deviceKey: msg.deviceKey, connected: true });
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
    this.version = 1;
    this.lastAcceptedAt = performance.now();
    this.broadcastLobby();
    this.sendState();
  }

  nextRound(): void {
    if (!this.state || this.state.phase !== 'roundEnded') return;
    this.applyDirect({ type: 'startNextRound', seed: this.seed() });
  }

  rematch(): void {
    if (!this.state || this.state.phase !== 'matchEnded') return;
    this.state = newGame(this.lobby.config, this.seed());
    this.version++;
    this.lastAcceptedAt = performance.now();
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
      } else {
        rejects.push({ deviceKey, id, reason: res.reason });
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

  // ---------- stalemate watchdog (G7) ----------

  private checkStalemate(): void {
    if (!this.state || this.state.phase !== 'playing') return;
    const inactive = performance.now() - this.lastAcceptedAt > STALEMATE_TIMEOUT_MS;
    if (inactive || isHardStalemate(this.state)) {
      this.applyDirect({ type: 'endRoundStalemate' });
    }
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

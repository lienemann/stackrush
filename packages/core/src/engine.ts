import {
  Action, Card, Color, COLORS, Config, GameState, Event,
  MAX_VALUE, PlayerState, Result, Source,
} from './types.js';

/** Deterministic PRNG (mulberry32) */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function defaultRowSize(players: number): number {
  return players === 2 ? 5 : players === 3 ? 4 : 3;
}

export function makeConfig(partial: Partial<Config> & { players: number }): Config {
  return {
    rowSize: defaultRowSize(partial.players),
    targetRounds: 1,
    proVariant: false,
    proDescendingStep: 'any',
    proAllowEmptySlot: false,
    autoRefillRow: true,
    roundEndMode: 'auto',
    shuffleOnRecycle: true,
    quickToCenter: false,
    earlyStalemate: false,
    ...partial,
  };
}

function deck(owner: number): Card[] {
  const cards: Card[] = [];
  for (const color of COLORS)
    for (let value = 1; value <= MAX_VALUE; value++)
      cards.push({ color, value, owner });
  return cards;
}

function dealPlayer(owner: number, cfg: Config, rand: () => number): PlayerState {
  const cards = shuffle(deck(owner), rand);
  return {
    row: cards.slice(0, cfg.rowSize).map(c => [c]),
    quick: cards.slice(cfg.rowSize, cfg.rowSize + 10),
    hand: cards.slice(cfg.rowSize + 10),
    waste: [],
    shuffles: 0,
  };
}

export function newGame(cfg: Config, seed: number): GameState {
  const rand = rng(seed);
  return {
    config: cfg,
    phase: 'playing',
    round: 1,
    players: Array.from({ length: cfg.players }, (_, i) => dealPlayer(i, cfg, rand)),
    center: [],
    roundEndedBy: -1,
    roundScores: [],
    totals: new Array(cfg.players).fill(0),
  };
}

// ---------- Helpers ----------

const clone = (s: GameState): GameState => structuredClone(s);

function peek(p: PlayerState, src: Source): Card | null {
  switch (src.kind) {
    case 'row': return p.row[src.slot]?.[0] ?? null;
    case 'quick': return p.quick[0] ?? null;
    case 'waste': return p.waste[0] ?? null;
  }
}

function take(p: PlayerState, src: Source): Card {
  switch (src.kind) {
    case 'row': return p.row[src.slot].shift()!;
    case 'quick': return p.quick.shift()!;
    case 'waste': return p.waste.shift()!;
  }
}

function refillEmptySlots(s: GameState, player: number, events: Event[]): void {
  const p = s.players[player];
  for (let slot = 0; slot < p.row.length; slot++) {
    if (p.row[slot].length === 0 && p.quick.length > 0) {
      p.row[slot].push(p.quick.shift()!);
      events.push({ type: 'rowRefilled', player, slot });
    }
  }
}

function afterQuickChange(s: GameState, player: number, events: Event[]): void {
  const p = s.players[player];
  if (p.quick.length !== 0) return;
  if (s.config.roundEndMode === 'auto') endRound(s, player, events);
  else events.push({ type: 'quickEmptied', player });
}

function endRound(s: GameState, by: number, events: Event[]): void {
  s.phase = 'roundEnded';
  s.roundEndedBy = by;
  const scores = scoreRound(s);
  s.roundScores.push(scores);
  scores.forEach((v, i) => (s.totals[i] += v));
  events.push({ type: 'roundEnded', by, scores });
  if (s.roundScores.length >= s.config.targetRounds) {
    s.phase = 'matchEnded';
    events.push({ type: 'matchEnded', totals: s.totals.slice() });
  }
}

/** +1 per own card in the center, −2 per card left in the quick pile */
export function scoreRound(s: GameState): number[] {
  const scores = new Array(s.config.players).fill(0);
  for (const pile of s.center)
    for (const owner of pile.owners) scores[owner] += 1;
  s.players.forEach((p, i) => (scores[i] -= 2 * p.quick.length));
  return scores;
}

export function matchWinners(s: GameState): number[] {
  const max = Math.max(...s.totals);
  return s.totals.flatMap((t, i) => (t === max ? [i] : []));
}

/** Checks the pro-variant placement condition of card onto top (G3) */
function proFits(cfg: Config, card: Card, top: Card): boolean {
  if (card.color === top.color) return false;
  return cfg.proDescendingStep === 'one'
    ? card.value === top.value - 1
    : card.value < top.value;
}

// ---------- Reducer ----------

export function apply(state: GameState, action: Action): Result {
  if (action.type === 'startNextRound') {
    if (state.phase !== 'roundEnded') return { ok: false, reason: 'notPlaying' };
    const s = clone(state);
    const rand = rng(action.seed);
    s.players = Array.from({ length: s.config.players }, (_, i) => dealPlayer(i, s.config, rand));
    s.center = [];
    s.round += 1;
    s.roundEndedBy = -1;
    s.phase = 'playing';
    return { ok: true, state: s, events: [] };
  }

  if (state.phase !== 'playing') return { ok: false, reason: 'notPlaying' };

  if (action.type === 'endRoundStalemate') {
    const s = clone(state);
    const events: Event[] = [];
    endRound(s, -1, events);
    return { ok: true, state: s, events };
  }

  if (action.player < 0 || action.player >= state.config.players)
    return { ok: false, reason: 'badPlayer' };

  const s = clone(state);
  const p = s.players[action.player];
  const events: Event[] = [];

  switch (action.type) {
    case 'playToCenter': {
      if (action.source.kind === 'row' &&
          (action.source.slot < 0 || action.source.slot >= p.row.length))
        return { ok: false, reason: 'badSlot' };
      if (action.source.kind === 'quick' && !s.config.quickToCenter)
        return { ok: false, reason: 'quickLocked' };   // G9
      const card = peek(p, action.source);
      if (!card) return { ok: false, reason: 'emptySource' };

      let pileIdx: number;
      if (action.pile === 'new') {
        if (card.value !== 1) return { ok: false, reason: 'needValueOne' };
        s.center.push({ color: card.color, height: 0, owners: [] });
        pileIdx = s.center.length - 1;
        events.push({ type: 'newPile', pile: pileIdx });
      } else {
        const pile = s.center[action.pile];
        if (!pile) return { ok: false, reason: 'noSuchPile' };
        if (pile.height >= MAX_VALUE) return { ok: false, reason: 'pileFull' };
        if (pile.color !== card.color) return { ok: false, reason: 'wrongColor' };
        if (card.value !== pile.height + 1) return { ok: false, reason: 'wrongValue' };
        pileIdx = action.pile;
      }

      take(p, action.source);
      const pile = s.center[pileIdx];
      pile.height = card.value;
      pile.owners.push(card.owner);
      events.push({ type: 'cardPlayed', player: action.player, card, pile: pileIdx });

      if (action.source.kind === 'row' && s.config.autoRefillRow)
        refillEmptySlots(s, action.player, events);
      afterQuickChange(s, action.player, events);
      return { ok: true, state: s, events };
    }

    case 'flipHand': {
      if (p.hand.length === 0) {
        if (p.waste.length === 0) return { ok: false, reason: 'handEmpty' };
        p.shuffles += 1;
        if (s.config.shuffleOnRecycle) {
          const seed = (s.round * 7919 + action.player * 104729 +
                        p.waste.length * 31 + p.shuffles * 2654435761) >>> 0;
          p.hand = shuffle(p.waste, rng(seed));
        } else {
          // Flip only: turn the face-up waste over -> former bottom card ends up on top
          p.hand = p.waste.slice().reverse();
        }
        p.waste = [];
        events.push({ type: 'wasteRecycled', player: action.player });
      }
      const n = Math.min(3, p.hand.length);
      const flipped = p.hand.splice(0, n).reverse(); // flipped as a packet of 3
      p.waste.unshift(...flipped);
      events.push({ type: 'handFlipped', player: action.player, count: n });
      return { ok: true, state: s, events };
    }

    case 'playToRow': {
      if (!s.config.proVariant) return { ok: false, reason: 'notProVariant' };
      if (action.slot < 0 || action.slot >= p.row.length)
        return { ok: false, reason: 'badSlot' };
      const card = peek(p, action.source);
      if (!card) return { ok: false, reason: 'emptySource' };
      const stack = p.row[action.slot];
      if (stack.length === 0) {
        if (!s.config.proAllowEmptySlot) return { ok: false, reason: 'emptySlotForbidden' };
      } else if (!proFits(s.config, card, stack[0])) {
        return { ok: false, reason: card.color === stack[0]?.color ? 'wrongColor' : 'wrongValue' };
      }
      take(p, action.source);
      stack.unshift(card);
      events.push({ type: 'cardToRow', player: action.player, card, slot: action.slot });
      afterQuickChange(s, action.player, events);
      return { ok: true, state: s, events };
    }

    case 'refillRow': {
      if (s.config.autoRefillRow) return { ok: false, reason: 'autoRefillActive' };
      if (action.slot < 0 || action.slot >= p.row.length)
        return { ok: false, reason: 'badSlot' };
      if (p.row[action.slot].length !== 0) return { ok: false, reason: 'slotNotEmpty' };
      if (p.quick.length === 0) return { ok: false, reason: 'quickEmpty' };
      p.row[action.slot].push(p.quick.shift()!);
      events.push({ type: 'rowRefilled', player: action.player, slot: action.slot });
      afterQuickChange(s, action.player, events);
      return { ok: true, state: s, events };
    }

    case 'callStop': {
      if (s.config.roundEndMode !== 'call') return { ok: false, reason: 'wrongMode' };
      if (p.quick.length !== 0) return { ok: false, reason: 'quickNotEmpty' };
      endRound(s, action.player, events);
      return { ok: true, state: s, events };
    }
  }
}

// ---------- Stalemate detection ----------

function centerFits(s: GameState, c: Card): boolean {
  return c.value === 1 ||
    s.center.some(pl => pl.color === c.color && pl.height + 1 === c.value && pl.height < MAX_VALUE);
}

/** cards that could legally move to the center right now (G9-aware) */
function visibleCards(s: GameState, p: PlayerState): Card[] {
  return [
    ...p.row.map(st => st[0]).filter((c): c is Card => !!c),
    ...(s.config.quickToCenter && p.quick[0] ? [p.quick[0]] : []),
    ...(p.waste[0] ? [p.waste[0]] : []),
  ];
}

export function anyVisibleCenterPlay(s: GameState): boolean {
  return s.players.some(p => visibleCards(s, p).some(c => centerFits(s, c)));
}

/** does this seat have any legal action at all right now? (visible info only) */
function seatHasMove(s: GameState, p: PlayerState): boolean {
  if (visibleCards(s, p).some(c => centerFits(s, c))) return true;
  if (p.hand.length > 0 || p.waste.length > 0) return true;       // can always flip
  if (s.config.roundEndMode === 'call' && p.quick.length === 0) return true; // callStop
  if (!s.config.autoRefillRow && p.quick.length > 0 && p.row.some(st => st.length === 0)) return true;
  if (s.config.proVariant) {
    const movers = [p.quick[0], p.waste[0]].filter((c): c is Card => !!c);
    for (const c of movers)
      for (const stack of p.row) {
        if (stack.length === 0 && s.config.proAllowEmptySlot) return true;
        if (stack.length > 0 && proFits(s.config, c, stack[0])) return true;
      }
  }
  return false;
}

/**
 * True deadlock: no player can make ANY move whatsoever — not even flip the
 * hand. Uses only what players can see (card counts + visible tops), never the
 * hidden face-down contents, so ending here can never surprise anyone. This is
 * always a safe stopping point regardless of the earlyStalemate setting.
 */
export function isDeadlock(s: GameState): boolean {
  if (s.phase !== 'playing') return false;
  return !s.players.some(p => seatHasMove(s, p));
}

/**
 * Hard stalemate (G7, conservative): true only if
 *  - no visible play into the center exists,
 *  - no hand/waste card (reachable via flipping/recycling) fits,
 *  - and in the pro variant no quick/waste->row move exists that
 *    could uncover hidden cards.
 * False negatives possible (stalemate missed) — the host additionally
 * uses an inactivity timeout. False positives are excluded.
 */
export function isHardStalemate(s: GameState): boolean {
  if (anyVisibleCenterPlay(s)) return false;
  for (const p of s.players) {
    if ([...p.hand, ...p.waste].some(c => centerFits(s, c))) return false;
    // manual refill (G1): filling an empty slot uncovers quick cards and can
    // route the quick pile onto the table even when quickToCenter is off
    if (!s.config.autoRefillRow && p.quick.length > 0 &&
        p.row.some(st => st.length === 0)) return false;
    // quickToCenter off (G9): a quick card that fits the center still counts
    // as reachable if a row slot could open for it — covered above by the
    // visible-play check (a play frees a slot) and the manual-refill check.
    if (s.config.proVariant) {
      const movers = [p.quick[0], p.waste[0]].filter((c): c is Card => !!c);
      for (const c of movers)
        for (const stack of p.row) {
          if (stack.length === 0 && s.config.proAllowEmptySlot) return false;
          if (stack.length > 0 && proFits(s.config, c, stack[0])) return false;
        }
    }
  }
  return true;
}

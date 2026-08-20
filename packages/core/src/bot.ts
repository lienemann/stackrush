import { Action, GameState, Source } from './types.js';
import { apply } from './engine.js';

/**
 * Computer player (10 difficulty levels). Pure policy: given a state and a
 * seat, pick one legal action — the host drives it through the *same* Arbiter
 * path as human seats, so a bot enjoys no structural advantage. Difficulty is
 * expressed on three axes:
 *   - reactionMs: how fast the bot "taps" (feeds the Arbiter → wins/loses races)
 *   - skill:      probability it takes the best-ranked move vs. a random legal one
 *   - oversight:  probability it fails to spot its placements this turn and just
 *                 flips/waits instead — this is what makes low levels genuinely
 *                 beatable rather than merely slow
 * Higher levels additionally see more options (manual refills, the pro buffer).
 *
 * The rng is injected so the policy stays deterministic and unit-testable; the
 * host passes Math.random.
 */
export type BotLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export const BOT_LEVELS: readonly BotLevel[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export interface BotProfile {
  /** reaction time sampled uniformly in [min, max] ms */
  reactionMs: readonly [number, number];
  /** chance of choosing the top-ranked move (else a random legal one) */
  skill: number;
  /** chance of overlooking all placements this turn (weak play, not just slow) */
  oversight: number;
  /** considers explicit refillRow moves (manual-refill mode) */
  planRefill: boolean;
  /** considers pro-variant buffer moves (quick/waste → own row) */
  useBuffer: boolean;
  /** chance of bothering to flip the hand when no placement exists */
  diligence: number;
}

/**
 * Difficulty lives primarily in REACTION TIME: low levels are slow but still
 * play sensibly (small oversight), so they feel like a leisurely human
 * rather than a broken one.
 */
export const BOT_PROFILES: Record<BotLevel, BotProfile> = {
  1: { reactionMs: [2600, 3900], skill: 0.30, oversight: 0.18, planRefill: false, useBuffer: false, diligence: 0.6 },
  2: { reactionMs: [2100, 3100], skill: 0.38, oversight: 0.14, planRefill: false, useBuffer: false, diligence: 0.7 },
  3: { reactionMs: [1600, 2400], skill: 0.45, oversight: 0.11, planRefill: false, useBuffer: false, diligence: 0.8 },
  4: { reactionMs: [1200, 1800], skill: 0.52, oversight: 0.08, planRefill: false, useBuffer: false, diligence: 0.85 },
  5: { reactionMs: [900, 1350], skill: 0.60, oversight: 0.06, planRefill: false, useBuffer: false, diligence: 0.9 },
  6: { reactionMs: [650, 1000], skill: 0.66, oversight: 0.04, planRefill: false, useBuffer: false, diligence: 0.95 },
  7: { reactionMs: [460, 720], skill: 0.72, oversight: 0.02, planRefill: true, useBuffer: false, diligence: 1.0 },
  8: { reactionMs: [340, 530], skill: 0.80, oversight: 0.01, planRefill: true, useBuffer: true, diligence: 1.0 },
  9: { reactionMs: [230, 380], skill: 0.90, oversight: 0, planRefill: true, useBuffer: true, diligence: 1.0 },
  10: { reactionMs: [150, 280], skill: 1.0, oversight: 0, planRefill: true, useBuffer: true, diligence: 1.0 },
};

export function botReactionMs(level: BotLevel, rnd: () => number): number {
  const [lo, hi] = BOT_PROFILES[level].reactionMs;
  return Math.round(lo + rnd() * (hi - lo));
}

interface Scored { action: Action; score: number }

/**
 * Choose one action for `player`, or null if the bot would sit idle this tick.
 * Legality is checked against the pure reducer — the exact rules the host
 * enforces — so the policy can never emit an illegal intent.
 */
export function chooseBotAction(
  state: GameState, player: number, level: BotLevel, rnd: () => number,
): Action | null {
  if (state.phase !== 'playing') return null;
  const prof = BOT_PROFILES[level];
  const p = state.players[player];
  const overlooked = rnd() < prof.oversight; // draw BEFORE scanning: deterministic per turn
  const cand: Scored[] = [];
  const consider = (action: Action, score: number) => {
    if (apply(state, action).ok) cand.push({ action, score });
  };

  if (!overlooked) {
    // --- placements into the center ---
    const sources: Source[] = [
      ...p.row.flatMap((st, slot) => (st.length ? [{ kind: 'row', slot } as Source] : [])),
      ...(state.config.quickToCenter && p.quick[0] ? [{ kind: 'quick' } as Source] : []),
      ...(p.waste[0] ? [{ kind: 'waste' } as Source] : []),
    ];
    for (const source of sources) {
      const card = source.kind === 'row' ? p.row[source.slot][0]
        : source.kind === 'quick' ? p.quick[0] : p.waste[0];
      if (!card) continue;
      // row/quick plays shrink the quick pile (directly or via auto-refill) —
      // that is the win condition, so weight them above waste plays
      const drains = source.kind === 'row' || source.kind === 'quick';
      const base = drains ? 6 : 4;
      if (card.value === 1) consider({ type: 'playToCenter', player, source, pile: 'new' }, base);
      state.center.forEach((pile, i) => {
        if (pile.color === card.color && pile.height + 1 === card.value)
          consider({ type: 'playToCenter', player, source, pile: i }, base + card.value * 0.1);
      });
    }

    // --- manual refill (uncovers quick cards; only higher levels plan it) ---
    if (prof.planRefill && !state.config.autoRefillRow && p.quick.length > 0)
      p.row.forEach((st, slot) => { if (st.length === 0) consider({ type: 'refillRow', player, slot }, 2); });

    // --- pro-variant buffer moves (park a high card to free the quick pile) ---
    if (prof.useBuffer && state.config.proVariant) {
      for (const source of [{ kind: 'quick' }, { kind: 'waste' }] as const) {
        if (!(source.kind === 'quick' ? p.quick[0] : p.waste[0])) continue;
        p.row.forEach((_, slot) => consider({ type: 'playToRow', player, source, slot }, 1.5));
      }
    }
  }

  if (cand.length > 0) {
    cand.sort((a, b) => b.score - a.score);
    return (rnd() < prof.skill ? cand[0] : cand[Math.floor(rnd() * cand.length)]).action;
  }

  // nothing placeable (or overlooked): in call mode, an empty quick pile means
  // "call Stop and win" — even weak bots eventually notice that
  if (state.config.roundEndMode === 'call' && p.quick.length === 0 && rnd() < Math.max(0.3, prof.diligence))
    return { type: 'callStop', player };

  // otherwise cycle the hand to reveal new cards
  if ((p.hand.length > 0 || p.waste.length > 0) && rnd() < prof.diligence)
    return { type: 'flipHand', player };

  return null;
}

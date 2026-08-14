export type Color = 0 | 1 | 2 | 3;
export const COLORS: readonly Color[] = [0, 1, 2, 3];
export const MAX_VALUE = 10;

/** owner = player index (corresponds to the card-back color) */
export interface Card {
  color: Color;
  value: number; // 1..10
  owner: number;
}

export interface PlayerState {
  /**
   * Row: fixed slots, each slot a stack ([0] = top card).
   * Base game: stack height <= 1. Pro variant: buffer stacks.
   * Empty slot = empty array.
   */
  row: Card[][];
  /** Quick pile: [0] = top card. 10 cards at round start. */
  quick: Card[];
  /** Face-down hand stock: [0] = next to draw */
  hand: Card[];
  /** Face-up waste pile: [0] = top */
  waste: Card[];
  /** Waste-recycle counter; makes shuffle seeds unique */
  shuffles: number;
}

export interface CenterPile {
  color: Color;
  height: number;      // value of top card, 10 = full
  owners: number[];    // owner per card, for scoring
}

/** See docs/RULES-GAPS.md for the rationale behind each switch */
export interface Config {
  players: number;              // 2..4
  rowSize: number;              // 5/4/3 bei 2/3/4 Spielern
  targetRounds: number;

  proVariant: boolean;          // Reihe als Zwischenspeicher
  /** G3: "descending" — any smaller value ('any') or exactly −1 ('one') */
  proDescendingStep: 'any' | 'one';
  /** G4: allow placing onto an empty row slot in the pro variant? */
  proAllowEmptySlot: boolean;

  /** G1: auto-refill row from quick pile (otherwise explicit refillRow action) */
  autoRefillRow: boolean;
  /** G2: round ends automatically on empty quick pile ('auto') or only via call ('call') */
  roundEndMode: 'auto' | 'call';
  /** G5: shuffle waste on recycle (rulebook) or just flip it over (house rule) */
  shuffleOnRecycle: boolean;
  /**
   * G9: may the quick pile's top card be played straight to the center?
   * The 2017 booklet allows it; common table practice drains the pile only
   * through row refills. Default: false (stricter house reading).
   */
  quickToCenter: boolean;
  /**
   * G10: may the host end a round *early* using its full (hidden-card)
   * knowledge — i.e. as soon as it can prove no reachable card will ever fit
   * (isHardStalemate)? Players don't see the face-down piles, so an early end
   * can feel arbitrary. false = end only on a real deadlock (no move at all)
   * or, for provably-stuck positions, after a short grace so players discover
   * it themselves. Default: false.
   */
  earlyStalemate: boolean;
}

export type Phase = 'playing' | 'roundEnded' | 'matchEnded';

export interface GameState {
  config: Config;
  phase: Phase;
  round: number;
  players: PlayerState[];
  center: CenterPile[];
  roundEndedBy: number;        // -1 = stalemate
  roundScores: number[][];
  totals: number[];
}

export type Source =
  | { kind: 'row'; slot: number }
  | { kind: 'quick' }
  | { kind: 'waste' };

export type Action =
  | { type: 'playToCenter'; player: number; source: Source; pile: number | 'new' }
  | { type: 'flipHand'; player: number }
  | { type: 'playToRow'; player: number; source: { kind: 'quick' } | { kind: 'waste' }; slot: number }
  | { type: 'refillRow'; player: number; slot: number }   // only when autoRefillRow=false
  | { type: 'callStop'; player: number }                  // only when roundEndMode='call'
  | { type: 'endRoundStalemate' }
  | { type: 'startNextRound'; seed: number };

export type Rejection =
  | 'notPlaying' | 'badPlayer' | 'emptySource' | 'badSlot' | 'pileFull'
  | 'wrongColor' | 'wrongValue' | 'needValueOne' | 'noSuchPile'
  | 'notProVariant' | 'emptySlotForbidden' | 'handEmpty'
  | 'autoRefillActive' | 'slotNotEmpty' | 'quickEmpty'
  | 'wrongMode' | 'quickNotEmpty' | 'quickLocked';

export type Result =
  | { ok: true; state: GameState; events: Event[] }
  | { ok: false; reason: Rejection };

export type Event =
  | { type: 'cardPlayed'; player: number; card: Card; pile: number }
  | { type: 'cardToRow'; player: number; card: Card; slot: number }
  | { type: 'newPile'; pile: number }
  | { type: 'rowRefilled'; player: number; slot: number }
  | { type: 'handFlipped'; player: number; count: number }
  | { type: 'wasteRecycled'; player: number }
  | { type: 'quickEmptied'; player: number }              // 'call' mode: may call stop now
  | { type: 'roundEnded'; by: number; scores: number[] }
  | { type: 'matchEnded'; totals: number[] };

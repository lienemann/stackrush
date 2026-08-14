# Rules review: gaps in the official rulebook and engine decisions

*(Deutsche Fassung: RULES-GAPS.de.md)*

Basis: official rulebook (2017). Each gap has a default (as faithful to the
booklet as possible) and a switch in `Config` (packages/core/src/types.ts).

## G1 — Row refill: right or automatism?
**Text:** the freed slot "*may* immediately be refilled" — a permission, and a
time-costing action in the physical game.
**Default:** `autoRefillRow: true` (digitally strictly beneficial, relieves the
touch UI). **Alternative:** `false` → explicit `refillRow` action (authentic:
refilling costs reaction time).

## G2 — Round end: automatic or by call?
**Text:** "…calls 'Stop!' and the game ends *immediately*." The end is tied to
the *call*, not to the empty pile. Between last card and call, play continues —
even for the caller (collect plus points first, then call: a real strategic
element).
**Default:** `roundEndMode: 'auto'`. **Alternative:** `'call'` → event
`quickEmptied`, action `callStop` (valid only with empty quick pile).

## G3 — Pro variant: "descending order"
Any smaller value, or exactly −1? The text only says "descending".
**Default:** `proDescendingStep: 'any'` (literal reading). Alternative `'one'`.

## G4 — Pro variant: empty row slot as target?
The text only defines conditions against cards already lying there.
**Default:** `proAllowEmptySlot: false` (empty slots belong to the quick pile —
consistent with the booklet's warning that overfilled rows block refilling).

## G5 — Waste recycling: shuffle or flip?
**Text:** "picked up face down, *briefly shuffled*".
**Default:** `shuffleOnRecycle: true` (seeded from state + shuffle counter,
deterministic for replays). **Alternative:** `false` = flip only (house rule).
⚠ The flip-only rule can livelock by construction (`waste % 3 == 0` cycles the
same triples forever) — empirically confirmed by variant self-play; the host
inactivity timeout is therefore mandatory, see G7.

## G6 — Row slots are stacks (pro variant)
Data-model consequence, not a rule conflict: pro-variant slots hold multiple
cards; only the top is playable, cards below become free. `row: Card[][]`
(`[0]` = top). Base game: stack height ≤ 1.

## G7 — Stalemate ("cards hide in the piles")
The text says the game ends early and points are counted — but not *who*
determines this. Engine: `isHardStalemate()` — conservative (never a false
positive): no visible center play, no hand/waste card reachable via
flipping/recycling fits, and (pro) no row move could uncover hidden cards.
The host combines this with an inactivity timeout and issues
`endRoundStalemate`.

## G8 — Simultaneity / in-flight cards at stop
Physically unregulated (whoever *lies* first). Digitally: host arbitration by
reaction timestamps (README table); actions after round end are rejected with
`notPlaying`. An optional grace window (honoring actions *sent* before the
stop) is host policy, not engine logic — deliberately kept out so the engine
stays deterministic.

## Unambiguous (no switches needed)
Row sizes 5/4/3 · center: new pile only with a 1, build-up +1 same color,
multiple piles per color · flip of 3 as a packet (former top ends up at the
bottom) · scoring +1 center / −2 quick-pile remainder, row+hand not counted ·
tie = multiple winners · match over an agreed number of rounds.

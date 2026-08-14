# Stackrush — UI Design

*(Deutsche Fassung: UI-DESIGN.de.md)*

Subject: a frantic simultaneous card race. The screen's single job during play:
make "can I play this card right now?" answerable in under 100 ms of glancing.
Everything serves recognition speed; decoration is the enemy.

## Design tokens

**Card colors** — must survive colorblindness *and* 180°-rotated reading at
arm's length. Okabe-Ito subset, additionally shape-coded (see signature):

| Token | Hex | Shape mark |
|---|---|---|
| `--card-amber` | `#E69F00` | ▲ triangle |
| `--card-sky` | `#56B4E9` | ● circle |
| `--card-green` | `#009E73` | ■ square |
| `--card-plum` | `#CC79A7` | ◆ diamond |

Table background `--felt: #1B2432` (deep blue-slate, not black — card colors
pop without OLED smearing during fast motion). Text `#F2F4F8`, dim `#8B93A7`.
Accent for actionable highlights: `--go: #FFD644` (only meaning: "playable now").

**Typography** — numerals *are* the content. Display: **Archivo Black** for
card values (fat, unambiguous 6/9 with an underline bar baked into the SVG,
since cards are read upside down). UI/body: **Inter** (tabular numerals for
scores). No third face.

**Signature element** — every card value is rendered twice, point-symmetric
(like real playing-card indices), and carries its color's shape mark behind
the numeral. A card is thus readable from any seat rotation and by colorblind
players without legend or label. This one device does all the accessibility
work and gives the deck its identity.

## Screens

1. **Lobby** — room code (large, sharable), seat assignment per device
   (`Seats on this device: 1 2 3 4`), player names, config switches collapsed
   behind "Settings". Acoustic pairing as playful alternative: "🔊 Pair by
   sound".
2. **Table** (the game) — per seat region: own row (slots side by side),
   quick pile with remaining-count badge, waste + flip button, all thumb-
   reachable at the region's outer edge. Shared center strip between regions:
   center piles, auto-arranged, newest pile slides in. `roundEndMode='call'`:
   a Stop button appears only when the own quick pile empties.
3. **Round end** — score delta per player (+n / −2·m broken out), running
   totals as a compact bar race, "Next round" on the host.
4. **Match end** — winner(s), per-round table, rematch.

## Seat layouts (one device, portrait)

```
1 seat          2 seats             4 seats (tablet)
┌─────────┐     ┌─────────┐         ┌────┬────┐
│ center  │     │ ɐǝɹɐ ᄅd │ (180°)  │ ɐᄅ │ ɐƐ │ (180°)
│─────────│     │─────────│         ├────┴────┤
│ my area │     │ center  │         │ center  │
│ row/pile│     │─────────│         ├────┬────┤
└─────────┘     │ P1 area │         │ P1 │ P4 │
                └─────────┘         └────┴────┘
```
Remote players appear in the center strip as slim status chips (name, quick-
pile count) — no full mirroring of foreign areas; the center is the shared
truth and keeps the layout calm.

## Interaction

- **Tap-to-play**, not drag: tap a card → legal targets pulse in `--go`; tap
  target. Single-target case (common): first tap plays immediately
  ("fast path"). Drag remains as optional setting; tap is measurably faster
  and is what `reactionMs` is calibrated on.
- Optimistic: card flies on tap; on rejection it snaps back with a short
  shake + haptic tick (no modal, no text — losing races is normal, not an
  error).
- `cannotPlayHere` toast only for *illegal* taps, not lost races.
- Reduced motion: replace flight/pulse with opacity steps. Wake lock during
  rounds. Hit targets ≥ 48 px even in 4-seat quadrants.

## Component tree (app)

```
<App>                     locale, settings, route
 ├─ <Lobby>               room create/join, seat picker, config
 └─ <Table>               state from host, optimistic layer
     ├─ <CenterStrip>     <CenterPile/>*, remote status chips
     ├─ <SeatRegion>*     rotation wrapper (transform)
     │   ├─ <RowSlot/>*   stack top + depth hint (pro variant)
     │   ├─ <QuickPile/>  count badge
     │   ├─ <WastePile/>  + <FlipButton/>
     │   └─ <StopButton/> call mode only
     └─ <RoundEndSheet>/<MatchEndSheet>
```

Rendering: SVG cards (crisp at any rotation/scale), CSS transforms for seat
rotation, no canvas needed. State: host state + thin optimistic diff; no
global store library — `useSyncExternalStore` over the net client suffices.

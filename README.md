# Stackrush (working title)

Real-time card race for 2–4 players. Independent implementation of a
"simultaneous solitaire race" style of game; own name, own card design,
rules written in our own words. PWA-first, serverless multiplayer.

*Deutsche Fassung: README.de.md — alle Doku-Dateien existieren in EN und DE.*

## Packages
- `packages/core` — game logic: pure state reducer (`apply`), deterministic,
  host-authoritative. Multi-round scoring (+1 center / −2 quick-pile rest),
  pro variant (row as buffer), stalemate detection.
- `packages/net` — `Arbiter`: reaction-time conflict resolution with adaptive
  collection window; transport interface (WebRTC via Trystero, acoustic 4-FSK
  modem, loopback).
- `packages/app` — PWA (to be implemented): seats (1–4 players per device,
  mixed local/remote), i18n (en/de, autodetect + manual override), SVG cards.

## Rule gaps
The official rulebook is underspecified in 8 places; each gap is documented in
`docs/RULES-GAPS.md` and selectable via `Config` (G1 refill manual/auto,
G2 round end auto/call, G3 descending any/−1, G4 empty slot, G5 shuffle/flip,
G6 slot stacks, G7 stalemate detection + host timeout, G8 in-flight policy).

## Fairness / latency (docs/latency_sim.py, docs/arb_sim.py)
| Transport | Scheme | Latency p50 | Fairness |
|---|---|---|---|
| WebRTC | reaction time + adaptive window | ~100 ms | 99.7 % |
| Acoustic 2P | immediate send + reaction time + 200 ms window | 350 ms | 94 % |
| Acoustic 3–4P | TDMA + reaction time | 480 ms | 100 % |

No clock sync required: clients compare locally measured reaction deltas
(tap − render of the enabling state version). The host's own seats wait for
the same window — playing on the host phone confers no advantage.

## Tests
```
npx tsx --test packages/core/test/engine.test.ts   # 17 tests incl. fuzz
npx tsx --test packages/net/test/arbiter.test.ts   # 5 tests
npx tsx --test packages/app/test/i18n.test.ts      # 4 tests
npx tsx packages/core/test/selfplay.ts             # 200 bot matches
npx tsx packages/core/test/selfplay-variants.ts    # all config switches
```

## Docs
`docs/ARCHITECTURE.md` (data flow, latency, transports, checklist) ·
`docs/UI-DESIGN.md` (tokens, screens, seat layouts, components) ·
`docs/RULES-GAPS.md` · reference sims: `modem_sim.py`, `arb_sim.py`,
`latency_sim.py`. German versions: `*.de.md`.

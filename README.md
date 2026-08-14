# Stackrush

Real-time card race for 2–4 players. Independent implementation of a
"simultaneous solitaire race" style of game; own name, own card design,
rules written in our own words. PWA-first, serverless multiplayer.

By **Julian & Jan**.

*Deutsche Fassung: README.de.md — alle Doku-Dateien existieren in EN und DE.*

## Play

The app deploys to GitHub Pages as an installable, offline-capable PWA:
**https://lienemann.github.io/stackrush/**

- **On one device:** 1–4 seats on one phone/tablet, screen split and rotated
  so each player faces the shared center.
- **Across phones:** host a room (WebRTC via Trystero, serverless signaling —
  only a room code is shared), others join by code or "🔊 Pair by sound"
  (near-ultrasonic 4-FSK beacon).
- Install it from the browser menu (or the in-app install button) — it works
  offline afterwards.

## Packages (npm workspaces)

- `packages/core` — game logic: pure state reducer (`apply`), deterministic,
  host-authoritative. Multi-round scoring (+1 center / −2 quick-pile rest),
  pro variant (row as buffer), stalemate detection.
- `packages/net` — `Arbiter`: reaction-time conflict resolution with adaptive
  collection window; transports behind one interface: WebRTC (Trystero),
  acoustic 4-FSK modem (Web Audio port of docs/modem_sim.py), loopback.
- `packages/app` — the PWA: seats (1–4 players per device, mixed
  local/remote), optimistic tap-to-play with rollback, SVG cards, i18n
  (en/de, autodetect + manual override), settings for every rule switch,
  wake lock, offline service worker, in-app manual + about.

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

## Development

```
npm ci
npm run dev        # vite dev server (packages/app)
npm test           # all suites: engine (incl. fuzz), arbiter, modem DSP,
                   # loopback, host/client session, i18n
npm run selfplay   # 200 bot matches + all config-switch variants
npm run typecheck  # tsc over core/net/app
npm run build      # production PWA -> packages/app/dist
npm run icons      # regenerate PWA icons (pure-node PNG encoder)
```

## Deployment

`.github/workflows/deploy.yml` tests, builds and publishes to GitHub Pages on
every push to `main` (Pages must be set to "GitHub Actions" as the source in
the repository settings, one time). The Vite base path defaults to
`/stackrush/`; override with `BASE_PATH=/` for other hosts.

## Docs

`docs/ARCHITECTURE.md` (data flow, latency, transports, checklist) ·
`docs/UI-DESIGN.md` (tokens, screens, seat layouts, components) ·
`docs/RULES-GAPS.md` · reference sims: `modem_sim.py`, `arb_sim.py`,
`latency_sim.py`. German versions: `*.de.md`.

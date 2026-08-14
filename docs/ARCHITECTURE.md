# Stackrush — Architecture

*(Deutsche Fassung: ARCHITECTURE.de.md)*

## Packages

| Package | Responsibility | Depends on |
|---|---|---|
| `@stackrush/core` | Pure game logic: `apply(state, action) -> Result`. Deterministic, no I/O, no timers. All rule ambiguities behind `Config` switches (docs/RULES-GAPS.md). | — |
| `@stackrush/net` | Host authority: `Arbiter` (reaction-time conflict resolution, adaptive window), transports behind one interface. | core (types) |
| `@stackrush/app` | PWA: seats, rendering, input, i18n, settings, service worker. | core, net |

## Data flow (host-authoritative)

```
tap on seat S ──► intent { action, stateVersion, reactionMs } ──► Transport ──► host
host: Arbiter.submit ── window expires ──► ordered intents ──► core.apply per intent
      accepted: state broadcast (version++) / rejected: silent (client rolls back)
client: optimistic render on tap ──► confirm or rollback on next state
```

- `stateVersion` increments per accepted action; every broadcast carries it.
- Clients timestamp `renderTime[version]` (requestAnimationFrame after applying
  a state). `reactionMs = tapTime − renderTime[enablingVersion]`.
- Local seats (including the host's own) go through the identical path.

## Latency & fairness

Measured by simulation (docs/latency_sim.py): with the host playing at ~0 ms
network latency and remotes at 15–40 ms ± jitter, arrival-order arbitration is
only 80–85 % fair (host wins ties). Reaction-time arbitration is **99.7 % fair**
at the cost of ~90 ms added resolution latency. Key insight: **no clock sync
and no latency stability is required** — only locally measured deltas are
compared. Continuous per-peer RTT measurement (piggybacked pings) is used
solely to size the collection window: `clamp(p95(oneWay) + 30 ms, 40, 400)`.

Trust model: clients self-report `reactionMs`. A modified client could lie.
Accepted for friendly play; not defended (documented, out of scope).

## Transport interface

```ts
interface Transport {
  caps(): { bandwidth: number; latencyMs: number; broadcast: boolean; halfDuplex: boolean };
  send(peer: PeerId | 'all', data: Uint8Array): void;
  onMessage(cb: (peer: PeerId, data: Uint8Array) => void): void;
}
```

1. **TrysteroTransport** (primary): WebRTC data channels, serverless signaling
   via public BitTorrent/Nostr/MQTT infrastructure; room code only. LAN peers
   connect directly.
2. **AcousticTransport** (pairing / fallback / fun mode): 4-FSK in
   17.5–20.5 kHz, ~2 kbit/s gross, frames ≈ 12 B ≈ 50 ms airtime
   (reference DSP: docs/modem_sim.py). Calibration handshake sweeps tone sets
   and baud rates; the speaker roll-off knee (~20.5 kHz, device-dependent) is
   the main parameter. Above 2 players use TDMA slots (docs/arb_sim.py).
3. **LoopbackTransport**: tests and single-device play.

## Seats (multiple players per device)

`Seat = { playerIndex, deviceId, rotationDeg }`. A device renders 1–4 seat
regions (`seatRegions()` in app/src/seats.ts), each rotated to face the shared
center. Mixed setups (e.g. 2 seats on the host phone + 2 remote phones) are
the normal case, not a special one. Fairness holds because local seats submit
through the same Arbiter window.

## Round/host lifecycle

- Host = room creator; owns Arbiter + engine, broadcasts state.
- Stalemate: `isHardStalemate()` (conservative, no false positives) OR
  inactivity timeout (~10 s without accepted action) → `endRoundStalemate`.
  The timeout is mandatory: with `shuffleOnRecycle=false` a livelock is
  reachable by rule (see RULES-GAPS G5) — verified by variant self-play.
- Host migration on disconnect: v2. v1: pause + reconnect wait.

## Implementation checklist (for the coding session)

1. Vite + TS + `vite-plugin-pwa`; workspaces core/net/app; CI: `tsx --test`.
2. Port `docs/modem_sim.py` DSP to `AcousticTransport` (Web Audio worklet).
3. Table renderer (SVG cards, own design), seat regions, tap-to-play with
   target highlighting; optimistic layer with rollback.
4. Settings screen wiring all `Config` switches + language (auto/en/de).
5. Wake lock, offline SW, install prompt; GitHub Pages deploy
   (.github/workflows/deploy.yml, base path `/stackrush/`).

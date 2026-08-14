# Stackrush (Arbeitstitel)

Echtzeit-Kartenrennen für 2–4 Spieler. Eigenständige Implementierung eines
Spielprinzips vom Typ „simultanes Solitär-Wettrennen"; eigener Name, eigenes
Kartendesign, Regeln eigenformuliert. PWA-first, serverloser Mehrspielermodus.

## Pakete
- `packages/core` — Spiellogik: reiner State-Reducer, deterministisch,
  Host-autoritativ. Multi-Runden-Wertung, Profi-Variante, Blockade-Erkennung.
- `packages/net` — `Arbiter`: Reaktionszeit-Arbitrierung mit adaptivem
  Sammelfenster; Transport-Interface (WebRTC via Trystero, akustisches
  4-FSK-Modem, Loopback).
- `packages/app` — PWA (zu implementieren): Sitze (1–4 Spieler je Gerät,
  gemischt lokal/remote), i18n (en/de, Autodetect + manuell), SVG-Karten.

## Regel-Lücken
8 unterspezifizierte Stellen der Anleitung, dokumentiert in
`docs/RULES-GAPS.de.md`, alle per `Config` schaltbar.

## Fairness / Latenz
Keine Uhren-Synchronisation nötig: Clients vergleichen lokal gemessene
Reaktionszeiten (Tap − Render der auslösenden State-Version). Die Sitze des
Host-Handys warten auf dasselbe Fenster — Mitspielen auf dem Host bringt
keinen Vorteil (99,7 % fair, Simulation in docs/latency_sim.py).

## Doku
Alle Dokumente in EN (primär) und DE (`*.de.md`).

# Stackrush

Echtzeit-Kartenrennen für 2–4 Spieler. Eigenständige Implementierung eines
Spielprinzips vom Typ „simultanes Solitär-Wettrennen"; eigener Name, eigenes
Kartendesign, Regeln eigenformuliert. PWA-first, serverloser Mehrspielermodus.

Von **Julian & Jan**.

## Spielen

Die App wird als installierbare, offlinefähige PWA auf GitHub Pages
veröffentlicht: **https://lienemann.github.io/stackrush/**

- **Auf einem Gerät:** 1–4 Plätze je Handy/Tablet, Bildschirm geteilt und
  rotiert, sodass jeder zur gemeinsamen Mitte blickt.
- **Über mehrere Handys:** Raum eröffnen (WebRTC via Trystero, serverloses
  Signaling — geteilt wird nur ein Raumcode), Beitritt per Code oder
  „🔊 Per Klang koppeln" (nahezu unhörbares 4-FSK-Signal).
- Über das Browsermenü (oder den Installieren-Button) installieren — danach
  funktioniert die App offline.

## Pakete (npm-Workspaces)

- `packages/core` — Spiellogik: reiner State-Reducer, deterministisch,
  Host-autoritativ. Multi-Runden-Wertung, Profi-Variante, Blockade-Erkennung.
- `packages/net` — `Arbiter`: Reaktionszeit-Arbitrierung mit adaptivem
  Sammelfenster; Transporte hinter einem Interface: WebRTC (Trystero),
  akustisches 4-FSK-Modem (Web-Audio-Port von docs/modem_sim.py), Loopback.
- `packages/app` — die PWA: Sitze (1–4 Spieler je Gerät, gemischt
  lokal/remote), optimistisches Tap-to-play mit Rollback, SVG-Karten, i18n
  (en/de), Einstellungen für jeden Regelschalter, Wake Lock, Offline-Service-
  Worker, Anleitung + Über-Dialog in der App.

## Regel-Lücken

8 unterspezifizierte Stellen der Anleitung, dokumentiert in
`docs/RULES-GAPS.de.md`, alle per `Config` schaltbar.

## Fairness / Latenz

Keine Uhren-Synchronisation nötig: Clients vergleichen lokal gemessene
Reaktionszeiten (Tap − Render der auslösenden State-Version). Die Sitze des
Host-Handys warten auf dasselbe Fenster — Mitspielen auf dem Host bringt
keinen Vorteil (99,7 % fair, Simulation in docs/latency_sim.py).

## Entwicklung & Deployment

`npm ci && npm test && npm run build` — Details im englischen README.
`.github/workflows/deploy.yml` testet, baut und veröffentlicht bei jedem Push
auf `main` nach GitHub Pages (einmalig in den Repo-Einstellungen Pages auf
„GitHub Actions" stellen).

## Doku

Alle Dokumente in EN (primär) und DE (`*.de.md`).

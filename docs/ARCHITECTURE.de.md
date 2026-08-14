# Stackrush — Architektur (Kurzfassung)

Vollständige Fassung: ARCHITECTURE.md (EN).

**Pakete:** `core` (reine Spiellogik, deterministisch) · `net` (Arbiter +
Transporte) · `app` (PWA, Sitze, i18n).

**Datenfluss:** Tap → Intent {Aktion, StateVersion, Reaktionszeit} → Transport
→ Host-Arbiter (Sammelfenster) → Engine wendet geordnet an → State-Broadcast;
Clients rendern optimistisch und rollen bei Ablehnung zurück.

**Latenz & Fairness:** Arbitrierung nach lokal gemessener Reaktionszeit
(Tap − Render) statt Ankunftszeit: 99,7 % fair, Host-Vorteil verschwindet,
keine Uhrensynchronisation nötig. RTT-Dauermessung dimensioniert nur das
Fenster: `clamp(p95(Einweg) + 30 ms, 40, 400)`. Vertrauensmodell: Clients
melden Reaktionszeiten selbst (Familienkontext, dokumentiert).

**Transporte:** Trystero/WebRTC (primär, serverlos) · Akustik 4-FSK
17,5–20,5 kHz, ~2 kbit/s, Kalibrier-Handshake (Rolloff-Knie gerätabhängig),
ab 3 Spielern TDMA · Loopback.

**Sitze:** 1–4 je Gerät, gemischt lokal/remote als Normalfall; lokale Sitze
laufen durch denselben Arbiter-Pfad.

**Blockade:** konservativer Detektor + Inaktivitäts-Timeout (Pflicht, siehe
RULES-GAPS G5: Wende-Hausregel kann konstruktionsbedingt livelocken).

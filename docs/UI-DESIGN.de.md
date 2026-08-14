# Stackrush — UI-Design (Kurzfassung)

Vollständige Fassung: UI-DESIGN.md (EN).

**Aufgabe des Screens:** „Kann ich diese Karte jetzt legen?" in <100 ms
beantworten. Alles dient der Erkennungsgeschwindigkeit.

**Tokens:** Kartenfarben Okabe-Ito (amber #E69F00 ▲, sky #56B4E9 ●, green
#009E73 ■, plum #CC79A7 ◆), zusätzlich formcodiert. Tisch #1B2432. Aktions-
Highlight #FFD644 (einzige Bedeutung: „jetzt spielbar"). Schrift: Archivo
Black für Kartenwerte (6/9 mit Unterstrich), Inter fürs UI.

**Signatur:** Jeder Kartenwert doppelt punktsymmetrisch + Formmarke hinter
der Ziffer → aus jeder Sitzrotation und farbenblind lesbar, ohne Legende.

**Screens:** Lobby (Raumcode, Sitze je Gerät, „Per Klang koppeln") · Tisch
(Sitzregionen rotiert zur gemeinsamen Mitte; Remote-Spieler als Status-Chips)
· Rundenende (Punkte-Delta, Balkenrennen) · Matchende.

**Interaktion:** Tap-to-play (Ziele pulsieren; Einzelziel = Sofortspiel),
optimistisch mit Snap-back + Haptik bei verlorenem Rennen (kein Fehlertext).
Reduced Motion respektiert, Wake Lock, Touchziele ≥ 48 px.

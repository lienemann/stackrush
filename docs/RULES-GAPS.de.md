# Regel-Review: Lücken der Anleitung und Engine-Entscheidungen

Grundlage: offizielle Anleitung (2017). Jede Lücke hat einen Default (möglichst
anleitungstreu) und einen Config-Schalter in `Config` (packages/core/src/types.ts).

## G1 — Reihe auffüllen: Recht oder Automatik?
**Text:** „darf der frei gewordene Platz … *sofort* … aufgefüllt werden."
**Lücke:** „darf" = optional; im physischen Spiel eine (Zeit kostende) Handlung.
**Default:** `autoRefillRow: true` — digital ist Auffüllen strikt vorteilhaft,
Automatik entlastet die Touch-UI. **Alternative:** `false` → explizite Aktion
`refillRow` (authentischer, Auffüllen kostet Reaktionszeit).

## G2 — Rundenende: automatisch oder durch Ruf?
**Text:** „…ruft ‚…Stop!' und das Spiel ist *sofort* beendet."
**Lücke:** Das Ende knüpft am *Ruf* an, nicht am leeren Stapel. Zwischen letzter
Karte und Ruf darf weitergespielt werden — sogar vom Rufer selbst (Pluspunkte
sammeln, dann rufen: reales Strategieelement).
**Default:** `roundEndMode: 'auto'` (verbreitete digitale Erwartung).
**Alternative:** `'call'` → Event `quickEmptied`, Aktion `callStop` (nur mit
leerem Schnellstapel gültig). UI zeigt dann einen Stop-Button.

## G3 — Profi-Variante: „absteigende Reihenfolge"
**Text:** „Die Zahlen müssen in absteigender Reihenfolge gelegt werden."
**Lücke:** Beliebig kleiner oder exakt um 1 fallend? Text sagt nur „absteigend".
**Default:** `proDescendingStep: 'any'` (wörtliche Lesart).
**Alternative:** `'one'` (strengere verbreitete Lesart).

## G4 — Profi-Variante: leerer Reihen-Slot als Ziel?
**Text:** definiert nur Bedingungen gegen bereits liegende Karten.
**Lücke:** Ablegen auf leeren Slot ist unbestimmt; konkurrenziert mit dem
Auffüllen aus dem Schnellstapel.
**Default:** `proAllowEmptySlot: false` (leere Slots gehören dem Schnellstapel —
konsistent mit dem Warnhinweis, dass zugebaute Reihen das Nachfüllen blockieren).

## G5 — Recycling der Ablage: mischen oder wenden?
**Text:** „…verdeckt aufgenommen, *kurz durchgemischt* …"
**Default:** `shuffleOnRecycle: true` (anleitungstreu; Seed aus Zustand +
Misch-Zähler, deterministisch für Replays). **Alternative:** `false` = nur
wenden (Hausregel; Reihenfolge bleibt vorhersagbar).

## G6 — Reihen-Slots sind Stapel (Profi)
Kein Regelkonflikt, aber Datenmodell-Konsequenz: In der Profi-Variante liegen
im Slot mehrere Karten; nur die oberste ist spielbar, darunterliegende werden
beim Abspielen frei. `row: Card[][]` (Slot-Stapel, `[0]` = oben). Im Basisspiel
Stapelhöhe ≤ 1.

## G7 — Blockade („verstecken sich in den Ligretto-Stapeln")
**Text:** Spiel wird vorzeitig beendet, Punkte gezählt. *Wer* das feststellt,
sagt der Text nicht.
**Engine:** `isHardStalemate()` — konservativ (nie falsch-positiv): kein
sichtbarer Zug, keine per Blättern/Recycling erreichbare Hand-/Ablagekarte
passt, und (Profi) kein Reihe-Zug kann verdeckte Karten freilegen. Der Host
kombiniert das mit einem Inaktivitäts-Timeout und löst `endRoundStalemate` aus.

## G8 — Gleichzeitigkeit / „in flight"-Karten beim Stop
Physisch ungeregelt (wer zuerst *liegt*). Digital: Host-Arbitrierung nach
Tap-Timestamps (siehe README-Tabelle); Aktionen nach Rundenende werden mit
`notPlaying` abgelehnt. Ein optionales Gnadenfenster (Aktionen, die vor dem
Stop *gesendet* wurden, noch zu werten) ist Host-Policy, nicht Engine-Logik —
bewusst draußen gehalten, damit die Engine deterministisch bleibt.

## G9 — Schnellstapel direkt in die Mitte?
**Text:** die Ablege-Optionen nennen die oberste Karte des Schnellstapels
(Ligretto-Stapels) als spielbar, und der Spielende-Absatz erwähnt die letzte
Karte „egal ob in die Mitte oder in die Reihe" — das Heft erlaubt den direkten
Mittelzug also. Verbreitete Tischpraxis ist strenger: Der Stapel leert sich
nur über das Nachrücken in die Reihe, die damit der einzige taktische
Engpass bleibt.
**Default:** `quickToCenter: false` (strengere Hauslesart, Wunsch des
Tisches, für den diese App entsteht). **Alternative:** `true` = Heftlesart.
Die Blockade-Erkennung berücksichtigt den Schalter: eine gesperrte
Schnellstapel-Karte, die in die Mitte passen würde, verhindert keine
Blockade-Diagnose.

## Eindeutig geregelt (keine Schalter nötig)
Reihengrößen 5/4/3 · Mitte: neuer Stapel nur mit 1, Aufbau +1 farbgleich,
mehrere Stapel je Farbe · 3er-Handflip als Paket (oberste landet unten) ·
Wertung +1 Mitte / −2 Rest-Schnellstapel, Reihe+Hand zählen nicht ·
Gleichstand = mehrere Sieger · Match über vereinbarte Rundenzahl.

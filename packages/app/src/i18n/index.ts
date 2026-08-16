/**
 * Tiny framework-free i18n. Autodetect from navigator.languages with manual
 * override persisted by the app (see pickLocale). Strings are fully typed:
 * adding a key to `en` forces a German translation at compile time.
 */
export const en = {
  appName: 'Stackrush',
  tagline: 'The frantic card race for 2–4 players',
  newGame: 'New game',
  playLocal: 'Play on this device',
  hostOnline: 'Host online game',
  joinGame: 'Join game',
  roomCode: 'Room code',
  enterCode: 'Enter room code',
  pairBySound: '🔊 Pair by sound',
  listening: 'Listening… hold the phones close',
  beaconing: 'Broadcasting room code by sound…',
  players: 'Players',
  addBot: '＋ Computer player',
  difficulty: 'Difficulty',
  botL1: '1 · Sleepy',
  botL2: '2 · Novice',
  botL3: '3 · Learner',
  botL4: '4 · Easygoing',
  botL5: '5 · Steady',
  botL6: '6 · Casual',
  botL7: '7 · Skilled',
  botL8: '8 · Sharp',
  botL9: '9 · Fierce',
  botL10: '10 · Expert',
  seatsOnThisDevice: 'Seats on this device',
  seatName: 'Name',
  startRound: 'Start round',
  startGame: 'Start game',
  waitingForHost: 'Waiting for the host…',
  waitingForPlayers: 'Share the code — waiting for players…',
  callStop: 'Stop!',
  flipHand: 'Flip 3',
  round: 'Round {n}',
  roundOf: 'Round {n} / {total}',
  score: 'Score',
  youScored: '{points} points',
  roundEndedBy: '{name} ended the round',
  stoppedBy: '{name} emptied the quick pile — Stop!',
  winByPoints: 'Most points after {n} rounds',
  colCenter: 'Center',
  colQuick: 'Quick pile',
  colRound: 'Round',
  colTotal: 'Total',
  stalemate: 'No moves left — round ended',
  matchWinner: 'Winner: {name}',
  matchWinners: 'Winners: {names}',
  nextRound: 'Next round',
  rematch: 'Rematch',
  backToLobby: 'Back to lobby',
  leaveGame: 'Leave',
  centerCards: '+1 × {n} center',
  quickPenalty: '−2 × {n} quick pile',
  total: 'Total',
  settings: 'Settings',
  language: 'Language',
  languageAuto: 'Automatic',
  rules: 'Rule variants',
  resetDefaults: 'Reset to defaults',
  infoTitle: 'What does this do?',
  targetRounds: 'Rounds per match',
  infoTargetRounds: 'The match runs over this many rounds; points add up across rounds and the highest total wins. Default: 1.',
  infoProVariant: 'Pro variant: your row becomes a buffer. You may place a quick-pile or waste card onto a row card of a different color and higher value, stacking downward. Deeper planning, riskier rows. Default: off.',
  infoProDescendingStep: 'Only relevant in the pro variant: whether a buffered card may be ANY smaller value ("any smaller", the literal reading) or must be exactly one less ("exactly −1", stricter). Default: any smaller.',
  infoProAllowEmptySlot: 'Only relevant in the pro variant: whether a quick-pile or waste card may be parked on an EMPTY row slot. Off keeps empty slots reserved for the quick pile. Default: off.',
  infoAutoRefillRow: 'On: a gap in your row is refilled from the quick pile instantly and for free. Off: refilling is a move of its own — tap the empty slot — which costs reaction time like in the physical game. Default: on.',
  infoQuickToCenter: 'On: the top card of your quick pile can be played straight onto the center piles (the rulebook allows this). Off: the quick pile only drains by refilling your row, which keeps the row as the single bottleneck. Default: off.',
  infoRoundEndModeCall: 'Off: the round ends the instant a quick pile is empty. On: emptying the pile is not enough — the player must also tap Stop, and may keep playing for extra points first, like in the physical game. Default: off.',
  infoShuffleOnRecycle: 'When the hand stock runs out, the waste is picked up face-down. On: it is shuffled (rulebook). Off: it is only flipped over — beware, this house rule can loop the same cards forever; the app then ends the round after a grace period. Default: on.',
  infoEarlyStalemate: 'The app can prove from the face-down piles that no card will ever fit — but players cannot see that. On: such rounds end immediately (feels abrupt). Off: the app waits until nobody can move at all, or gives a 12-second grace on provably stuck positions. Default: off.',
  proVariant: 'Pro variant (row as buffer)',
  proDescendingStep: 'Buffer stacking: any smaller / exactly −1',
  proStepAny: 'any smaller',
  proStepOne: 'exactly −1',
  proAllowEmptySlot: 'Buffer onto empty slots allowed',
  autoRefillRow: 'Refill row automatically',
  quickToCenter: 'Quick pile may play straight to the center',
  earlyStalemate: 'End a stuck round early (uses hidden cards players can’t see)',
  roundEndModeCall: 'Round ends only when Stop is called',
  shuffleOnRecycle: 'Shuffle waste when recycling (rulebook)',
  connectionLost: 'Connection to {name} lost. Waiting to reconnect…',
  hostGone: 'Connection to the host lost.',
  roomFull: 'This game is full or already running.',
  cannotPlayHere: 'This card does not fit here',
  install: 'Install app',
  installed: 'Installed — works offline',
  you: 'you',
  quickLeft: '{n} left',
  copy: 'Copy',
  copied: 'Copied!',
  micDenied: 'Microphone unavailable — enter the code manually.',
  downloadLog: '⬇ Debug log',
  about: 'About',
  aboutAuthors: 'By Julian & Jan',
  aboutVersion: 'Version {v}',
  aboutNote: 'A real-time card race for 2–4 players — on one device or across phones.',
  howToPlay: 'How to play',
  close: 'Close',
  manual: `GOAL
Empty your quick pile before everyone else and collect points in the center. All players play at the same time — there are no turns.

THE CENTER
A pile is opened with a 1 and grows strictly in order: 2, 3, 4 … up to 10, always in one color. Any player may play onto any center pile at any moment — whoever is first, wins the spot.

YOUR AREA
· Row: face-up cards in front of you. When you play one away, the gap is filled from your quick pile.
· Quick pile: your countdown. It drains by refilling the gaps in your row — get rid of all of it! (A rule switch in the settings also allows playing its top card straight to the center.)
· Hand stock: flip three cards at a time onto your waste fan. All three flipped cards stay visible, but only the top one is playable. When the stock runs out, the waste is turned over (and shuffled, by default) and you keep flipping.

PLAYING A CARD
Tap a card: if it fits exactly one place, it flies there immediately. With several options, the legal targets light up — tap one. If someone beats you to the pile, your card snaps back: that is a lost race, not a mistake.

END OF A ROUND
The round ends the moment a player's quick pile is empty (or, in the call variant, when they tap Stop after emptying it). If nobody can move at all, the round ends in a stalemate.

SCORING
+1 for each of your cards in the center, −2 for each card left in your quick pile. The match runs over a set number of rounds; the highest total wins.

PRO VARIANT
Your row becomes a buffer: you may place a quick-pile or waste card onto a row card of a different color and higher value. Deeper planning, riskier rows.

FAIR PLAY ACROSS PHONES
When two taps race for the same pile, the measured reaction time decides — not the network. Playing on the host's phone gives no advantage.`,
} as const;

export type Strings = { [K in keyof typeof en]: string };

export const de: Strings = {
  appName: 'Stackrush',
  tagline: 'Das hektische Kartenrennen für 2–4 Spieler',
  newGame: 'Neues Spiel',
  playLocal: 'Auf diesem Gerät spielen',
  hostOnline: 'Online-Spiel eröffnen',
  joinGame: 'Spiel beitreten',
  roomCode: 'Raumcode',
  enterCode: 'Raumcode eingeben',
  pairBySound: '🔊 Per Klang koppeln',
  listening: 'Lauscht… Handys nah zusammenhalten',
  beaconing: 'Raumcode wird per Klang gesendet…',
  players: 'Spieler',
  addBot: '＋ Computerspieler',
  difficulty: 'Schwierigkeit',
  botL1: '1 · Verträumt',
  botL2: '2 · Anfänger',
  botL3: '3 · Lernt noch',
  botL4: '4 · Gemütlich',
  botL5: '5 · Solide',
  botL6: '6 · Locker',
  botL7: '7 · Geübt',
  botL8: '8 · Stark',
  botL9: '9 · Bissig',
  botL10: '10 · Experte',
  seatsOnThisDevice: 'Plätze an diesem Gerät',
  seatName: 'Name',
  startRound: 'Runde starten',
  startGame: 'Spiel starten',
  waitingForHost: 'Warte auf den Gastgeber…',
  waitingForPlayers: 'Code teilen — warte auf Mitspieler…',
  callStop: 'Stopp!',
  flipHand: '3 umdrehen',
  round: 'Runde {n}',
  roundOf: 'Runde {n} / {total}',
  score: 'Punkte',
  youScored: '{points} Punkte',
  roundEndedBy: '{name} hat die Runde beendet',
  stoppedBy: '{name} hat den Schnellstapel geleert — Stopp!',
  winByPoints: 'Meiste Punkte nach {n} Runden',
  colCenter: 'Mitte',
  colQuick: 'Schnellstapel',
  colRound: 'Runde',
  colTotal: 'Gesamt',
  stalemate: 'Keine Züge mehr möglich — Runde beendet',
  matchWinner: 'Sieger: {name}',
  matchWinners: 'Sieger: {names}',
  nextRound: 'Nächste Runde',
  rematch: 'Revanche',
  backToLobby: 'Zurück zur Lobby',
  leaveGame: 'Verlassen',
  centerCards: '+1 × {n} Mitte',
  quickPenalty: '−2 × {n} Schnellstapel',
  total: 'Gesamt',
  settings: 'Einstellungen',
  language: 'Sprache',
  languageAuto: 'Automatisch',
  rules: 'Regelvarianten',
  resetDefaults: 'Zurück zu Standardwerten',
  infoTitle: 'Was bewirkt das?',
  targetRounds: 'Runden pro Partie',
  infoTargetRounds: 'Die Partie läuft über so viele Runden; die Punkte werden über die Runden addiert, die höchste Summe gewinnt. Standard: 1.',
  infoProVariant: 'Profi-Variante: Deine Reihe wird zum Zwischenspeicher. Du darfst eine Karte vom Schnell- oder Ablagestapel auf eine Reihenkarte anderer Farbe mit höherem Wert legen, absteigend gestapelt. Mehr Planung, riskantere Reihen. Standard: aus.',
  infoProDescendingStep: 'Nur in der Profi-Variante relevant: Ob eine gepufferte Karte BELIEBIG kleiner sein darf („beliebig kleiner", wörtliche Lesart) oder genau um eins kleiner sein muss („genau −1", strenger). Standard: beliebig kleiner.',
  infoProAllowEmptySlot: 'Nur in der Profi-Variante relevant: Ob eine Karte vom Schnell- oder Ablagestapel auf einen LEEREN Reihenplatz gelegt werden darf. Aus hält leere Plätze für den Schnellstapel frei. Standard: aus.',
  infoAutoRefillRow: 'An: Eine Lücke in der Reihe wird sofort und kostenlos vom Schnellstapel aufgefüllt. Aus: Auffüllen ist ein eigener Zug — leeren Platz antippen — und kostet Reaktionszeit wie im echten Spiel. Standard: an.',
  infoQuickToCenter: 'An: Die oberste Karte des Schnellstapels darf direkt auf die Mittelstapel gespielt werden (das Regelheft erlaubt das). Aus: Der Schnellstapel leert sich nur über das Nachrücken in die Reihe — die Reihe bleibt der einzige Engpass. Standard: aus.',
  infoRoundEndModeCall: 'Aus: Die Runde endet sofort, wenn ein Schnellstapel leer ist. An: Der leere Stapel reicht nicht — der Spieler muss zusätzlich Stopp tippen und darf vorher weiterspielen, um Punkte zu sammeln, wie im echten Spiel. Standard: aus.',
  infoShuffleOnRecycle: 'Ist der Handstapel aufgebraucht, wird die Ablage verdeckt aufgenommen. An: Sie wird gemischt (Regelheft). Aus: Sie wird nur umgedreht — Achtung, diese Hausregel kann dieselben Karten endlos im Kreis führen; die App beendet die Runde dann nach einer Kulanzzeit. Standard: an.',
  infoEarlyStalemate: 'Die App kann aus den verdeckten Stapeln beweisen, dass nie wieder eine Karte passt — die Spieler sehen das aber nicht. An: Solche Runden enden sofort (wirkt abrupt). Aus: Die App wartet, bis niemand mehr irgendeinen Zug hat, bzw. gibt bei beweisbar festgefahrenen Stellungen 12 Sekunden Kulanz. Standard: aus.',
  proVariant: 'Profi-Variante (Reihe als Zwischenspeicher)',
  proDescendingStep: 'Ablage im Puffer: beliebig kleiner / genau −1',
  proStepAny: 'beliebig kleiner',
  proStepOne: 'genau −1',
  proAllowEmptySlot: 'Puffer auf leere Plätze erlaubt',
  autoRefillRow: 'Reihe automatisch auffüllen',
  quickToCenter: 'Schnellstapel darf direkt in die Mitte',
  earlyStalemate: 'Festgefahrene Runde früh beenden (nutzt verdeckte Karten)',
  roundEndModeCall: 'Runde endet erst durch Stopp-Ruf',
  shuffleOnRecycle: 'Ablage beim Aufnehmen mischen (Regelheft)',
  connectionLost: 'Verbindung zu {name} verloren. Warte auf Wiederverbindung…',
  hostGone: 'Verbindung zum Gastgeber verloren.',
  roomFull: 'Dieses Spiel ist voll oder läuft bereits.',
  cannotPlayHere: 'Diese Karte passt hier nicht',
  install: 'App installieren',
  installed: 'Installiert — funktioniert offline',
  you: 'du',
  quickLeft: 'noch {n}',
  copy: 'Kopieren',
  copied: 'Kopiert!',
  micDenied: 'Mikrofon nicht verfügbar — Code bitte manuell eingeben.',
  downloadLog: '⬇ Debug-Log',
  about: 'Über',
  aboutAuthors: 'Von Julian & Jan',
  aboutVersion: 'Version {v}',
  aboutNote: 'Ein Echtzeit-Kartenrennen für 2–4 Spieler — auf einem Gerät oder über mehrere Handys.',
  howToPlay: 'Spielanleitung',
  close: 'Schließen',
  manual: `ZIEL
Leere deinen Schnellstapel vor allen anderen und sammle Punkte in der Mitte. Alle spielen gleichzeitig — es gibt keine Züge.

DIE MITTE
Ein Stapel wird mit einer 1 eröffnet und wächst streng der Reihe nach: 2, 3, 4 … bis 10, immer in einer Farbe. Jeder darf jederzeit auf jeden Mittelstapel legen — wer zuerst kommt, bekommt den Platz.

DEIN BEREICH
· Reihe: offene Karten vor dir. Spielst du eine weg, rückt eine Karte vom Schnellstapel nach.
· Schnellstapel: dein Countdown. Er leert sich, indem er die Lücken deiner Reihe auffüllt — werde alle Karten los! (Ein Regelschalter in den Einstellungen erlaubt zusätzlich, die oberste Karte direkt in die Mitte zu spielen.)
· Handstapel: decke immer drei Karten auf deinen Ablagefächer auf. Alle drei aufgedeckten Karten bleiben sichtbar, spielbar ist nur die oberste. Ist der Handstapel leer, wird die Ablage umgedreht (standardmäßig gemischt) und es geht weiter.

EINE KARTE SPIELEN
Tippe eine Karte an: passt sie an genau eine Stelle, fliegt sie sofort dorthin. Bei mehreren Möglichkeiten leuchten die gültigen Ziele auf — tippe eines an. Ist dir jemand zuvorgekommen, schnappt die Karte zurück: ein verlorenes Rennen, kein Fehler.

RUNDENENDE
Die Runde endet, sobald ein Schnellstapel leer ist (oder in der Stopp-Variante, wenn danach Stopp gerufen wird). Kann niemand mehr ziehen, endet die Runde in einer Blockade.

WERTUNG
+1 für jede eigene Karte in der Mitte, −2 für jede Restkarte im Schnellstapel. Die Partie läuft über eine vereinbarte Rundenzahl; die höchste Summe gewinnt.

PROFI-VARIANTE
Deine Reihe wird zum Zwischenspeicher: Du darfst eine Karte vom Schnell- oder Ablagestapel auf eine Reihenkarte anderer Farbe mit höherem Wert legen. Mehr Planung, riskantere Reihen.

FAIRNESS ÜBER HANDYS HINWEG
Rasen zwei Tipper auf denselben Stapel, entscheidet die gemessene Reaktionszeit — nicht das Netzwerk. Auf dem Gastgeber-Handy zu spielen bringt keinen Vorteil.`,
};

export const locales = { en, de } as const;
export type Locale = keyof typeof locales;

/**
 * Resolve the effective locale.
 * @param override user setting: a locale or 'auto'
 * @param preferred navigator.languages (or any BCP-47 list)
 */
export function pickLocale(override: Locale | 'auto', preferred: readonly string[]): Locale {
  if (override !== 'auto') return override;
  for (const tag of preferred) {
    const base = tag.toLowerCase().split('-')[0];
    if (base in locales) return base as Locale;
  }
  return 'en';
}

/** t(de, 'round', { n: 2 }) -> 'Runde 2' */
export function t(strings: Strings, key: keyof Strings, params?: Record<string, string | number>): string {
  let s: string = strings[key];
  if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

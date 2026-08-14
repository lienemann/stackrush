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
  botL1: '1 · Novice',
  botL2: '2 · Casual',
  botL3: '3 · Skilled',
  botL4: '4 · Sharp',
  botL5: '5 · Expert',
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
  targetRounds: 'Rounds per match',
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
  aboutNote: 'An independent, freely written real-time card race. Original rules text, own card design, no affiliation with any published game.',
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
  botL1: '1 · Anfänger',
  botL2: '2 · Locker',
  botL3: '3 · Geübt',
  botL4: '4 · Stark',
  botL5: '5 · Experte',
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
  targetRounds: 'Runden pro Partie',
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
  aboutNote: 'Ein unabhängiges, frei formuliertes Echtzeit-Kartenrennen. Eigener Regeltext, eigenes Kartendesign, keine Verbindung zu einem verlegten Spiel.',
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

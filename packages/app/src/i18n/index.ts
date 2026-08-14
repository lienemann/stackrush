/**
 * Tiny framework-free i18n. Autodetect from navigator.languages with manual
 * override persisted by the app (see pickLocale). Strings are fully typed:
 * adding a key to `en` forces a German translation at compile time.
 */
export const en = {
  appName: 'Stackrush',
  newGame: 'New game',
  joinGame: 'Join game',
  roomCode: 'Room code',
  players: 'Players',
  seatsOnThisDevice: 'Seats on this device',
  startRound: 'Start round',
  callStop: 'Stop!',
  flipHand: 'Flip 3',
  round: 'Round {n}',
  score: 'Score',
  youScored: '{points} points',
  roundEndedBy: '{name} ended the round',
  stalemate: 'No moves left — round ended',
  matchWinner: 'Winner: {name}',
  matchWinners: 'Winners: {names}',
  settings: 'Settings',
  language: 'Language',
  languageAuto: 'Automatic',
  proVariant: 'Pro variant (row as buffer)',
  roundEndModeCall: 'Round ends only when Stop is called',
  connectionLost: 'Connection to {name} lost. Waiting to reconnect…',
  cannotPlayHere: 'This card does not fit here',
} as const;

export type Strings = { [K in keyof typeof en]: string };

export const de: Strings = {
  appName: 'Stackrush',
  newGame: 'Neues Spiel',
  joinGame: 'Spiel beitreten',
  roomCode: 'Raumcode',
  players: 'Spieler',
  seatsOnThisDevice: 'Plätze an diesem Gerät',
  startRound: 'Runde starten',
  callStop: 'Stopp!',
  flipHand: '3 umdrehen',
  round: 'Runde {n}',
  score: 'Punkte',
  youScored: '{points} Punkte',
  roundEndedBy: '{name} hat die Runde beendet',
  stalemate: 'Keine Züge mehr möglich — Runde beendet',
  matchWinner: 'Sieger: {name}',
  matchWinners: 'Sieger: {names}',
  settings: 'Einstellungen',
  language: 'Sprache',
  languageAuto: 'Automatisch',
  proVariant: 'Profi-Variante (Reihe als Zwischenspeicher)',
  roundEndModeCall: 'Runde endet erst durch Stopp-Ruf',
  connectionLost: 'Verbindung zu {name} verloren. Warte auf Wiederverbindung…',
  cannotPlayHere: 'Diese Karte passt hier nicht',
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

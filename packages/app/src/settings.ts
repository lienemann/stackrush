import { Locale, Strings, locales, pickLocale } from './i18n/index.js';

/** Device-local settings, persisted in localStorage. */
export interface DeviceSettings {
  locale: Locale | 'auto';
  seatNames: string[];
  deviceKey: string;
  /** per local seat (by order on this device): highlight legal targets */
  hintsBySeat: boolean[];
}

const KEY = 'stackrush.settings.v1';

function fresh(): DeviceSettings {
  return {
    locale: 'auto',
    seatNames: [],
    deviceKey: `dev-${crypto.getRandomValues(new Uint32Array(2)).join('-')}`,
    hintsBySeat: [],
  };
}

export function loadSettings(): DeviceSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...fresh(), ...(JSON.parse(raw) as Partial<DeviceSettings>) };
  } catch { /* first run / private mode */ }
  const s = fresh();
  saveSettings(s);
  return s;
}

export function saveSettings(s: DeviceSettings): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

export function strings(s: DeviceSettings): Strings {
  return locales[pickLocale(s.locale, navigator.languages ?? [navigator.language])];
}

import { registerSW } from 'virtual:pwa-register';

/** Offline service worker (auto-updating precache via vite-plugin-pwa). */
export function initServiceWorker(): void {
  registerSW({ immediate: true });
}

// ---------- install prompt ----------

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredInstall: BeforeInstallPromptEvent | null = null;
const installListeners: Array<() => void> = [];

export function initInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredInstall = e as BeforeInstallPromptEvent;
    installListeners.forEach(cb => cb());
  });
  window.addEventListener('appinstalled', () => {
    deferredInstall = null;
    installListeners.forEach(cb => cb());
  });
}

export function onInstallAvailabilityChange(cb: () => void): void {
  installListeners.push(cb);
}

/** returns a prompt trigger, or null when installation isn't offered */
export function installTrigger(): (() => void) | null {
  if (!deferredInstall) return null;
  return () => {
    void deferredInstall?.prompt();
    void deferredInstall?.userChoice.then(() => {
      deferredInstall = null;
      installListeners.forEach(cb => cb());
    });
  };
}

// ---------- wake lock (screen stays on during rounds) ----------

let wakeLock: WakeLockSentinel | null = null;
let wantWakeLock = false;

async function acquire(): Promise<void> {
  try {
    wakeLock = await navigator.wakeLock?.request('screen') ?? null;
  } catch { /* battery saver / unsupported — non-fatal */ }
}

export function initWakeLock(): void {
  document.addEventListener('visibilitychange', () => {
    if (wantWakeLock && document.visibilityState === 'visible') void acquire();
  });
}

export function setWakeLock(active: boolean): void {
  wantWakeLock = active;
  if (active && !wakeLock) void acquire();
  if (!active && wakeLock) {
    void wakeLock.release().catch(() => undefined);
    wakeLock = null;
  }
}

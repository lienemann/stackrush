import '@fontsource/archivo-black/index.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-600.css';
import './styles.css';

import { BotLevel } from '@stackrush/core';
import { LoopbackHub, Transport } from '@stackrush/net';
import { Strings, t } from './i18n/index.js';
import { DeviceSettings, loadSettings, saveSettings, strings } from './settings.js';
import { HostSession } from './game/host.js';
import { ClientSession } from './game/client.js';
import { newRoomCode } from './game/protocol.js';
import { TableView } from './ui/table.js';
import { renderHome, renderLobby, showGameMenu } from './ui/screens.js';
import { h, toast } from './ui/dom.js';
import {
  initInstallPrompt, initServiceWorker, initWakeLock,
  installTrigger, onInstallAvailabilityChange, setWakeLock,
} from './pwa.js';

type Screen = 'home' | 'lobby' | 'table';

const root = document.getElementById('app')!;
const settings: DeviceSettings = loadSettings();
let S: Strings = strings(settings);

let screen: Screen = 'home';
let host: HostSession | null = null;
let client: ClientSession | null = null;
let table: TableView | null = null;
let stopBeacon: (() => void) | null = null;
let stopAcoustic: (() => void) | null = null;
let helloTimer: ReturnType<typeof setInterval> | null = null;

initServiceWorker();
initInstallPrompt();
initWakeLock();
onInstallAvailabilityChange(() => { if (screen === 'home') render(); });

// ---------- session wiring ----------

function attachClient(c: ClientSession, seatNames: string[]): void {
  settings.seatNames = seatNames;
  saveSettings(settings);
  client = c;
  c.on('lobby', lobby => {
    if (screen === 'table' && !lobby.started) {
      // the host sent everyone back to the lobby (roster preserved)
      table = null;
      screen = 'lobby';
    } else if (screen !== 'table') {
      screen = 'lobby';
    }
    render();
  });
  c.on('state', () => {
    if (screen !== 'table') screen = 'table';
    render();
  });
  c.on('rollback', action => table?.rollback(action));
  c.on('refused', (reason, free) => {
    // precise message, and back to home with the code preserved — the player
    // fixes their seat list and taps Join again, no hard kick
    toast(reason === 'started' ? S.roomStarted : t(S, 'roomSeats', { n: free }), 3500);
    leave();
  });
  c.on('hostGone', () => {
    if (!host) showBanner(S.hostGone, S.leaveGame, leave);
  });
  c.hello(seatNames);
}

/** add the bots configured on the home screen once the human seats register */
function applyPendingBots(bots: number[]): void {
  if (!host || bots.length === 0) return;
  const h = host;
  // defer past the hello round-trip so bots seat AFTER the humans (humans first)
  setTimeout(() => bots.forEach(l => h.addBot(clampLevel(l))), 0);
}

const clampLevel = (l: number): BotLevel =>
  Math.max(1, Math.min(10, Math.round(l))) as BotLevel;

function playLocal(seatNames: string[], botLevels: number[] = []): void {
  const hub = new LoopbackHub();
  host = new HostSession({}, null, [hub.endpoint('host-net')]);
  attachClient(new ClientSession(hub.endpoint('ui'), settings.deviceKey), seatNames);
  applyPendingBots(botLevels);
}

async function hostOnline(seatNames: string[], botLevels: number[] = []): Promise<void> {
  const code = newRoomCode();
  const hub = new LoopbackHub();
  let transports: Transport[] = [hub.endpoint('host-net')];
  try {
    const { TrysteroTransport } = await import('@stackrush/net/trystero');
    transports = [...transports, new TrysteroTransport(code)];
  } catch {
    toast('WebRTC unavailable — local play only');
  }
  host = new HostSession({}, code, transports);
  attachClient(new ClientSession(hub.endpoint('ui'), settings.deviceKey), seatNames);
  applyPendingBots(botLevels);
}

let lastCode = '';

async function join(code: string, seatNames: string[]): Promise<void> {
  lastCode = code;
  try {
    const { TrysteroTransport } = await import('@stackrush/net/trystero');
    const tr = new TrysteroTransport(code);
    const c = new ClientSession(tr, settings.deviceKey);
    attachClient(c, seatNames);
    // signaling is asynchronous: repeat hello until the host's lobby arrives
    tr.onPeerJoin(() => { if (!c.lobby) c.hello(seatNames); });
    helloTimer = setInterval(() => {
      if (c.lobby) { clearInterval(helloTimer!); helloTimer = null; return; }
      c.hello(seatNames);
    }, 1500);
    screen = 'lobby';
    render();
  } catch {
    toast(S.hostGone);
  }
}

/** acoustic pairing, joiner side: listen for a room-code beacon */
async function listenForCode(seatNames: string[]): Promise<void> {
  try {
    const { AcousticTransport } = await import('@stackrush/net/acoustic');
    const ac = new AcousticTransport({ deviceId: 2 });
    await ac.start(true);

    // listening sheet: live input level + a way out
    const bar = h('div', { className: 'levelbar' });
    const backdrop = h('div', { className: 'sheet-backdrop' },
      h('div', { className: 'sheet' },
        h('h2', {}, S.pairBySound),
        h('p', { className: 'hint' }, S.listening),
        h('div', { className: 'leveltrack' }, bar),
        h('button', { className: 'ghost', onclick: () => { stopAcoustic?.(); stopAcoustic = null; } }, S.close),
      ));
    document.body.append(backdrop);
    stopAcoustic = () => { ac.close(); backdrop.remove(); };
    ac.onLevel(rms => {
      bar.style.width = `${Math.min(100, Math.round(rms * 700))}%`;
    });
    ac.onMessage((_peer, data) => {
      const text = new TextDecoder().decode(data);
      if (text.startsWith('SR:')) {
        stopAcoustic?.();
        stopAcoustic = null;
        void join(text.slice(3), seatNames);
      }
    });
  } catch {
    toast(S.micDenied);
  }
}

/** acoustic pairing, host side: beacon the room code */
async function beaconCode(): Promise<void> {
  const code = client?.lobby?.roomCode;
  if (!code) return;
  if (stopBeacon) { stopBeacon(); stopBeacon = null; return; } // toggle off
  try {
    const { AcousticTransport } = await import('@stackrush/net/acoustic');
    const ac = new AcousticTransport({ deviceId: 1 });
    await ac.start(false); // speaker only, no mic needed to beacon
    const stop = ac.beacon(new TextEncoder().encode(`SR:${code}`));
    stopBeacon = () => { stop(); ac.close(); };
    toast(S.beaconing, 4000);
  } catch {
    toast(S.micDenied);
  }
}

function leave(): void {
  stopBeacon?.(); stopBeacon = null;
  stopAcoustic?.(); stopAcoustic = null;
  if (helloTimer) { clearInterval(helloTimer); helloTimer = null; }
  client?.close();
  host?.close();
  client = null;
  host = null;
  table = null;
  setWakeLock(false);
  hideBanner();
  screen = 'home';
  render();
}

// ---------- banner ----------

let banner: HTMLElement | null = null;
function showBanner(text: string, actionLabel?: string, onAction?: () => void): void {
  hideBanner();
  banner = h('div', { className: 'banner' }, text,
    actionLabel && onAction
      ? h('button', { className: 'banner-btn', onclick: () => onAction() }, actionLabel)
      : null);
  document.body.append(banner);
}
function hideBanner(): void { banner?.remove(); banner = null; }

// ---------- render loop ----------

function render(): void {
  S = strings(settings);
  switch (screen) {
    case 'home':
      setWakeLock(false);
      renderHome(root, S, settings, {
        onPlayLocal: (n, bots) => playLocal(n, bots),
        onHostOnline: (n, bots) => void hostOnline(n, bots),
        onJoin: (code, n) => void join(code, n),
        onListen: n => void listenForCode(n),
        onLocale: setLocale,
        installPrompt: installTrigger(),
        initialCode: lastCode,
      });
      return;
    case 'lobby': {
      const lobby = client?.lobby;
      if (!lobby) {
        root.replaceChildren(h('div', { className: 'screen' },
          h('p', { className: 'tagline' }, S.waitingForHost),
          h('button', { className: 'ghost', onclick: leave }, S.leaveGame)));
        return;
      }
      renderLobby(root, S, lobby, {
        isHost: host !== null,
        onStart: () => host?.start(),
        onConfig: patch => host?.updateConfig(patch),
        onBeacon: () => void beaconCode(),
        onAddBot: level => host?.addBot(clampLevel(level)),
        onRemovePlayer: i => host?.removePlayer(i),
        onLeave: leave,
      });
      return;
    }
    case 'table': {
      if (!client) return;
      stopBeacon?.(); stopBeacon = null; // pairing done once the game runs
      if (!table) {
        table = new TableView(root, client, settings.deviceKey, S,
          host ? {
            nextRound: () => host!.nextRound(),
            rematch: () => host!.rematch(),
            backToLobby: () => { table = null; screen = 'lobby'; host!.backToLobby(); },
          } : null,
          () => showGameMenu(S, settings, setLocale, leave,
            host ? downloadDebugLog : undefined,
            host ? () => { table = null; screen = 'lobby'; host!.backToLobby(); } : undefined),
          leave);
      }
      table.setStrings(S);
      table.render();
      const playing = client.displayState()?.phase === 'playing';
      setWakeLock(!!playing);
      // stamp the render time of this authoritative version — the basis of
      // reactionMs (docs/ARCHITECTURE.md data flow)
      const version = client.version;
      requestAnimationFrame(ts => client?.markRendered(version, ts));
      return;
    }
  }
}

/**
 * Export the host's JSONL debug log. Anchor-downloads of blob URLs fail
 * silently on iOS (especially installed PWAs), so the ladder is:
 * native share sheet (mobile) → anchor download (desktop) → clipboard.
 */
async function downloadDebugLog(): Promise<void> {
  if (!host) return;
  const text = host.debugLogJSONL() || '{}\n';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const name = `stackrush-debug-${stamp}.jsonl`;

  try {
    const file = new File([text], name, { type: 'text/plain' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      return;
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') return; // user closed the sheet
  }

  try {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(S.downloadLog);
    return;
  } catch { /* fall through to clipboard */ }

  try {
    await navigator.clipboard.writeText(text);
    toast(S.copied);
  } catch {
    toast('✗');
  }
}

function setLocale(locale: DeviceSettings['locale']): void {
  settings.locale = locale;
  saveSettings(settings);
  render();
}

window.addEventListener('pagehide', () => { host?.close(); client?.close(); });

// deep link from a shared join link / scanned QR: prefill the room code
const joinParam = new URLSearchParams(location.search).get('join');
if (joinParam) {
  lastCode = joinParam.toUpperCase().slice(0, 8);
  history.replaceState(null, '', location.pathname);
}

render();

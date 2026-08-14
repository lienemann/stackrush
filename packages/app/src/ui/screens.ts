import { Config } from '@stackrush/core';
import { Strings, locales, t } from '../i18n/index.js';
import { DeviceSettings } from '../settings.js';
import { LobbyState } from '../game/protocol.js';
import { OWNER_COLORS } from './cards.js';
import { clear, h, toast } from './dom.js';

/** Home screen + lobby (docs/UI-DESIGN.md screen 1) — plain DOM builders. */

export interface HomeCallbacks {
  onPlayLocal(seatNames: string[], botLevels: number[]): void;
  onHostOnline(seatNames: string[], botLevels: number[]): void;
  onJoin(code: string, seatNames: string[]): void;
  onListen(seatNames: string[]): void; // acoustic pairing (joiner side)
  onLocale(locale: DeviceSettings['locale']): void;
  installPrompt: (() => void) | null;
}

/**
 * Combined seat roster: human seats on this device + computer players, capped
 * at 4 total. Bots can be added right here so a solo player can set up a full
 * table in one screen (they also remain addable later in the lobby).
 */
function rosterEditor(
  S: Strings, settings: DeviceSettings,
  onChange: (names: string[], bots: number[]) => void,
): HTMLElement {
  const names = settings.seatNames.length > 0 ? [...settings.seatNames] : ['Player 1'];
  const bots: number[] = [];
  const box = h('fieldset', {});
  box.append(h('legend', {}, S.seatsOnThisDevice));
  const list = h('div', { className: 'stack' });
  const emit = () => onChange(names, bots);

  const render = () => {
    clear(list);
    names.forEach((name, i) => {
      const input = h('input', { value: name, maxlength: '14', 'aria-label': S.seatName });
      input.addEventListener('input', () => { names[i] = input.value; emit(); });
      const remove = h('button', { className: 'ghost', 'aria-label': '−',
        onclick: () => { names.splice(i, 1); render(); emit(); } }, '−');
      list.append(h('div', { className: 'rowline' }, input, names.length > 1 || bots.length ? remove : null));
    });
    bots.forEach((lvl, i) => {
      list.append(h('div', { className: 'rowline' },
        h('span', { className: 'playerchip', style: 'flex:1' },
          h('span', { className: 'dot', style: `background:${OWNER_COLORS[names.length + i] ?? '#888'}` }),
          h('span', {}, `🤖 ${S[`botL${(lvl as 1 | 2 | 3 | 4 | 5)}`]}`)),
        h('button', { className: 'ghost', 'aria-label': '−',
          onclick: () => { bots.splice(i, 1); render(); emit(); } }, '−'),
      ));
    });

    const total = names.length + bots.length;
    const controls = h('div', { className: 'rowline' });
    if (total < 4) {
      controls.append(h('button', {
        onclick: () => { names.push(`Player ${names.length + 1}`); render(); emit(); },
      }, `+ ${S.seatName}`));
      const level = h('select', { 'aria-label': S.difficulty, style: 'flex:1' });
      ([1, 2, 3, 4, 5] as const).forEach(l => level.append(h('option', { value: String(l) }, S[`botL${l}`])));
      level.value = '3';
      controls.append(level,
        h('button', { onclick: () => { bots.push(Number(level.value)); render(); emit(); } }, S.addBot));
    }
    list.append(controls);
  };
  render();
  emit();
  box.append(list);
  return box;
}

export function renderHome(root: HTMLElement, S: Strings, settings: DeviceSettings, cb: HomeCallbacks): void {
  clear(root);
  let seatNames: string[] = settings.seatNames.length > 0 ? settings.seatNames : ['Player 1'];
  let botLevels: number[] = [];

  const title = h('h1', {});
  title.append('Stack', h('span', { className: 'accent' }, 'rush'));

  const codeInput = h('input', {
    placeholder: S.roomCode, maxlength: '5', autocapitalize: 'characters',
    style: 'text-transform:uppercase;letter-spacing:0.2em;text-align:center;flex:1',
  });

  const langSel = h('select', { 'aria-label': S.language });
  langSel.append(h('option', { value: 'auto' }, S.languageAuto));
  for (const loc of Object.keys(locales)) langSel.append(h('option', { value: loc }, loc.toUpperCase()));
  langSel.value = settings.locale;
  langSel.addEventListener('change', () => cb.onLocale(langSel.value as DeviceSettings['locale']));

  root.append(h('div', { className: 'screen' },
    title,
    h('p', { className: 'tagline' }, S.tagline),
    rosterEditor(S, settings, (names, bots) => { seatNames = names; botLevels = bots; }),
    h('div', { className: 'stack' },
      h('button', { className: 'primary', onclick: () => {
        if (seatNames.length + botLevels.length < 2) { toast(`${S.players}: 2–4`); return; }
        cb.onPlayLocal(seatNames.map(n => n.trim() || '?'), botLevels);
      } }, S.playLocal),
      h('button', { onclick: () => cb.onHostOnline(seatNames.map(n => n.trim() || '?'), botLevels) }, S.hostOnline),
      h('div', { className: 'rowline' },
        codeInput,
        h('button', { onclick: () => {
          const code = codeInput.value.trim().toUpperCase();
          if (code.length < 4) { toast(S.enterCode); return; }
          cb.onJoin(code, seatNames.map(n => n.trim() || '?'));
        } }, S.joinGame),
      ),
      h('button', { className: 'ghost', onclick: () => cb.onListen(seatNames.map(n => n.trim() || '?')) }, S.pairBySound),
    ),
    h('div', { className: 'rowline', style: 'width:min(420px,100%)' },
      langSel,
      cb.installPrompt ? h('button', { onclick: () => cb.installPrompt!() }, S.install) : null,
    ),
    h('div', { className: 'rowline', style: 'width:min(420px,100%)' },
      h('button', { className: 'ghost', onclick: () => showManual(S) }, S.howToPlay),
      h('button', { className: 'ghost', onclick: () => showAbout(S) }, S.about),
    ),
  ));
}

export interface LobbyCallbacks {
  isHost: boolean;
  onStart(): void;
  onConfig(patch: Partial<Config>): void;
  onBeacon(): void; // acoustic room-code beacon (host)
  onAddBot(level: number): void;
  onRemovePlayer(index: number): void;
  onLeave(): void;
}

export function renderLobby(root: HTMLElement, S: Strings, lobby: LobbyState, cb: LobbyCallbacks): void {
  clear(root);
  const screen = h('div', { className: 'screen' });
  root.append(screen);

  if (lobby.roomCode) {
    screen.append(
      h('div', { className: 'roomcode' }, lobby.roomCode),
      h('div', { className: 'rowline', style: 'width:min(260px,100%)' },
        h('button', { onclick: async () => {
          try { await navigator.clipboard.writeText(lobby.roomCode!); toast(S.copied); }
          catch { toast(lobby.roomCode!); }
        } }, S.copy),
        cb.isHost ? h('button', { onclick: () => cb.onBeacon() }, S.pairBySound) : null,
      ),
      h('p', { className: 'hint' }, cb.isHost ? S.waitingForPlayers : S.waitingForHost),
    );
  }

  const list = h('div', { className: 'playerlist' });
  lobby.players.forEach((p, i) => {
    const removable = cb.isHost && p.bot !== undefined && !lobby.started;
    list.append(h('div', { className: `playerchip${p.connected ? '' : ' off'}` },
      h('span', { className: 'dot', style: `background:${OWNER_COLORS[i]}` }),
      h('span', { style: 'flex:1' }, p.name),
      removable ? h('button', { className: 'ghost', 'aria-label': '−', style: 'min-height:32px;padding:2px 12px',
        onclick: () => cb.onRemovePlayer(i) }, '−') : null,
    ));
  });
  screen.append(h('fieldset', {}, h('legend', {}, S.players), list));

  if (cb.isHost && lobby.players.length < 4) {
    const level = h('select', { style: 'flex:1' });
    ([1, 2, 3, 4, 5] as const).forEach(l =>
      level.append(h('option', { value: String(l) }, S[`botL${l}` as const])));
    level.value = '3';
    screen.append(h('div', { className: 'rowline', style: 'width:min(420px,100%)' },
      h('label', { style: 'flex:none;color:var(--dim)' }, S.difficulty),
      level,
      h('button', { onclick: () => cb.onAddBot(Number(level.value)) }, S.addBot),
    ));
  }

  if (cb.isHost) {
    screen.append(configEditor(S, lobby.config, cb.onConfig));
    const canStart = lobby.players.length >= 2 && lobby.players.length <= 4;
    screen.append(h('div', { className: 'stack' },
      h('button', { className: 'primary', disabled: !canStart, onclick: () => cb.onStart() },
        `${S.startGame} (${lobby.players.length})`)));
  }
  screen.append(h('div', { className: 'stack' },
    h('button', { className: 'ghost', onclick: () => cb.onLeave() }, S.leaveGame)));
}

/** Settings screen wiring ALL Config switches (architecture checklist #4) */
function configEditor(S: Strings, cfg: Config, onConfig: (patch: Partial<Config>) => void): HTMLElement {
  const box = h('fieldset', {});
  box.append(h('legend', {}, S.rules));

  const check = (label: string, value: boolean, set: (v: boolean) => void) => {
    const input = h('input', { type: 'checkbox' });
    input.checked = value;
    input.addEventListener('change', () => set(input.checked));
    return h('label', { className: 'switch' }, h('span', {}, label), input);
  };

  const rounds = h('input', { type: 'number', min: '1', max: '9', value: String(cfg.targetRounds), style: 'width:5em;flex:none' });
  rounds.addEventListener('change', () => {
    const v = Math.max(1, Math.min(9, Number(rounds.value) || 1));
    onConfig({ targetRounds: v });
  });
  box.append(h('label', { className: 'switch' }, h('span', {}, S.targetRounds), rounds));

  box.append(check(S.proVariant, cfg.proVariant, v => onConfig({ proVariant: v })));

  const stepSel = h('select', { style: 'flex:none' },
    h('option', { value: 'any' }, S.proStepAny),
    h('option', { value: 'one' }, S.proStepOne));
  stepSel.value = cfg.proDescendingStep;
  stepSel.addEventListener('change', () => onConfig({ proDescendingStep: stepSel.value as Config['proDescendingStep'] }));
  box.append(h('label', { className: 'switch' }, h('span', {}, S.proDescendingStep), stepSel));

  box.append(
    check(S.proAllowEmptySlot, cfg.proAllowEmptySlot, v => onConfig({ proAllowEmptySlot: v })),
    check(S.autoRefillRow, cfg.autoRefillRow, v => onConfig({ autoRefillRow: v })),
    check(S.quickToCenter, cfg.quickToCenter, v => onConfig({ quickToCenter: v })),
    check(S.roundEndModeCall, cfg.roundEndMode === 'call', v => onConfig({ roundEndMode: v ? 'call' : 'auto' })),
    check(S.shuffleOnRecycle, cfg.shuffleOnRecycle, v => onConfig({ shuffleOnRecycle: v })),
    check(S.earlyStalemate, cfg.earlyStalemate, v => onConfig({ earlyStalemate: v })),
  );
  return box;
}

function sheet(...children: Array<Node | string | null>): HTMLElement {
  const backdrop = h('div', { className: 'sheet-backdrop' });
  backdrop.addEventListener('click', e => { if (e.target === backdrop) backdrop.remove(); });
  backdrop.append(h('div', { className: 'sheet' }, ...children));
  document.body.append(backdrop);
  return backdrop;
}

/** in-game settings sheet (gear): language, manual, about, debug log, leave */
export function showGameMenu(
  S: Strings, settings: DeviceSettings,
  onLocale: (l: DeviceSettings['locale']) => void, onLeave: () => void,
  onDownloadLog?: () => void,
): void {
  const langSel = h('select', {});
  langSel.append(h('option', { value: 'auto' }, S.languageAuto));
  for (const loc of Object.keys(locales)) langSel.append(h('option', { value: loc }, loc.toUpperCase()));
  langSel.value = settings.locale;
  const backdrop = sheet(
    h('h2', {}, S.settings),
    h('label', { className: 'switch' }, h('span', {}, S.language), langSel),
    h('button', { onclick: () => { backdrop.remove(); showManual(S); } }, S.howToPlay),
    h('button', { onclick: () => { backdrop.remove(); showAbout(S); } }, S.about),
    onDownloadLog ? h('button', { onclick: () => onDownloadLog() }, S.downloadLog) : null,
    h('button', { onclick: () => { backdrop.remove(); onLeave(); } }, S.leaveGame),
    h('button', { className: 'ghost', onclick: () => backdrop.remove() }, S.close),
  );
  langSel.addEventListener('change', () => { onLocale(langSel.value as DeviceSettings['locale']); backdrop.remove(); });
}

/** the manual — original rules text (i18n key `manual`), rendered as sections */
export function showManual(S: Strings): void {
  const body = h('div', { className: 'manual' });
  for (const block of S.manual.split('\n\n')) {
    const [first, ...rest] = block.split('\n');
    const isHeading = first === first.toUpperCase() && rest.length > 0;
    if (isHeading) {
      body.append(h('h3', {}, first));
      body.append(h('p', {}, rest.join('\n')));
    } else {
      body.append(h('p', {}, block));
    }
  }
  const backdrop = sheet(
    h('h2', {}, S.howToPlay),
    body,
    h('button', { className: 'ghost', onclick: () => backdrop.remove() }, S.close),
  );
}

export function showAbout(S: Strings): void {
  const version = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
  const backdrop = sheet(
    h('h2', {}, `${S.appName}`),
    h('p', { className: 'breakdown' }, t(S, 'aboutVersion', { v: version })),
    h('p', {}, S.aboutAuthors),
    h('p', { className: 'breakdown' }, S.aboutNote),
    h('button', { className: 'ghost', onclick: () => backdrop.remove() }, S.close),
  );
}

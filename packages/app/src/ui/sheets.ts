import { GameState, matchWinners } from '@stackrush/core';
import { Strings, t } from '../i18n/index.js';
import { OWNER_COLORS } from './cards.js';
import { h } from './dom.js';
import type { TableHostControls } from './table.js';

/**
 * Round-end / match-end sheets (docs/UI-DESIGN.md screens 3+4):
 * score delta broken out (+n center / −2·m quick), running totals as a
 * compact bar race, host-only continuation buttons.
 */

interface NamedPlayer { name: string }

export function renderEndSheet(
  parent: HTMLElement,
  state: GameState,
  players: NamedPlayer[],
  S: Strings,
  host: TableHostControls | null,
): void {
  const backdrop = h('div', { className: 'sheet-backdrop' });
  const sheet = h('div', { className: 'sheet' });
  backdrop.append(sheet);
  parent.append(backdrop);

  const isMatchEnd = state.phase === 'matchEnded';
  const lastScores = state.roundScores[state.roundScores.length - 1] ?? [];

  // headline
  if (isMatchEnd) {
    const winners = matchWinners(state).map(i => players[i]?.name ?? `P${i + 1}`);
    sheet.append(h('h2', {}, winners.length === 1
      ? t(S, 'matchWinner', { name: winners[0] })
      : t(S, 'matchWinners', { names: winners.join(', ') })));
  } else {
    sheet.append(h('h2', {}, t(S, 'round', { n: state.round })));
    sheet.append(h('div', { className: 'breakdown' }, state.roundEndedBy === -1
      ? S.stalemate
      : t(S, 'roundEndedBy', { name: players[state.roundEndedBy]?.name ?? '?' })));
  }

  // per-player delta breakdown for the round just played
  const centerCount = (player: number) =>
    state.center.reduce((n, pile) => n + pile.owners.filter(o => o === player).length, 0);
  for (let i = 0; i < state.config.players; i++) {
    const quickLeft = state.players[i].quick.length;
    sheet.append(h('div', { className: 'breakdown' },
      `${players[i]?.name ?? `P${i + 1}`}: `,
      `${t(S, 'centerCards', { n: centerCount(i) })} · `,
      `${t(S, 'quickPenalty', { n: quickLeft })} → `,
      h('b', {}, `${lastScores[i] >= 0 ? '+' : ''}${lastScores[i] ?? 0}`),
    ));
  }

  // running totals as a bar race
  const maxAbs = Math.max(1, ...state.totals.map(v => Math.abs(v)));
  sheet.append(h('h2', {}, S.total));
  state.totals.forEach((total, i) => {
    const bar = h('div', { className: 'bar' });
    Object.assign(bar.style, {
      width: `${Math.max(3, (Math.abs(total) / maxAbs) * 100)}%`,
      background: total >= 0 ? OWNER_COLORS[i] : 'var(--danger)',
    });
    sheet.append(h('div', { className: 'scorebar' },
      h('span', { className: 'name' }, players[i]?.name ?? `P${i + 1}`),
      h('div', { className: 'bar-track' }, bar),
      h('span', { className: 'pts' }, String(total)),
    ));
  });

  // per-round table on match end
  if (isMatchEnd && state.roundScores.length > 1) {
    const table = h('table', { className: 'rounds' });
    const head = h('tr', {}, h('th', {}, S.score));
    state.roundScores.forEach((_, r) => head.append(h('th', {}, `R${r + 1}`)));
    table.append(head);
    for (let i = 0; i < state.config.players; i++) {
      const row = h('tr', {}, h('td', {}, players[i]?.name ?? `P${i + 1}`));
      state.roundScores.forEach(scores => row.append(h('td', {}, String(scores[i]))));
      table.append(row);
    }
    sheet.append(table);
  }

  if (host) {
    if (isMatchEnd) {
      sheet.append(h('button', { className: 'primary', onclick: () => host.rematch() }, S.rematch));
      sheet.append(h('button', { onclick: () => host.backToLobby() }, S.backToLobby));
    } else {
      sheet.append(h('button', { className: 'primary', onclick: () => host.nextRound() }, S.nextRound));
    }
  } else {
    sheet.append(h('div', { className: 'hint' }, S.waitingForHost));
  }
}

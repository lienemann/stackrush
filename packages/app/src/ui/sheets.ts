import { GameState, matchWinners } from '@stackrush/core';
import { Strings, t } from '../i18n/index.js';
import { OWNER_COLORS } from './cards.js';
import { fromHTML, h } from './dom.js';
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
  const name = (i: number) => players[i]?.name ?? `P${i + 1}`;

  // headline + the reason the round/match ended
  if (isMatchEnd) {
    const winners = matchWinners(state).map(name);
    sheet.append(h('h2', {}, winners.length === 1
      ? t(S, 'matchWinner', { name: winners[0] })
      : t(S, 'matchWinners', { names: winners.join(', ') })));
    sheet.append(h('div', { className: 'breakdown' },
      t(S, 'winByPoints', { n: state.roundScores.length })));
  } else {
    sheet.append(h('h2', {}, t(S, 'round', { n: state.round })));
  }
  sheet.append(h('div', { className: 'breakdown' }, state.roundEndedBy === -1
    ? S.stalemate
    : t(S, 'stoppedBy', { name: name(state.roundEndedBy) })));

  // counted points for the round just played, fully broken out
  const centerCount = (player: number) =>
    state.center.reduce((n, pile) => n + pile.owners.filter(o => o === player).length, 0);
  const table = h('table', { className: 'rounds' });
  table.append(h('tr', {},
    h('th', {}, ''),
    h('th', {}, `${S.colCenter} +1`),
    h('th', {}, `${S.colQuick} −2`),
    h('th', {}, S.colRound),
    h('th', {}, S.colTotal),
  ));
  for (let i = 0; i < state.config.players; i++) {
    const centers = centerCount(i);
    const quickLeft = state.players[i].quick.length;
    const round = lastScores[i] ?? 0;
    const row = h('tr', {},
      h('td', {},
        fromHTML(`<span class="dot" style="background:${OWNER_COLORS[i]};display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px"></span>`),
        name(i)),
      h('td', {}, `${centers} → +${centers}`),
      h('td', {}, `${quickLeft} → −${2 * quickLeft}`),
      h('td', {}, h('b', {}, `${round >= 0 ? '+' : ''}${round}`)),
      h('td', {}, String(state.totals[i])),
    );
    if (state.roundEndedBy === i) row.style.color = 'var(--go)';
    table.append(row);
  }
  sheet.append(table);

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

  // per-round history on match end
  if (isMatchEnd && state.roundScores.length > 1) {
    const history = h('table', { className: 'rounds' });
    const head = h('tr', {}, h('th', {}, S.score));
    state.roundScores.forEach((_, r) => head.append(h('th', {}, `R${r + 1}`)));
    head.append(h('th', {}, S.colTotal));
    history.append(head);
    for (let i = 0; i < state.config.players; i++) {
      const row = h('tr', {}, h('td', {}, name(i)));
      state.roundScores.forEach(scores => row.append(h('td', {}, String(scores[i]))));
      row.append(h('td', {}, h('b', {}, String(state.totals[i]))));
      history.append(row);
    }
    sheet.append(history);
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

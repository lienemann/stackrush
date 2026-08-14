import { Action, GameState, Source, apply } from '@stackrush/core';
import { Strings, t } from '../i18n/index.js';
import { ClientSession } from '../game/client.js';
import { seatRegions } from '../seats.js';
import { cardBackSVG, cardFaceSVG, slotSVG } from './cards.js';
import { clear, fromHTML, h, haptic, toast } from './dom.js';
import { renderEndSheet } from './sheets.js';

/**
 * The Table (docs/UI-DESIGN.md screen 2): 1–4 rotated seat regions per
 * device, shared center strip, tap-to-play with target highlighting.
 * Full re-render per state change — the DOM is small enough that this stays
 * well under a frame; animations key off diffs against the previous state.
 */

export interface TableHostControls {
  nextRound(): void;
  rematch(): void;
  backToLobby(): void;
}

interface Target { key: string; action: Action }

const CARD_W = 64;

export class TableView {
  private selected: { player: number; sourceKey: string; targets: Target[] } | null = null;
  private prevPileTops = new Map<number, number>();

  constructor(
    private root: HTMLElement,
    private client: ClientSession,
    private myDeviceKey: string,
    private S: Strings,
    private hostControls: TableHostControls | null,
    private onMenu: () => void,
  ) {}

  setStrings(S: Strings): void { this.S = S; }

  /** players seated on this device, in lobby order */
  private localPlayers(): number[] {
    const lobby = this.client.lobby;
    if (!lobby) return [];
    return lobby.players.flatMap((p, i) => (p.deviceKey === this.myDeviceKey ? [i] : []));
  }

  render(): void {
    const state = this.client.displayState();
    const lobby = this.client.lobby;
    if (!state || !lobby) return;
    clear(this.root);
    const table = h('div', { className: 'table' });
    this.root.append(table);

    const locals = this.localPlayers();
    const n = Math.max(1, Math.min(4, locals.length)) as 1 | 2 | 3 | 4;
    const regions = seatRegions(n);

    // seat regions
    locals.forEach((player, i) => {
      const region = regions[i];
      const seat = h('div', { className: 'seat' });
      const [x, y, w, hh] = region.rect;
      Object.assign(seat.style, {
        left: `${x * 100}%`, top: `${y * 100}%`,
        width: `${w * 100}%`, height: `${hh * 100}%`,
      });
      const inner = h('div', { className: 'seat-inner' });
      seat.append(inner);
      table.append(seat);
      this.renderSeat(inner, state, player, lobby.players[player]?.name ?? `P${player + 1}`, locals.length > 1);
      // rotate content toward this seat's edge; 90/270 swap the box dims
      requestAnimationFrame(() => {
        const r = seat.getBoundingClientRect();
        const rot = region.rotationDeg;
        if (rot === 90 || rot === 270) {
          inner.style.width = `${r.height}px`;
          inner.style.height = `${r.width}px`;
        } else {
          inner.style.width = `${r.width}px`;
          inner.style.height = `${r.height}px`;
        }
        inner.style.transform = `rotate(${rot}deg)`;
        inner.style.flexShrink = '0';
      });
    });

    this.renderCenter(table, state, lobby.players, locals, n);

    // round badge + menu
    table.append(
      h('div', { className: 'roundbadge' },
        t(this.S, 'roundOf', { n: state.round, total: state.config.targetRounds })),
      h('button', { className: 'menu', 'aria-label': this.S.settings, onclick: () => this.onMenu() }, '⚙'),
    );

    if (state.phase !== 'playing') {
      renderEndSheet(table, state, lobby.players, this.S, this.hostControls);
    }

    // remember pile tops for the next diff (pop animation)
    this.prevPileTops = new Map(state.center.map((p, i) => [i, p.height]));
  }

  // ---------- seat ----------

  private renderSeat(el: HTMLElement, state: GameState, player: number, name: string, showLabel: boolean): void {
    const p = state.players[player];
    const cfg = state.config;

    // own row (slots side by side)
    const row = h('div', { className: 'row-slots' });
    p.row.forEach((stack, slot) => {
      const top = stack[0];
      const btn = this.cardButton(`p${player}-row${slot}`, top
        ? cardFaceSVG(top, { width: CARD_W })
        : slotSVG({ width: CARD_W }));
      if (stack.length > 1) btn.append(h('span', { className: 'depth' }, `×${stack.length}`));
      btn.addEventListener('click', () => this.onTap(player, top ? { kind: 'row', slot } : null, `p${player}-row${slot}`, slot));
      row.append(btn);
    });

    // quick pile, waste, hand stock (thumb row at the region's outer edge)
    const handRow = h('div', { className: 'hand-row' });

    const quickTop = p.quick[0];
    const quick = this.cardButton(`p${player}-quick`, quickTop
      ? cardFaceSVG(quickTop, { width: CARD_W + 8 })
      : slotSVG({ width: CARD_W + 8 }));
    quick.append(h('span', { className: 'count' }, t(this.S, 'quickLeft', { n: p.quick.length })));
    quick.addEventListener('click', () => this.onTap(player, quickTop ? { kind: 'quick' } : null, `p${player}-quick`));
    handRow.append(quick);

    // waste as a 3-card fan, like the flipped packet on the table: all three
    // are visible, only the top (rightmost) card is playable
    const wasteTop = p.waste[0];
    const waste = h('button', { className: 'cardbtn fan', 'data-k': `p${player}-waste` });
    const fan = p.waste.slice(0, 3).reverse();
    if (fan.length === 0) waste.append(fromHTML(slotSVG({ width: CARD_W })));
    else for (const c of fan) waste.append(fromHTML(cardFaceSVG(c, { width: CARD_W })));
    this.applyMarks(waste, `p${player}-waste`);
    waste.addEventListener('click', () => this.onTap(player, wasteTop ? { kind: 'waste' } : null, `p${player}-waste`));
    handRow.append(waste);

    const canFlip = p.hand.length > 0 || p.waste.length > 0;
    const hand = this.cardButton(`p${player}-hand`, p.hand.length > 0
      ? cardBackSVG(player, { width: CARD_W })
      : slotSVG({ width: CARD_W, label: '↺' }));
    hand.append(h('span', { className: 'count' }, String(p.hand.length)));
    hand.addEventListener('click', () => {
      if (!canFlip) return;
      this.submit(player, { type: 'flipHand', player }, `p${player}-hand`);
    });
    handRow.append(hand);

    // Stop appears only when the own quick pile is empty (call mode)
    if (cfg.roundEndMode === 'call' && p.quick.length === 0 && state.phase === 'playing') {
      handRow.append(h('button', {
        className: 'stopbtn',
        onclick: () => this.submit(player, { type: 'callStop', player }, `p${player}-quick`),
      }, this.S.callStop));
    }

    // label sits on the region's center-facing side, clear of screen edges
    if (showLabel) el.append(h('div', { className: 'seat-label' }, name));
    el.append(row, handRow);
  }

  private cardButton(key: string, svg: string): HTMLButtonElement {
    const btn = h('button', { className: 'cardbtn', 'data-k': key });
    btn.append(fromHTML(svg));
    this.applyMarks(btn, key);
    return btn;
  }

  private applyMarks(btn: HTMLElement, key: string): void {
    if (this.selected?.sourceKey === key) btn.classList.add('selected');
    if (this.selected?.targets.some(tg => tg.key === key)) btn.classList.add('target');
  }

  // ---------- center strip ----------

  private centerRect(n: number): [number, number, number, number] {
    switch (n) {
      case 1: return [0.05, 0.04, 0.9, 0.24];
      case 3: return [0.51, 0.34, 0.47, 0.32]; // the free middle-right cell
      default: return [0.04, 0.375, 0.92, 0.25]; // 2/4 seats: shared middle band
    }
  }

  private renderCenter(table: HTMLElement, state: GameState, players: Array<{ name: string; deviceKey: string; connected: boolean }>, locals: number[], n: number): void {
    const [x, y, w, hh] = this.centerRect(n);
    const strip = h('div', { className: 'center-strip' });
    Object.assign(strip.style, {
      left: `${x * 100}%`, top: `${y * 100}%`,
      width: `${w * 100}%`, maxHeight: `${hh * 100}%`,
    });

    const piles = h('div', { className: 'center-piles' });
    state.center.forEach((pile, idx) => {
      const top = { color: pile.color, value: pile.height, owner: pile.owners[pile.owners.length - 1] ?? 0 };
      const btn = this.cardButton(`c${idx}`, cardFaceSVG(top, { width: CARD_W }));
      if (pile.height >= 10) btn.style.opacity = '0.55'; // full pile, no longer a target
      if (this.prevPileTops.get(idx) !== undefined && this.prevPileTops.get(idx) !== pile.height) {
        btn.classList.add('pop');
      }
      btn.addEventListener('click', () => this.onTargetTap(`c${idx}`));
      piles.append(btn);
    });
    // the "new pile" slot is always visible as a drop point for 1s
    const newBtn = this.cardButton('cnew', slotSVG({ width: CARD_W, label: '+' }));
    newBtn.addEventListener('click', () => this.onTargetTap('cnew'));
    piles.append(newBtn);
    strip.append(piles);

    // remote players as slim status chips — the center is the shared truth
    const remote = players.map((p, i) => ({ p, i })).filter(({ i }) => !locals.includes(i));
    if (remote.length > 0) {
      const chips = h('div', { className: 'chips' });
      for (const { p, i } of remote) {
        chips.append(h('span', { className: 'chip' },
          fromHTML(`<span class="dot" style="background:${['#E8683A', '#4A90D9', '#57A64A', '#B06AC9'][i]}"></span>`),
          h('b', {}, p.name),
          ` ${t(this.S, 'quickLeft', { n: state.players[i].quick.length })}`,
          p.connected ? '' : ' ⚠',
        ));
      }
      strip.append(chips);
    }
    table.append(strip);
  }

  // ---------- interaction (tap-to-play, fast path) ----------

  private legalTargets(player: number, source: Source): Target[] {
    const state = this.client.displayState();
    if (!state) return [];
    const targets: Target[] = [];
    const tryAdd = (key: string, action: Action) => {
      // probe against the display state; only legal moves become targets
      if (this.probe(action)) targets.push({ key, action });
    };
    state.center.forEach((_, idx) =>
      tryAdd(`c${idx}`, { type: 'playToCenter', player, source, pile: idx }));
    tryAdd('cnew', { type: 'playToCenter', player, source, pile: 'new' });
    if (source.kind !== 'row') {
      const p = state.players[player];
      p.row.forEach((stack, slot) => {
        if (state.config.proVariant) {
          tryAdd(`p${player}-row${slot}`, { type: 'playToRow', player, source, slot });
        }
        if (!state.config.autoRefillRow && source.kind === 'quick' && stack.length === 0) {
          tryAdd(`p${player}-row${slot}`, { type: 'refillRow', player, slot });
        }
      });
    }
    return targets;
  }

  private probe(action: Action): boolean {
    const state = this.client.displayState();
    if (!state) return false;
    // validation via the pure reducer — the same rules the host applies
    return apply(state, action).ok;
  }

  private onTap(player: number, source: Source | null, key: string, slot?: number): void {
    // tapping a highlighted target while a card is selected plays onto it
    if (this.selected && this.selected.targets.some(tg => tg.key === key)) {
      this.onTargetTap(key);
      return;
    }
    if (this.selected?.sourceKey === key) {
      this.selected = null;
      this.render();
      return;
    }
    if (!source) {
      // empty slot tapped directly: manual refill (G1) is a one-tap action
      if (slot !== undefined) {
        const state = this.client.displayState();
        if (state && !state.config.autoRefillRow && this.probe({ type: 'refillRow', player, slot })) {
          this.submit(player, { type: 'refillRow', player, slot }, key);
          return;
        }
      }
      this.deselect();
      return;
    }
    const targets = this.legalTargets(player, source);
    if (targets.length === 0) {
      toast(this.S.cannotPlayHere);
      this.shakeKey(key);
      return;
    }
    if (targets.length === 1) {
      // fast path: single target -> first tap plays immediately
      this.selected = null;
      this.submit(player, targets[0].action, key);
      return;
    }
    this.selected = { player, sourceKey: key, targets };
    this.render();
  }

  private onTargetTap(key: string): void {
    if (!this.selected) return;
    const target = this.selected.targets.find(tg => tg.key === key);
    if (!target) { this.deselect(); return; }
    const { player } = this.selected;
    this.selected = null;
    this.submit(player, target.action, key);
  }

  private deselect(): void {
    if (this.selected) {
      this.selected = null;
      this.render();
    }
  }

  private submit(player: number, action: Action, feedbackKey: string): void {
    const rejection = this.client.submit(action);
    if (rejection) {
      toast(this.S.cannotPlayHere);
      this.shakeKey(feedbackKey);
      haptic();
    }
    // success: the optimistic layer already re-rendered via the state event
  }

  /** rollback feedback: short shake + haptic tick — losing races is normal */
  rollback(action: Action): void {
    haptic(30);
    if ('player' in action && 'source' in action) {
      const src = (action as { source: Source }).source;
      const key = src.kind === 'row'
        ? `p${action.player}-row${src.slot}`
        : `p${action.player}-${src.kind}`;
      this.shakeKey(key);
    }
  }

  private shakeKey(key: string): void {
    const el = this.root.querySelector(`[data-k="${key}"]`);
    el?.classList.add('shake');
    setTimeout(() => el?.classList.remove('shake'), 350);
  }
}

import { Action, GameState, Source, apply } from '@stackrush/core';
import { Strings, t } from '../i18n/index.js';
import { ClientSession } from '../game/client.js';
import { seatRegions } from '../seats.js';
import { cardBackSVG, cardFaceSVG, slotSVG } from './cards.js';
import { clear, fromHTML, h, haptic } from './dom.js';
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
    private onLeave?: () => void,
  ) {}

  setStrings(S: Strings): void { this.S = S; }

  /** region assignment preference: local seats grab the bottom/near edges */
  private static readonly LOCAL_PREF: Record<number, number[]> = {
    1: [0], 2: [1, 0], 3: [2, 1, 0], 4: [3, 1, 2, 0],
  };

  render(): void {
    const state = this.client.displayState();
    const lobby = this.client.lobby;
    if (!state || !lobby) return;
    clear(this.root);
    const table = h('div', { className: 'table' });
    this.root.append(table);

    // EVERY player gets a seat at the table — bots and remote players render
    // exactly like local ones, just read-only. Locals sit at the bottom edge
    // (thumb reach), everyone else fills the far edges.
    const total = Math.max(1, Math.min(4, state.config.players)) as 1 | 2 | 3 | 4;
    const regions = seatRegions(total);
    const localPref = TableView.LOCAL_PREF[total];
    const otherPref = [...localPref].reverse();
    const taken = new Set<number>();
    const pick = (pref: number[]) => pref.find(i => !taken.has(i))!;
    const assignment: Array<{ player: number; region: number; interactive: boolean }> = [];
    for (let player = 0; player < total; player++) {
      const interactive = lobby.players[player]?.deviceKey === this.myDeviceKey;
      const region = pick(interactive ? localPref : otherPref);
      taken.add(region);
      assignment.push({ player, region, interactive });
    }

    const rowSlots = state.config.rowSize;
    for (const { player, region: ri, interactive } of assignment) {
      const region = regions[ri];
      const seat = h('div', { className: 'seat' });
      const [x, y, w, hh] = region.rect;
      Object.assign(seat.style, {
        left: `${x * 100}%`, top: `${y * 100}%`,
        width: `${w * 100}%`, height: `${hh * 100}%`,
      });
      const inner = h('div', { className: `seat-inner${interactive ? '' : ' ro'}` });
      seat.append(inner);
      table.append(seat);
      const pl = lobby.players[player];
      const label = `${pl?.name ?? `P${player + 1}`}${pl && !pl.connected ? ' ⚠' : ''}`;
      this.renderSeat(inner, state, player, label, total > 1, interactive);
      // rotate content toward this seat's edge; 90/270 swap the box dims.
      // The measured region also sets --cw, the per-seat card width, so the
      // layout scales down to small phones and 3/4 seats per screen.
      requestAnimationFrame(() => {
        const r = seat.getBoundingClientRect();
        const rot = region.rotationDeg;
        const iw = rot === 90 || rot === 270 ? r.height : r.width;
        const ih = rot === 90 || rot === 270 ? r.width : r.height;
        inner.style.width = `${iw}px`;
        inner.style.height = `${ih}px`;
        inner.style.transform = `rotate(${rot}deg)`;
        inner.style.flexShrink = '0';
        // fit the row (rowSlots cards + gaps) and the hand row (quick + fan +
        // hand ≈ 3.6 card widths) into the region; height: two card rows + label
        const byRow = (iw - 20 - (rowSlots - 1) * 6) / rowSlots;
        const byHand = (iw - 36) / 3.7;
        const byHeight = (ih - 44) / 2.9;
        const cw = Math.max(30, Math.min(72, byRow, byHand, byHeight));
        inner.style.setProperty('--cw', `${Math.floor(cw)}px`);
      });
    }

    this.renderCenter(table, state, total);

    // round badge + menu
    table.append(
      h('div', { className: 'roundbadge' },
        t(this.S, 'roundOf', { n: state.round, total: state.config.targetRounds })),
      h('button', { className: 'menu', 'aria-label': this.S.settings, onclick: () => this.onMenu() }, '⚙'),
    );

    if (state.phase !== 'playing') {
      renderEndSheet(table, state, lobby.players, this.S, this.hostControls, this.onLeave);
    }

    // remember pile tops for the next diff (pop animation)
    this.prevPileTops = new Map(state.center.map((p, i) => [i, p.height]));
  }

  // ---------- seat ----------

  private renderSeat(el: HTMLElement, state: GameState, player: number, name: string, showLabel: boolean, interactive: boolean): void {
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
      if (interactive)
        btn.addEventListener('click', () => this.onTap(player, top ? { kind: 'row', slot } : null, `p${player}-row${slot}`, slot));
      row.append(btn);
    });

    // quick pile, waste, hand stock (thumb row at the region's outer edge)
    const handRow = h('div', { className: 'hand-row' });

    // the quick pile is only directly tappable when a rule actually lets a
    // card leave it by tap (quick→center, or the pro buffer). Otherwise it
    // drains automatically via row refills, so it is shown but inert — tapping
    // it does nothing rather than flashing a confusing "doesn't fit" toast.
    const quickTop = p.quick[0];
    const quickActionable = cfg.quickToCenter || cfg.proVariant;
    const quick = this.cardButton(`p${player}-quick`, quickTop
      ? cardFaceSVG(quickTop, { width: CARD_W })
      : slotSVG({ width: CARD_W }));
    quick.append(h('span', { className: 'count' }, t(this.S, 'quickLeft', { n: p.quick.length })));
    if (interactive && quickActionable)
      quick.addEventListener('click', () => this.onTap(player, quickTop ? { kind: 'quick' } : null, `p${player}-quick`));
    else
      quick.classList.add('inert');
    handRow.append(quick);

    // waste as a fan of the last flipped packet: the playable card (waste[0])
    // sits fully visible and on top at the LEFT, the cards under it peek out to
    // the right, dimmed. Only the top card can be played; once it goes, the
    // next is revealed (the cascade the rulebook allows).
    const wasteTop = p.waste[0];
    const waste = h('button', { className: 'cardbtn fan', 'data-k': `p${player}-waste` });
    const fan = p.waste.slice(0, 3); // [playable, under, under]
    if (fan.length === 0) waste.append(fromHTML(slotSVG({ width: CARD_W })));
    else fan.forEach((c, i) => {
      const svg = fromHTML(cardFaceSVG(c, { width: CARD_W }));
      svg.style.zIndex = String(fan.length - i); // leftmost (playable) on top
      if (i === 0) svg.classList.add('top');
      waste.append(svg);
    });
    this.applyMarks(waste, `p${player}-waste`);
    if (interactive)
      waste.addEventListener('click', () => this.onTap(player, wasteTop ? { kind: 'waste' } : null, `p${player}-waste`));
    handRow.append(waste);

    const canFlip = p.hand.length > 0 || p.waste.length > 0;
    const hand = this.cardButton(`p${player}-hand`, p.hand.length > 0
      ? cardBackSVG(player, { width: CARD_W })
      : slotSVG({ width: CARD_W, label: '↺' }));
    hand.append(h('span', { className: 'count' }, String(p.hand.length)));
    if (interactive) hand.addEventListener('click', () => {
      if (!canFlip) return;
      this.submit(player, { type: 'flipHand', player }, `p${player}-hand`);
    });
    handRow.append(hand);

    // Stop appears only when the own quick pile is empty (call mode)
    if (interactive && cfg.roundEndMode === 'call' && p.quick.length === 0 && state.phase === 'playing') {
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
      // 4 seats sit on the four edges; their content hugs the edges, so the
      // true middle of the screen is free for the shared piles
      case 4: return [0.33, 0.375, 0.34, 0.25];
      default: return [0.04, 0.375, 0.92, 0.25]; // 2 seats: shared middle band
    }
  }

  private renderCenter(table: HTMLElement, state: GameState, n: number): void {
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
      this.flashError(key); // red blink on the card itself — no covering toast
      return;
    }
    // fast path: a single target plays immediately — and so does an ambiguity
    // among CENTER piles only, since those are interchangeable for the player
    // (same card leaves, same point). A picker appears only when the choices
    // differ in kind: center vs. pro buffer vs. manual refill.
    const allCenter = targets.every(tg => tg.action.type === 'playToCenter');
    if (targets.length === 1 || allCenter) {
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
    if (rejection) this.flashError(feedbackKey);
    // success: the optimistic layer already re-rendered via the state event
  }

  /** rollback feedback: red blink + haptic tick — losing races is normal */
  rollback(action: Action): void {
    if ('player' in action && 'source' in action) {
      const src = (action as { source: Source }).source;
      const key = src.kind === 'row'
        ? `p${action.player}-row${src.slot}`
        : `p${action.player}-${src.kind}`;
      this.flashError(key);
    } else {
      haptic(30);
    }
  }

  /** the card blinks red in place instead of a screen-covering toast */
  private flashError(key: string): void {
    haptic(25);
    const el = this.root.querySelector(`[data-k="${key}"]`);
    if (!el) return;
    el.classList.remove('err'); // restart the animation on rapid re-taps
    void (el as HTMLElement).offsetWidth;
    el.classList.add('err');
    setTimeout(() => el.classList.remove('err'), 650);
  }
}

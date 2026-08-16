import type { Card, Color } from '@stackrush/core';

/**
 * SVG card renderer (docs/UI-DESIGN.md).
 *
 * Faces are FULLY COLORED in the card color (closer to the physical game and
 * far easier to tell apart at a glance); the color's shape mark is white, the
 * numeral dark navy with a white halo so it reads identically on all four
 * colors. The value appears twice, point-symmetric (readable from any seat
 * rotation); 6 and 9 carry a baked-in underline bar.
 *
 * Card backs are colored per OWNER (player index) — the physical game's
 * card-back color — so piles reveal whose cards they hold.
 */

export const CARD_COLORS: Record<Color, string> = {
  0: '#E69F00', // amber   ▲
  1: '#56B4E9', // sky     ●
  2: '#009E73', // green   ■
  3: '#CC79A7', // plum    ◆
};

/** player/owner hues for card backs and score bars */
export const OWNER_COLORS = ['#E8683A', '#4A90D9', '#57A64A', '#B06AC9'];

const W = 100, H = 140;
const INK = '#1B2432';

/** shape mark path/element per color, centered on (0,0), radius r */
function shapeMark(color: Color, r: number): string {
  switch (color) {
    case 0: { // ▲ triangle
      const h = r * 1.15;
      return `<path d="M0 ${-h} L${h * 0.95} ${h * 0.7} L${-h * 0.95} ${h * 0.7} Z"/>`;
    }
    case 1: // ● circle
      return `<circle r="${r}"/>`;
    case 2: { // ■ square
      const s = r * 0.9;
      return `<rect x="${-s}" y="${-s}" width="${2 * s}" height="${2 * s}" rx="${s * 0.18}"/>`;
    }
    case 3: { // ◆ diamond
      const d = r * 1.2;
      return `<path d="M0 ${-d} L${d * 0.78} 0 L0 ${d} L${-d * 0.78} 0 Z"/>`;
    }
  }
}

/** one index: white shape mark behind the haloed numeral, optional 6/9 bar */
function indexGroup(card: Card, x: number, y: number, rot: number): string {
  const needsBar = card.value === 6 || card.value === 9;
  const bar = needsBar
    ? `<rect x="-13" y="17" width="26" height="4.5" rx="2" fill="${INK}"
        stroke="#FFFFFF" stroke-width="1.4" paint-order="stroke"/>`
    : '';
  return `
    <g transform="translate(${x} ${y}) rotate(${rot})">
      <g fill="#FFFFFF" opacity="0.92">${shapeMark(card.color, 22)}</g>
      <text x="0" y="0" text-anchor="middle" dominant-baseline="central"
            class="card-value" fill="${INK}"
            stroke="#FFFFFF" stroke-width="5" paint-order="stroke"
            stroke-linejoin="round">${card.value}</text>
      ${bar}
    </g>`;
}

export function cardFaceSVG(card: Card, opts: { width?: number } = {}): string {
  const w = opts.width ?? 72;
  return `
  <svg viewBox="0 0 ${W} ${H}" width="${w}" height="${(w * H) / W}" class="card face"
       role="img" aria-label="${card.value}">
    <rect x="2" y="2" width="${W - 4}" height="${H - 4}" rx="11"
          fill="${CARD_COLORS[card.color]}" stroke="rgba(0,0,0,0.35)" stroke-width="2"/>
    <rect x="5" y="5" width="${W - 10}" height="${H - 10}" rx="8"
          fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="1.6"/>
    ${indexGroup(card, 32, 40, 0)}
    ${indexGroup(card, W - 32, H - 40, 180)}
    <circle cx="${W - 15}" cy="15" r="5.5" fill="${OWNER_COLORS[card.owner] ?? '#666'}"
            stroke="#FFFFFF" stroke-width="1.6"/>
    <circle cx="15" cy="${H - 15}" r="5.5" fill="${OWNER_COLORS[card.owner] ?? '#666'}"
            stroke="#FFFFFF" stroke-width="1.6"/>
  </svg>`;
}

export function cardBackSVG(owner: number, opts: { width?: number } = {}): string {
  const w = opts.width ?? 72;
  const hue = OWNER_COLORS[owner] ?? '#666';
  return `
  <svg viewBox="0 0 ${W} ${H}" width="${w}" height="${(w * H) / W}" class="card back" aria-hidden="true">
    <defs>
      <pattern id="bk${owner}" width="14" height="14" patternUnits="userSpaceOnUse"
               patternTransform="rotate(45)">
        <rect width="14" height="14" fill="#232B3B"/>
        <rect width="7" height="14" fill="${hue}" opacity="0.55"/>
      </pattern>
    </defs>
    <rect x="2" y="2" width="${W - 4}" height="${H - 4}" rx="11" fill="url(#bk${owner})"
          stroke="${hue}" stroke-width="3"/>
  </svg>`;
}

/** empty slot / empty pile outline */
export function slotSVG(opts: { width?: number; label?: string } = {}): string {
  const w = opts.width ?? 72;
  return `
  <svg viewBox="0 0 ${W} ${H}" width="${w}" height="${(w * H) / W}" class="card slot" aria-hidden="true">
    <rect x="4" y="4" width="${W - 8}" height="${H - 8}" rx="11" fill="none"
          stroke="#8B93A7" stroke-width="2.5" stroke-dasharray="7 7" opacity="0.55"/>
    ${opts.label ? `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" dominant-baseline="central" fill="#8B93A7" font-size="30" class="card-value">${opts.label}</text>` : ''}
  </svg>`;
}

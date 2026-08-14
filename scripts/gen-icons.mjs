#!/usr/bin/env node
/**
 * Generates the PWA icons (PNG) without any image dependency: rasterizes the
 * app motif — the four color-coded shape marks from docs/UI-DESIGN.md — into
 * RGBA buffers with 4x supersampling and encodes minimal PNGs via zlib.
 *
 * Run: node scripts/gen-icons.mjs
 * Output: packages/app/public/icons/*.png + packages/app/public/favicon.svg
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../packages/app/public');

// UI-DESIGN.md tokens
const FELT = [0x1b, 0x24, 0x32];
const AMBER = [0xe6, 0x9f, 0x00];
const SKY = [0x56, 0xb4, 0xe9];
const GREEN = [0x00, 0x9e, 0x73];
const PLUM = [0xcc, 0x79, 0xa7];
const PAPER = [0xf5, 0xf3, 0xea];

// ---------- shape signed tests (u, v in -1..1 around the shape center) ----------

const inTriangle = (u, v) => v > -0.95 && v < 0.62 ? Math.abs(u) < (v + 0.95) * 0.62 : false;
const inCircle = (u, v) => u * u + v * v < 0.72;
const inSquare = (u, v) => Math.abs(u) < 0.75 && Math.abs(v) < 0.75;
const inDiamond = (u, v) => Math.abs(u) / 0.95 + Math.abs(v) / 1.05 < 1;

const SHAPES = [
  { test: inTriangle, color: AMBER },
  { test: inCircle, color: SKY },
  { test: inSquare, color: GREEN },
  { test: inDiamond, color: PLUM },
];

function roundedRectSDF(x, y, cx, cy, hw, hh, r) {
  const dx = Math.abs(x - cx) - (hw - r);
  const dy = Math.abs(y - cy) - (hh - r);
  const ox = Math.max(dx, 0), oy = Math.max(dy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(dx, dy), 0) - r;
}

/**
 * Renders the icon at `size` px. `pad` is the fraction of border padding
 * (maskable icons need ~0.18 safe zone).
 */
function renderIcon(size, pad) {
  const px = new Uint8Array(size * size * 4);
  const SS = 4; // supersampling
  const inner = size * (1 - 2 * pad);
  const off = size * pad;
  // card: centered rounded rect; shapes in a 2x2 grid on the card
  const cardHW = inner * 0.42, cardHH = inner * 0.46, cardR = inner * 0.09;
  const cx = size / 2, cy = size / 2;
  const cell = inner * 0.36;
  const centers = [
    [cx - cell / 2, cy - cell / 2], [cx + cell / 2, cy - cell / 2],
    [cx - cell / 2, cy + cell / 2], [cx + cell / 2, cy + cell / 2],
  ];
  const shapeR = cell * 0.36;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const fx = x + (sx + 0.5) / SS;
          const fy = y + (sy + 0.5) / SS;
          let c = FELT;
          const sdf = roundedRectSDF(fx, fy, cx, cy, cardHW, cardHH, cardR);
          if (sdf < 0) {
            c = PAPER;
            for (let i = 0; i < 4; i++) {
              const [scx, scy] = centers[i];
              const u = (fx - scx) / shapeR, v = (fy - scy) / shapeR;
              if (Math.abs(u) < 1.4 && Math.abs(v) < 1.4 && SHAPES[i].test(u, v)) {
                c = SHAPES[i].color;
                break;
              }
            }
          } else if (sdf < inner * 0.015) {
            c = [0x3a, 0x47, 0x63]; // card edge line
          }
          r += c[0]; g += c[1]; b += c[2];
        }
      }
      const idx = (y * size + x) * 4;
      const n = SS * SS;
      px[idx] = r / n; px[idx + 1] = g / n; px[idx + 2] = b / n; px[idx + 3] = 255;
    }
  }
  return px;
}

// ---------- minimal PNG encoder ----------

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodePNG(px, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter none
    Buffer.from(px.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- outputs ----------

mkdirSync(join(OUT, 'icons'), { recursive: true });
const targets = [
  ['icons/icon-192.png', 192, 0.06],
  ['icons/icon-512.png', 512, 0.06],
  ['icons/icon-maskable-512.png', 512, 0.18],
  ['icons/apple-touch-icon.png', 180, 0.1],
];
for (const [name, size, pad] of targets) {
  writeFileSync(join(OUT, name), encodePNG(renderIcon(size, pad), size));
  console.log(`wrote ${name}`);
}

const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<rect width="100" height="100" rx="20" fill="#1B2432"/>
<rect x="16" y="12" width="68" height="76" rx="9" fill="#F5F3EA" stroke="#3A4763" stroke-width="2"/>
<path d="M37 26 L46 41 L28 41 Z" fill="#E69F00"/>
<circle cx="63" cy="34" r="8.5" fill="#56B4E9"/>
<rect x="29" y="55" width="16" height="16" rx="2" fill="#009E73"/>
<path d="M63 53 L72 63 L63 73 L54 63 Z" fill="#CC79A7"/>
</svg>`;
writeFileSync(join(OUT, 'favicon.svg'), favicon);
console.log('wrote favicon.svg');

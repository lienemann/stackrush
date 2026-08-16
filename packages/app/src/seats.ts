/**
 * Seat model: a device hosts 1..4 seats; each seat is one player.
 * Mixed setups are first-class: e.g. 2 seats on the host phone + 2 remote.
 * Local seats submit intents through the exact same Arbiter path as remote
 * ones (reactionMs measured identically), so co-located players gain no edge.
 */
export interface Seat {
  playerIndex: number;
  deviceId: string;
  /** screen region rotation so each seat faces the shared center */
  rotationDeg: 0 | 90 | 180 | 270;
}

export interface SeatRegion {
  rotationDeg: 0 | 90 | 180 | 270;
  /** fraction of the viewport: [x, y, w, h] in 0..1 */
  rect: [number, number, number, number];
}

/**
 * Screen split for n local seats (portrait phone / tablet), like sitting
 * around a real table:
 * 1: full screen. 2: top half rotated 180° vs bottom half (face-to-face).
 * 3: top, left edge, bottom. 4: one seat per display EDGE (top/left/right/
 * bottom), each rotated so its cards face that edge; the shared center piles
 * render in the middle between the regions.
 */
export function seatRegions(n: 1 | 2 | 3 | 4): SeatRegion[] {
  switch (n) {
    case 1: return [{ rotationDeg: 0, rect: [0, 0, 1, 1] }];
    case 2: return [
      { rotationDeg: 180, rect: [0, 0, 1, 0.5] },
      { rotationDeg: 0, rect: [0, 0.5, 1, 0.5] },
    ];
    case 3: return [
      { rotationDeg: 180, rect: [0, 0, 1, 0.33] },      // top, upside down
      { rotationDeg: 90, rect: [0, 0.33, 0.5, 0.34] },  // left edge, faces right
      { rotationDeg: 0, rect: [0, 0.67, 1, 0.33] },     // bottom, upright
    ];
    case 4: return [
      { rotationDeg: 180, rect: [0, 0, 1, 0.26] },         // top edge
      { rotationDeg: 90, rect: [0, 0.26, 0.42, 0.48] },    // left edge
      { rotationDeg: 270, rect: [0.58, 0.26, 0.42, 0.48] }, // right edge
      { rotationDeg: 0, rect: [0, 0.74, 1, 0.26] },        // bottom edge
    ];
  }
}

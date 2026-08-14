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
 * Screen split for n local seats (portrait phone / tablet):
 * 1: full screen. 2: top half rotated 180° vs bottom half (face-to-face).
 * 3/4: quadrants, each rotated toward its nearest edge; the shared center
 * piles render in a common strip/eye between the regions.
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
      { rotationDeg: 90, rect: [0, 0.33, 0.5, 0.34] },  // middle left, faces right
      { rotationDeg: 0, rect: [0, 0.67, 1, 0.33] },     // bottom, upright
    ];
    case 4: return [
      { rotationDeg: 180, rect: [0, 0, 0.5, 0.5] },
      { rotationDeg: 180, rect: [0.5, 0, 0.5, 0.5] },
      { rotationDeg: 0, rect: [0, 0.5, 0.5, 0.5] },
      { rotationDeg: 0, rect: [0.5, 0.5, 0.5, 0.5] },
    ];
  }
}

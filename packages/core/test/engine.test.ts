import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newGame, makeConfig, apply, scoreRound, matchWinners,
  anyVisibleCenterPlay, isHardStalemate, defaultRowSize,
} from '../src/engine.js';
import { Card, GameState } from '../src/types.js';

const cfg4 = makeConfig({ players: 4 });

function fresh(players = 4, seed = 1, extra = {}) {
  return newGame(makeConfig({ players, ...extra }), seed);
}

test('setup: row sizes 5/4/3, quick pile 10, hand = remainder', () => {
  assert.equal(defaultRowSize(2), 5);
  assert.equal(defaultRowSize(3), 4);
  assert.equal(defaultRowSize(4), 3);
  for (const n of [2, 3, 4]) {
    const g = fresh(n);
    for (const p of g.players) {
      assert.equal(p.row.length, defaultRowSize(n));
      assert.equal(p.quick.length, 10);
      assert.equal(p.hand.length, 40 - defaultRowSize(n) - 10);
      assert.equal(p.waste.length, 0);
    }
  }
});

test('setup: each deck 40 unique cards, owner correct', () => {
  const g = fresh(4);
  g.players.forEach((p, i) => {
    const all = [...p.row.flat(), ...p.quick, ...p.hand];
    assert.equal(all.length, 40);
    assert.equal(new Set(all.map(c => `${c.color}-${c.value}`)).size, 40);
    assert.ok(all.every(c => c.owner === i));
  });
});

/** Build a test state with controlled cards */
function rig(mut: (g: GameState) => void, players = 4, extra = {}): GameState {
  const g = fresh(players, 1, extra);
  mut(g);
  return g;
}
const card = (color: number, value: number, owner = 0): Card =>
  ({ color: color as Card['color'], value, owner });

test('center: new piles only with a 1, strictly +1 in same color', () => {
  let g = rig(s => { s.players[0].row = [[card(0, 1)], [card(0, 2)], [card(1, 2)]]; });

  let r = apply(g, { type: 'playToCenter', player: 0, source: { kind: 'row', slot: 1 }, pile: 'new' });
  assert.equal(r.ok, false); assert.equal(!r.ok && r.reason, 'needValueOne');

  r = apply(g, { type: 'playToCenter', player: 0, source: { kind: 'row', slot: 0 }, pile: 'new' });
  assert.ok(r.ok); g = r.ok ? r.state : g;
  assert.equal(g.center.length, 1);

  // wrong color
  r = apply(g, { type: 'playToCenter', player: 0, source: { kind: 'row', slot: 2 }, pile: 0 });
  assert.equal(!r.ok && r.reason, 'wrongColor');
  // right color, right value
  r = apply(g, { type: 'playToCenter', player: 0, source: { kind: 'row', slot: 1 }, pile: 0 });
  assert.ok(r.ok); g = r.ok ? r.state : g;
  assert.equal(g.center[0].height, 2);
  // value gap rejected
  g.players[1].row[0] = [card(0, 5, 1)];
  r = apply(g, { type: 'playToCenter', player: 1, source: { kind: 'row', slot: 0 }, pile: 0 });
  assert.equal(!r.ok && r.reason, 'wrongValue');
});

test('row: gap is refilled from quick pile immediately (may end the round)', () => {
  let g = rig(s => {
    s.config.targetRounds = 3;
    s.players[0].row = [[card(0, 1)], [card(1, 7)], [card(2, 7)]];
    s.players[0].quick = [card(3, 9)];
  });
  const r = apply(g, { type: 'playToCenter', player: 0, source: { kind: 'row', slot: 0 }, pile: 'new' });
  assert.ok(r.ok); g = r.ok ? r.state : g;
  assert.deepEqual(g.players[0].row[0], [card(3, 9)]);
  assert.equal(g.players[0].quick.length, 0);
  // refill emptied the quick pile -> round ends ("center or row alike")
  assert.equal(g.phase, 'roundEnded');
  assert.equal(g.roundEndedBy, 0);
});

test('hand: flip of 3 with correct order, recycle when hand empty', () => {
  let g = rig(s => {
    s.players[0].hand = [card(0, 3), card(1, 4), card(2, 5), card(3, 6)];
    s.players[0].waste = [];
  });
  let r = apply(g, { type: 'flipHand', player: 0 });
  assert.ok(r.ok); g = r.ok ? r.state : g;
  // flipped as packet: former top (0,3) now lies below (2,5)
  assert.deepEqual(g.players[0].waste.map(c => c.value), [5, 4, 3]);
  r = apply(g, { type: 'flipHand', player: 0 });
  assert.ok(r.ok); g = r.ok ? r.state : g;
  assert.equal(g.players[0].hand.length, 0);
  assert.deepEqual(g.players[0].waste.map(c => c.value), [6, 5, 4, 3]);
  // hand empty -> next flip recycles waste (shuffled) and flips 3 again
  r = apply(g, { type: 'flipHand', player: 0 });
  assert.ok(r.ok); g = r.ok ? r.state : g;
  assert.equal(g.players[0].waste.length, 3);
  assert.equal(g.players[0].hand.length, 1);
});

test('scoring: +1 per card in center, −2 per card left in quick pile', () => {
  const g = rig(s => {
    s.center = [{ color: 0, height: 3, owners: [0, 0, 1] }];
    s.players[0].quick = [];
    s.players[1].quick = [card(0, 9, 1), card(1, 9, 1)];
    s.players[2].quick = []; s.players[3].quick = [];
  });
  const sc = scoreRound(g);
  assert.equal(sc[0], 2);
  assert.equal(sc[1], 1 - 4);
});

test('match: round ends via last quick-pile card, totals, winners', () => {
  let g = rig(s => {
    s.config.targetRounds = 2;
    s.config.quickToCenter = true;                       // G9: rulebook mode
    s.players[0].quick = [card(0, 1)];
    s.center = [];
  });
  let r = apply(g, { type: 'playToCenter', player: 0, source: { kind: 'quick' }, pile: 'new' });
  assert.ok(r.ok); g = r.ok ? r.state : g;
  assert.equal(g.phase, 'roundEnded');
  assert.equal(g.roundScores.length, 1);

  r = apply(g, { type: 'startNextRound', seed: 42 });
  assert.ok(r.ok); g = r.ok ? r.state : g;
  assert.equal(g.phase, 'playing');
  assert.equal(g.round, 2);
  assert.equal(g.players[0].quick.length, 10);

  // end round 2 immediately
  g.players[2].quick = [card(2, 1, 2)];
  r = apply(g, { type: 'playToCenter', player: 2, source: { kind: 'quick' }, pile: 'new' });
  assert.ok(r.ok); g = r.ok ? r.state : g;
  assert.equal(g.phase, 'matchEnded');
  assert.ok(matchWinners(g).length >= 1);
});

test('pro variant: descending + color change onto row, else rejected', () => {
  let g = rig(s => {
    s.config.proVariant = true;
    s.players[0].row[0] = [card(0, 8)];
    s.players[0].quick = [card(0, 5), card(1, 5), card(1, 9)];
  }, 4);
  // same color -> no
  let r = apply(g, { type: 'playToRow', player: 0, source: { kind: 'quick' }, slot: 0 });
  assert.equal(!r.ok && r.reason, 'wrongColor');
  g.players[0].quick.shift();
  // smaller + different color -> ok
  r = apply(g, { type: 'playToRow', player: 0, source: { kind: 'quick' }, slot: 0 });
  assert.ok(r.ok); g = r.ok ? r.state : g;
  assert.deepEqual(g.players[0].row[0], [card(1, 5), card(0, 8)]);
  // larger AND same color -> no (color reported first)
  r = apply(g, { type: 'playToRow', player: 0, source: { kind: 'quick' }, slot: 0 });
  assert.equal(!r.ok && r.reason, 'wrongColor');
  // base game: action locked
  const gBase = fresh(4);
  r = apply(gBase, { type: 'playToRow', player: 0, source: { kind: 'quick' }, slot: 0 });
  assert.equal(!r.ok && r.reason, 'notProVariant');
});

test('G2 call mode: empty quick pile does not end round, callStop does', () => {
  let g = rig(s => {
    s.config.roundEndMode = 'call'; s.config.targetRounds = 3;
    s.config.quickToCenter = true;
    s.players[0].quick = [card(0, 1)];
  });
  let r = apply(g, { type: 'playToCenter', player: 0, source: { kind: 'quick' }, pile: 'new' });
  assert.ok(r.ok); g = r.ok ? r.state : g;
  assert.equal(g.phase, 'playing');
  assert.ok(r.ok && r.events.some(e => e.type === 'quickEmptied'));
  // another player with a full pile must not call
  r = apply(g, { type: 'callStop', player: 1 });
  assert.equal(!r.ok && r.reason, 'quickNotEmpty');
  r = apply(g, { type: 'callStop', player: 0 });
  assert.ok(r.ok); g = r.ok ? r.state : g;
  assert.equal(g.phase, 'roundEnded');
  assert.equal(g.roundEndedBy, 0);
});

test('G1 manual refill: explicit action required, rejected in auto mode', () => {
  let g = rig(s => {
    s.config.autoRefillRow = false; s.config.targetRounds = 3;
    s.players[0].row = [[card(0, 1)], [card(1, 7)], [card(2, 7)]];
    s.players[0].quick = [card(3, 9), card(3, 8)];
  });
  let r = apply(g, { type: 'playToCenter', player: 0, source: { kind: 'row', slot: 0 }, pile: 'new' });
  assert.ok(r.ok); g = r.ok ? r.state : g;
  assert.equal(g.players[0].row[0].length, 0);          // gap remains
  r = apply(g, { type: 'refillRow', player: 0, slot: 1 });
  assert.equal(!r.ok && r.reason, 'slotNotEmpty');
  r = apply(g, { type: 'refillRow', player: 0, slot: 0 });
  assert.ok(r.ok); g = r.ok ? r.state : g;
  assert.deepEqual(g.players[0].row[0], [card(3, 9)]);
  const gAuto = fresh(4);
  r = apply(gAuto, { type: 'refillRow', player: 0, slot: 0 });
  assert.equal(!r.ok && r.reason, 'autoRefillActive');
});

test('G3 proDescendingStep=one: only exactly -1', () => {
  let g = rig(s => {
    s.config.proVariant = true; s.config.proDescendingStep = 'one'; s.config.targetRounds = 3;
    s.players[0].row[0] = [card(0, 8)];
    s.players[0].quick = [card(1, 5), card(1, 7)];
  });
  let r = apply(g, { type: 'playToRow', player: 0, source: { kind: 'quick' }, slot: 0 });
  assert.equal(!r.ok && r.reason, 'wrongValue');        // 5 onto 8: gap
  g.players[0].quick.shift();
  r = apply(g, { type: 'playToRow', player: 0, source: { kind: 'quick' }, slot: 0 });
  assert.ok(r.ok);                                       // 7 onto 8
});

test('G9 quick pile to center: locked by default, switch enables it', () => {
  const mut = (s: GameState) => {
    s.config.targetRounds = 3;
    s.players[0].quick = [card(0, 1), card(0, 2)];
    s.center = [];
  };
  // default: the quick pile only drains through the row
  let r = apply(rig(mut), { type: 'playToCenter', player: 0, source: { kind: 'quick' }, pile: 'new' });
  assert.equal(!r.ok && r.reason, 'quickLocked');
  // rulebook mode: allowed
  r = apply(rig(mut, 4, { quickToCenter: true }),
    { type: 'playToCenter', player: 0, source: { kind: 'quick' }, pile: 'new' });
  assert.ok(r.ok);
});

test('G9 stalemate: a locked quick card that would fit does not block diagnosis', () => {
  const g = rig(s => {
    s.config.targetRounds = 3;
    s.center = [{ color: 0, height: 1, owners: [0] }];
    for (const p of s.players) {
      p.row = p.row.map(() => [card(1, 9, 0)]);
      p.quick = [card(2, 9, 0)];
      p.hand = [card(3, 9, 0)];
      p.waste = [];
    }
    s.players[0].quick = [card(0, 2, 0)];   // fits pile 0, but quick is locked
  });
  assert.equal(isHardStalemate(g), true);   // no legal move exists
  const gOpen = structuredClone(g);
  gOpen.config.quickToCenter = true;
  assert.equal(isHardStalemate(gOpen), false);
});

test('G4 proAllowEmptySlot enables empty-slot placement', () => {
  const base = (allow: boolean) => rig(s => {
    s.config.proVariant = true; s.config.proAllowEmptySlot = allow;
    s.config.autoRefillRow = false; s.config.targetRounds = 3;
    s.players[0].row[0] = [];
    s.players[0].quick = [card(1, 5)];
  });
  let r = apply(base(false), { type: 'playToRow', player: 0, source: { kind: 'quick' }, slot: 0 });
  assert.equal(!r.ok && r.reason, 'emptySlotForbidden');
  r = apply(base(true), { type: 'playToRow', player: 0, source: { kind: 'quick' }, slot: 0 });
  assert.ok(r.ok);
});

test('G5 shuffleOnRecycle=false: waste is only flipped over', () => {
  let g = rig(s => {
    s.config.shuffleOnRecycle = false; s.config.targetRounds = 3;
    s.players[0].hand = [];
    s.players[0].waste = [card(0, 3), card(1, 4), card(2, 5), card(3, 6)];
  });
  const r = apply(g, { type: 'flipHand', player: 0 });
  assert.ok(r.ok); g = r.ok ? r.state : g;
  // flipped: hand was [6,5,4,3]; packet of 3 flipped -> waste top = former hand[2]
  assert.deepEqual(g.players[0].waste.map(c => c.value), [4, 5, 6]);
  assert.deepEqual(g.players[0].hand.map(c => c.value), [3]);
});

test('G6 pro: slot stacks, only top playable, card below becomes free', () => {
  let g = rig(s => {
    s.config.proVariant = true; s.config.targetRounds = 3;
    s.players[0].row[0] = [card(1, 2), card(0, 8)];     // 2 lies on 8
    s.center = [{ color: 1, height: 1, owners: [1] }];
    s.players[0].quick = [card(3, 9), card(3, 8)];
  });
  const r = apply(g, { type: 'playToCenter', player: 0, source: { kind: 'row', slot: 0 }, pile: 0 });
  assert.ok(r.ok); g = r.ok ? r.state : g;
  assert.deepEqual(g.players[0].row[0], [card(0, 8)]);  // 8 free again, NO refill (slot not empty)
  assert.equal(g.players[0].quick.length, 2);
});

test('G7 pro stalemate: possible row move prevents stalemate diagnosis', () => {
  const g = rig(s => {
    s.config.proVariant = true; s.config.targetRounds = 3;
    s.center = [{ color: 0, height: 10, owners: new Array(10).fill(0) }];
    for (const p of s.players) {
      p.row = p.row.map(() => [card(1, 9, 0)]);
      p.quick = [card(2, 9, 0)]; p.hand = [card(3, 9, 0)]; p.waste = [];
    }
    s.players[0].quick = [card(2, 4, 0)];                // 4 fits onto row 9
  });
  assert.equal(isHardStalemate(g), false);
  g.players[0].quick = [card(1, 4, 0)];                  // same color as row -> no move
  assert.equal(isHardStalemate(g), true);
});

test('stalemate: detection + host ends round with scoring', () => {
  let g = rig(s => {
    s.config.targetRounds = 3;
    s.center = [{ color: 0, height: 10, owners: new Array(10).fill(0) }];
    for (const p of s.players) {
      p.row = p.row.map(() => [card(1, 9, 0)]);
      p.quick = [card(2, 9, 0)];
      p.hand = [card(3, 9, 0)];
      p.waste = [];
    }
  });
  assert.equal(anyVisibleCenterPlay(g), false);
  assert.equal(isHardStalemate(g), true);
  const r = apply(g, { type: 'endRoundStalemate' });
  assert.ok(r.ok); g = r.ok ? r.state : g;
  assert.equal(g.phase, 'roundEnded');
  assert.equal(g.roundEndedBy, -1);
});

test('fuzz: 2000 random legal/illegal actions never crash, cards conserved', () => {
  let g = fresh(4, 99, { targetRounds: 99 });
  let rand = 12345;
  const next = () => (rand = (rand * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < 2000 && g.phase === 'playing'; i++) {
    const player = Math.floor(next() * 4);
    const dice = next();
    const action =
      dice < 0.5
        ? { type: 'playToCenter' as const, player,
            source: ([{ kind: 'row' as const, slot: Math.floor(next() * 3) },
                      { kind: 'quick' as const }, { kind: 'waste' as const }] as const)[Math.floor(next() * 3)],
            pile: next() < 0.3 ? ('new' as const) : Math.floor(next() * Math.max(1, g.center.length)) }
        : { type: 'flipHand' as const, player };
    const r = apply(g, action);
    if (r.ok) g = r.state;
    // invariant: 160 cards total
    const count = g.players.reduce((n, p) =>
      n + p.row.flat().length + p.quick.length + p.hand.length + p.waste.length, 0)
      + g.center.reduce((n, pl) => n + pl.owners.length, 0);
    assert.equal(count, 160);
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOT_LEVELS, BOT_PROFILES, BotLevel, apply, botReactionMs, chooseBotAction,
  makeConfig, newGame,
} from '../src/index.js';
import { Card, GameState } from '../src/types.js';

const card = (color: number, value: number, owner = 0): Card =>
  ({ color: color as Card['color'], value, owner });

function rig(mut: (g: GameState) => void, extra = {}): GameState {
  const g = newGame(makeConfig({ players: 4, targetRounds: 3, ...extra }), 1);
  mut(g);
  return g;
}

/** seeded rng so policy choices are deterministic in tests */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('reaction time: higher level is faster, always within its band', () => {
  for (const lvl of BOT_LEVELS) {
    const [lo, hi] = BOT_PROFILES[lvl].reactionMs;
    for (let i = 0; i < 50; i++) {
      const ms = botReactionMs(lvl, rng(i + lvl * 100));
      assert.ok(ms >= lo && ms <= hi, `L${lvl} ${ms} out of [${lo},${hi}]`);
    }
  }
  // monotonic: each level's band is faster than the one below
  for (let i = 1; i < BOT_LEVELS.length; i++) {
    const lower = BOT_PROFILES[(i) as BotLevel].reactionMs;
    const higher = BOT_PROFILES[(i + 1) as BotLevel].reactionMs;
    assert.ok(higher[0] < lower[0] && higher[1] < lower[1]);
  }
});

test('every chosen action is legal against the engine (fuzz over levels)', () => {
  for (const lvl of BOT_LEVELS) {
    let g = newGame(makeConfig({ players: 3, targetRounds: 3, proVariant: lvl >= 4 }), lvl * 7);
    const r = rng(lvl * 999);
    for (let step = 0; step < 400 && g.phase === 'playing'; step++) {
      const player = step % g.config.players;
      const action = chooseBotAction(g, player, lvl, r);
      if (!action) continue;
      const res = apply(g, action);
      assert.ok(res.ok, `L${lvl} illegal action: ${JSON.stringify(action)}`);
      g = res.state;
    }
  }
});

test('level 5 takes an available center play (win-condition first)', () => {
  const g = rig(s => {
    s.players[0].row = [[card(0, 1)], [card(1, 7)], [card(2, 7)]];
    s.center = [];
  });
  // deterministic: skill 1.0 -> always the top-ranked move; opening with the 1
  const action = chooseBotAction(g, 0, 5, rng(3));
  assert.ok(action && action.type === 'playToCenter');
  assert.ok(apply(g, action).ok);
});

test('no placement available -> flips the hand to cycle cards', () => {
  const g = rig(s => {
    s.center = [];                          // no piles, no 1s visible
    s.players[0].row = [[card(0, 7)], [card(1, 8)], [card(2, 9)]];
    s.players[0].quick = [card(3, 7)];
    s.players[0].waste = [card(0, 8)];
    s.players[0].hand = [card(1, 2), card(2, 3), card(3, 4)];
  });
  // high diligence level always flips when nothing is placeable
  let flips = 0;
  for (let i = 0; i < 20; i++) {
    const a = chooseBotAction(g, 0, 5, rng(i + 1));
    if (a?.type === 'flipHand') flips++;
  }
  assert.equal(flips, 20);
});

test('call mode: empties quick pile then calls Stop', () => {
  const g = rig(s => {
    s.config.roundEndMode = 'call';
    s.center = [{ color: 0, height: 5, owners: [0, 0, 0, 0, 0] }];
    s.players[0].quick = [];               // pile already empty
    s.players[0].row = [[card(1, 9)], [card(1, 8)], [card(2, 8)]]; // nothing fits pile 0
    s.players[0].waste = [];
    s.players[0].hand = [];
  });
  const a = chooseBotAction(g, 0, 4, rng(5));
  assert.deepEqual(a, { type: 'callStop', player: 0 });
});

test('deterministic under a fixed seed', () => {
  const g = newGame(makeConfig({ players: 2 }), 123);
  const a1 = chooseBotAction(g, 0, 3, rng(42));
  const a2 = chooseBotAction(g, 0, 3, rng(42));
  assert.deepEqual(a1, a2);
});

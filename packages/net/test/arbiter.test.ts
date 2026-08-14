import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Arbiter, Intent } from '../src/arbiter.js';

const play = (sender: string, reactionMs: number, pile: number | 'new' = 0, v = 7): Intent => ({
  sender, reactionMs, stateVersion: v,
  action: { type: 'playToCenter', player: 0, source: { kind: 'quick' }, pile },
});

test('same pile: faster reaction wins even if it arrives later', () => {
  const a = new Arbiter({ minWindowMs: 100 });
  a.submit(play('host', 320), 0);      // host, zero network delay
  a.submit(play('remote', 280), 60);   // remote, arrives 60ms later but reacted faster
  assert.equal(a.due(50).length, 0);   // window still open
  const out = a.due(100);
  assert.deepEqual(out.map(i => i.sender), ['remote', 'host']);
});

test('different piles resolve independently', () => {
  const a = new Arbiter({ minWindowMs: 100 });
  a.submit(play('p1', 300, 0), 0);
  a.submit(play('p2', 200, 1), 0);
  const out = a.due(100);
  assert.equal(out.length, 2);
});

test('late intent (after window) forms a new group, not retro-won', () => {
  const a = new Arbiter({ minWindowMs: 100 });
  a.submit(play('p1', 400), 0);
  assert.equal(a.due(100).length, 1);
  a.submit(play('p2', 100), 150);      // faster reaction, but too late — own group
  assert.equal(a.due(150).length, 0);
  assert.deepEqual(a.due(250).map(i => i.sender), ['p2']);
});

test('adaptive window: p95 one-way + margin, clamped', () => {
  const a = new Arbiter({ marginMs: 30, minWindowMs: 40, maxWindowMs: 400 });
  assert.equal(a.windowMs(), 40);                 // no data -> min
  for (let i = 0; i < 20; i++) a.updateRtt('r', 60);   // one-way 30
  assert.equal(a.windowMs(), 60);                 // 30 + 30
  for (let i = 0; i < 20; i++) a.updateRtt('slow', 2000);
  assert.equal(a.windowMs(), 400);                // clamped
});

test('nextDue exposes earliest deadline for host scheduling', () => {
  const a = new Arbiter({ minWindowMs: 100 });
  assert.equal(a.nextDue(), null);
  a.submit(play('p1', 300, 0), 10);
  a.submit(play('p2', 300, 1), 50);
  assert.equal(a.nextDue(), 110);
});

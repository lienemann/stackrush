import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Action, Card, apply, makeConfig, newGame } from '@stackrush/core';
import { LoopbackHub } from '@stackrush/net';
import { HostSession } from '../src/game/host.js';
import { ClientSession } from '../src/game/client.js';

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

async function until(cond: () => boolean, ms = 1500): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('timeout waiting for condition');
    await wait(10);
  }
}

function setup() {
  const hub = new LoopbackHub();
  const host = new HostSession({}, 'TEST1', [hub.endpoint('host-net')]);
  const alice = new ClientSession(hub.endpoint('devA'), 'devA');
  const bob = new ClientSession(hub.endpoint('devB'), 'devB');
  return { host, alice, bob };
}

test('lobby: seats from two devices, start deals to both players', async () => {
  const { host, alice, bob } = setup();
  alice.hello(['Alice']);
  bob.hello(['Bob']);
  await until(() => (alice.lobby?.players.length ?? 0) === 2 && (bob.lobby?.players.length ?? 0) === 2);
  assert.deepEqual(alice.lobby!.players.map(p => p.name), ['Alice', 'Bob']);
  host.start();
  await until(() => alice.displayState() !== null && bob.displayState() !== null);
  const s = alice.displayState()!;
  assert.equal(s.config.players, 2);
  assert.equal(s.players[0].quick.length, 10);
  assert.equal(alice.version, 1);
  host.close();
});

test('flipHand goes through the arbiter window and broadcasts a new version', async () => {
  const { host, alice, bob } = setup();
  alice.hello(['Alice']);
  bob.hello(['Bob']);
  await until(() => (bob.lobby?.players.length ?? 0) === 2);
  host.start();
  await until(() => alice.displayState() !== null);

  const rej = alice.submit({ type: 'flipHand', player: 0 });
  assert.equal(rej, null);
  // optimistic: waste shows immediately, before the host confirms
  assert.equal(alice.displayState()!.players[0].waste.length, 3);
  assert.equal(alice.version, 1);
  await until(() => alice.version >= 2 && bob.version >= 2);
  assert.equal(bob.displayState()!.players[0].waste.length, 3);
  host.close();
});

test('watchdog: slow deliberation does NOT end the round (no false stalemate)', async () => {
  const hub = new LoopbackHub();
  const host = new HostSession({}, 'SLOW1', [hub.endpoint('host-net')]);
  const a = new ClientSession(hub.endpoint('devA'), 'devA');
  const b = new ClientSession(hub.endpoint('devB'), 'devB');
  a.hello(['A']); b.hello(['B']);
  await until(() => (a.lobby?.players.length ?? 0) === 2);
  host.start();
  await until(() => a.displayState() !== null);
  assert.equal(a.displayState()!.phase, 'playing');
  // sit idle well past the old 10s-style inactivity window (scaled down: the
  // watchdog no longer ends on inactivity at all, only on a real stuck position)
  await wait(1500);
  // a fresh deal is never a stalemate, so the round must still be running
  assert.equal(a.displayState()!.phase, 'playing', 'round ended despite legal moves remaining');
  host.close();
});

test('debug log: records start and accepted actions as JSONL', async () => {
  const hub = new LoopbackHub();
  const host = new HostSession({ quickToCenter: true }, 'LOG01', [hub.endpoint('host-net')]);
  const a = new ClientSession(hub.endpoint('devA'), 'devA');
  a.hello(['A']);
  const b = new ClientSession(hub.endpoint('devB'), 'devB');
  b.hello(['B']);
  await until(() => (a.lobby?.players.length ?? 0) === 2);
  host.start();
  await until(() => a.displayState() !== null);
  a.submit({ type: 'flipHand', player: 0 });
  await until(() => a.version >= 2);
  const lines = host.debugLogJSONL().trim().split('\n').map(l => JSON.parse(l));
  assert.ok(lines.some(l => l.kind === 'start'), 'has a start line');
  assert.ok(lines.some(l => l.kind === 'accept' && l.action?.type === 'flipHand'), 'logged the flip');
  host.close();
});

test('computer player: host drives a bot seat with no human input', async () => {
  const hub = new LoopbackHub();
  const host = new HostSession({ quickToCenter: true }, 'BOT01', [hub.endpoint('host-net')]);
  const human = new ClientSession(hub.endpoint('devA'), 'devA');
  human.hello(['Human']);
  await until(() => (human.lobby?.players.length ?? 0) === 1);
  host.addBot(5); // fast, skilled -> acts quickly
  await until(() => (human.lobby?.players.length ?? 0) === 2);
  assert.equal(human.lobby!.players[1].bot, 5);
  host.start();
  await until(() => human.displayState() !== null);
  const startVersion = human.version;
  const botQuick0 = human.displayState()!.players[1].quick.length;
  // the bot should tap on its own within a couple of reaction cycles
  await until(() => human.version > startVersion + 2, 4000);
  const s = human.displayState()!;
  const botProgressed = s.players[1].quick.length < botQuick0 ||
    s.center.some(pile => pile.owners.includes(1)) ||
    s.players[1].waste.length > 0; // at least flipped its hand
  assert.ok(botProgressed, 'bot took actions that changed its own area');
  host.close();
});

test('race on the same pile: faster reactionMs wins, loser rolls back', async () => {
  // find a deal where p0 can open a pile with a 1 and BOTH players then hold
  // a visible 2 of that color (deterministic search over seeds)
  const cfg = makeConfig({ players: 2, quickToCenter: true });
  type Src = { kind: 'row'; slot: number } | { kind: 'quick' };
  const visible = (p: { row: Card[][]; quick: Card[] }, skipQuickTop: boolean): Array<{ card: Card; src: Src }> => {
    const out: Array<{ card: Card; src: Src }> = [];
    p.row.forEach((st, slot) => { if (st[0]) out.push({ card: st[0], src: { kind: 'row', slot } }); });
    const q = skipQuickTop ? p.quick[1] : p.quick[0];
    if (q) out.push({ card: q, src: { kind: 'quick' } });
    return out;
  };
  let seed = -1;
  let src0: Src | null = null;
  let src1: Src | null = null;
  for (let s = 1; s < 200000 && seed < 0; s++) {
    const g = newGame(cfg, s);
    const opener = g.players[0].quick[0];
    if (!opener || opener.value !== 1) continue;
    const two0 = visible(g.players[0], true).find(v => v.card.color === opener.color && v.card.value === 2);
    const two1 = visible(g.players[1], false).find(v => v.card.color === opener.color && v.card.value === 2);
    if (two0 && two1) { seed = s; src0 = two0.src; src1 = two1.src; }
  }
  assert.ok(seed > 0, 'found a seed with a stageable race');

  const hub = new LoopbackHub();
  const hostNet = hub.endpoint('host-net');
  // the staged race plays quick cards straight to the center -> G9 on
  const host = new HostSession({ quickToCenter: true }, 'RACE1', [hostNet]);
  const alice = new ClientSession(hub.endpoint('devA'), 'devA');
  const bob = new ClientSession(hub.endpoint('devB'), 'devB');
  alice.hello(['Alice']);
  bob.hello(['Bob']);
  await until(() => (bob.lobby?.players.length ?? 0) === 2);
  // start with the searched seed
  const h = host as unknown as { seed: () => number };
  h.seed = () => seed;
  host.start();
  await until(() => alice.displayState() !== null && bob.displayState() !== null);

  const rollbacks: Action[] = [];
  alice.on('rollback', a => rollbacks.push(a));

  // p0 opens the pile with the 1
  assert.equal(alice.submit({ type: 'playToCenter', player: 0, source: { kind: 'quick' }, pile: 'new' }), null);
  await until(() => alice.version >= 2 && bob.version >= 2);
  assert.equal(alice.displayState()!.center.length, 1);

  // both race for pile 0 with their 2; Alice taps FIRST but reacted slower
  const now = performance.now();
  alice.markRendered(alice.version, now - 320); // reactionMs ≈ 320
  bob.markRendered(bob.version, now - 90);      // reactionMs ≈ 90 -> wins
  assert.equal(alice.submit({ type: 'playToCenter', player: 0, source: src0!, pile: 0 }, now), null);
  assert.equal(bob.submit({ type: 'playToCenter', player: 1, source: src1!, pile: 0 }, now), null);

  await until(() => alice.version >= 3 && bob.version >= 3);
  await wait(60); // let the reject arrive
  const s = alice.displayState()!;
  assert.equal(s.center[0].height, 2);
  assert.equal(s.center[0].owners[1], 1, 'the 2 on the pile belongs to Bob (player 1)');
  assert.equal(rollbacks.length, 1, 'Alice rolled back her optimistic play');
  // engine sanity: applying Alice's action to the authoritative state rejects
  const res = apply(s, { type: 'playToCenter', player: 0, source: src0!, pile: 0 });
  assert.equal(res.ok, false);
  host.close();
});

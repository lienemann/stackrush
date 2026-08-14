import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LoopbackHub } from '../src/loopback.js';
import { decodeMsg, encodeMsg } from '../src/transport.js';

const tick = () => new Promise(r => setTimeout(r, 5));

test('loopback: broadcast reaches all peers except the sender', async () => {
  const hub = new LoopbackHub();
  const a = hub.endpoint('a'), b = hub.endpoint('b'), c = hub.endpoint('c');
  const got: string[] = [];
  b.onMessage((from, data) => got.push(`b<-${from}:${decodeMsg(data)}`));
  c.onMessage((from, data) => got.push(`c<-${from}:${decodeMsg(data)}`));
  a.onMessage(() => got.push('a should not hear itself'));
  a.send('all', encodeMsg('hi'));
  await tick();
  assert.deepEqual(got.sort(), ['b<-a:hi', 'c<-a:hi']);
});

test('loopback: targeted send reaches only the target', async () => {
  const hub = new LoopbackHub();
  const a = hub.endpoint('a'), b = hub.endpoint('b'), c = hub.endpoint('c');
  const got: string[] = [];
  b.onMessage((from, data) => got.push(`b<-${from}:${decodeMsg(data)}`));
  c.onMessage(() => got.push('c should not receive'));
  a.send('b', encodeMsg('psst'));
  await tick();
  assert.deepEqual(got, ['b<-a:psst']);
});

test('loopback: join/leave lifecycle events fire', async () => {
  const hub = new LoopbackHub();
  const a = hub.endpoint('a');
  const events: string[] = [];
  a.onPeerJoin(p => events.push(`join:${p}`));
  a.onPeerLeave(p => events.push(`leave:${p}`));
  const b = hub.endpoint('b');
  b.close();
  await tick();
  assert.deepEqual(events, ['join:b', 'leave:b']);
});

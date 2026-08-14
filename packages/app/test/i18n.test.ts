import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickLocale, t, de, en, locales } from '../src/i18n/index.js';

test('autodetect: first supported base language wins', () => {
  assert.equal(pickLocale('auto', ['de-DE', 'en-US']), 'de');
  assert.equal(pickLocale('auto', ['fr-FR', 'de-CH']), 'de');
  assert.equal(pickLocale('auto', ['fr-FR', 'ja']), 'en');   // fallback
  assert.equal(pickLocale('auto', []), 'en');
});

test('manual override beats detection', () => {
  assert.equal(pickLocale('en', ['de-DE']), 'en');
});

test('interpolation', () => {
  assert.equal(t(de, 'round', { n: 2 }), 'Runde 2');
  assert.equal(t(en, 'youScored', { points: -4 }), '-4 points');
});

test('every locale covers every key (typed, but verify at runtime too)', () => {
  const keys = Object.keys(en);
  for (const loc of Object.values(locales))
    assert.deepEqual(Object.keys(loc).sort(), keys.slice().sort());
});

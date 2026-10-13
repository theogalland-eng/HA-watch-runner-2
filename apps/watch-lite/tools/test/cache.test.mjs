import { test } from 'node:test';
import assert from 'node:assert/strict';
import { logic } from './paths.mjs';

const S = await logic('store.js');
const C = await logic('cache.js');

test('cache round-trips fr, timestamp and cards in order', () => {
  const st = S.createState();
  S.applySync(st, 42, [
    { k: 3, d: 'lock', n: 'Porte d’entrée', s: 'locked' },
    { k: 0, d: 'light', n: 'Salon', s: 'on' },
  ], 1_700_000_000_000);
  const text = C.serializeCache(st);
  assert.deepEqual(C.parseCache(text), { fr: 42, at: 1_700_000_000_000, cards: st.cards });
});

test('corrupt, empty or foreign cache texts mean "no cache"', () => {
  for (const bad of [undefined, '', '{', 'null', '[]', '{"f":1,"at":1,"c":[]}', '{"f":2,"c":[]}', '{"f":2,"at":"x","c":[]}']) {
    assert.equal(C.parseCache(bad), null, String(bad));
  }
  const parsed = C.parseCache('{"f":2,"fr":1,"at":5,"c":[[0,"light","Salon","on"],[1,"light"],"x",[99,"light","Out","on"]]}');
  assert.deepEqual(parsed.cards, [{ k: 0, d: 'light', n: 'Salon', s: 'on' }]);
});

test('worst case (10 favorites, 20-char accented names, long states) fits in the 4 KB read', () => {
  const st = S.createState();
  const cards = Array.from({ length: 10 }, (_, k) => ({ k, d: 'sensor', n: 'Éclairage été àéèùçœ'.slice(0, 20), s: 'Température élevée 21,5 °C' }));
  S.applySync(st, 'rev-0123456789', cards, Date.now());
  const text = C.serializeCache(st);
  assert.ok(text, 'serialised');
  assert.ok(Buffer.byteLength(text) <= C.MAX_CACHE_BYTES, `${Buffer.byteLength(text)} bytes`);
});

test('never truncates silently: an oversized cache is refused', () => {
  const st = S.createState();
  st.fr = 1;
  st.cards = [{ k: 0, d: 'sensor', n: 'X', s: 'x'.repeat(5000) }];
  assert.equal(C.serializeCache(st), null);
});

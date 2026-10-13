import { test } from 'node:test';
import assert from 'node:assert/strict';
import { logic } from './paths.mjs';

const { agoParts, fill, ellipsize, utf8Bytes, MINUTE_MS } = await logic('format.js');

test('relative age follows the design: à l’instant / il y a N min / il y a N h', () => {
  const now = 10_000_000_000;
  assert.equal(agoParts(now, 0), null);
  assert.deepEqual(agoParts(now, now - 20_000), { key: 'ago_now', n: 0 });
  assert.deepEqual(agoParts(now, now + 5_000), { key: 'ago_now', n: 0 }, 'clock skew counts as now');
  assert.deepEqual(agoParts(now, now - 3 * MINUTE_MS), { key: 'ago_min', n: 3 });
  assert.deepEqual(agoParts(now, now - 59 * MINUTE_MS), { key: 'ago_min', n: 59 });
  assert.deepEqual(agoParts(now, now - 60 * MINUTE_MS), { key: 'ago_hour', n: 1 });
  assert.deepEqual(agoParts(now, now - 150 * MINUTE_MS), { key: 'ago_hour', n: 3 });
});

test('fill replaces named placeholders and keeps unknown ones', () => {
  assert.equal(fill('il y a {n} min', { n: 3 }), 'il y a 3 min');
  assert.equal(fill('Favoris : {n} sur {max}', { n: 5, max: 10 }), 'Favoris : 5 sur 10');
  assert.equal(fill('{x} reste', {}), '{x} reste');
});

test('ellipsize keeps short names and cuts long ones with a single "…"', () => {
  assert.equal(ellipsize('Salon', 17), 'Salon');
  assert.equal(ellipsize('Lampe de chevet parents', 17), 'Lampe de chevet …');
  assert.equal(ellipsize('Lampe de chevet parents', 17).length, 17);
});

test('utf8Bytes matches Buffer.byteLength, accents and astral characters included', () => {
  for (const s of ['abc', 'Porte d’entrée', 'Température salon', '21,5 °C', 'Выключить', 'ok 🏠']) {
    assert.equal(utf8Bytes(s), Buffer.byteLength(s, 'utf8'), s);
  }
});

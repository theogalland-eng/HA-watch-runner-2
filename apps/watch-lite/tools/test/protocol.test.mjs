// Protocol v2 on the watch (common/logic/protocol.js): the code tables must be the ones of
// docs/p2p-protocol.md and of the companion's CardCodes.kt, so the two sides stay identical.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { APP, logic } from './paths.mjs';

const P = await logic('protocol.js');
const ROOT = resolve(APP, '../..');
const DOC = readFileSync(resolve(ROOT, 'docs/p2p-protocol.md'), 'utf8');
const KT = readFileSync(resolve(ROOT, 'apps/phone-android/core/src/main/kotlin/io/github/theogallandeng/hawatch/companion/core/protocol/CardCodes.kt'), 'utf8');

/** Rows `| \`code\` | \`value\` | …` of the table under `heading`, as { code: value }. */
function docTable(heading) {
  const start = DOC.indexOf(heading);
  assert.ok(start >= 0, `docs/p2p-protocol.md has no "${heading}"`);
  const out = {};
  for (const line of DOC.slice(start).split('\n').slice(1)) {
    if (line.startsWith('#')) break;
    const m = line.match(/^\| `([^`]+)` \| `([^`]+)` \|/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

/** `"value" to "code"` pairs of a Kotlin map, between two markers, as { code: value }. */
function ktTable(from, to) {
  const body = KT.slice(KT.indexOf(from), KT.indexOf(to));
  assert.ok(body.length > 0, `CardCodes.kt: no ${from} … ${to}`);
  const out = {};
  for (const m of body.matchAll(/"([^"]+)" to "([^"]+)"/g)) out[m[2]] = m[1];
  return out;
}

test('code tables: protocol.js = docs/p2p-protocol.md = CardCodes.kt (companion)', () => {
  const doc = { d: docTable('### Domain codes (`d`)'), s: docTable('### State codes (`s`)') };
  const kt = { d: ktTable('val DOMAINS', 'val STATES'), s: ktTable('val STATES', 'const val UNKNOWN_STATE') };
  assert.equal(Object.keys(doc.d).length, 6);
  assert.equal(Object.keys(doc.s).length, 11);
  assert.deepEqual({ ...P.DOMAINS }, doc.d, 'domain codes: protocol.js vs the doc');
  assert.deepEqual({ ...P.STATES }, doc.s, 'state codes: protocol.js vs the doc');
  assert.deepEqual(kt.d, doc.d, 'domain codes: CardCodes.kt vs the doc');
  assert.deepEqual(kt.s, doc.s, 'state codes: CardCodes.kt vs the doc');
});

test('cards decode to the watch shape; sensors keep their value', () => {
  assert.deepEqual(P.decodeCard({ k: 0, d: 'l', n: 'Salon', s: '1' }), { k: 0, d: 'light', n: 'Salon', s: 'on' });
  assert.deepEqual(P.decodeCard({ k: 3, d: 'k', n: 'Porte', s: 'h' }), { k: 3, d: 'lock', n: 'Porte', s: 'unlocking' });
  assert.deepEqual(P.decodeCard({ k: 7, d: 'n', n: 'Température', s: '21,5 °C' }), { k: 7, d: 'sensor', n: 'Température', s: '21,5 °C' });
  assert.deepEqual(P.decodeCard({ k: 7, d: 'n', n: 'Humidité', s: '1' }).s, '1', 'a sensor value is never read as a code');
});

test('unknown codes never crash: unknown state → "unknown", unknown domain → read-only row', () => {
  assert.deepEqual(P.decodeCard({ k: 1, d: 's', n: 'Prise', s: 'Z' }), { k: 1, d: 'switch', n: 'Prise', s: 'unknown' });
  assert.deepEqual(P.decodeCard({ k: 2, d: 'w', n: 'Futur', s: '1' }), { k: 2, d: 'sensor', n: 'Futur', s: 'unknown' });
  for (const bad of [null, 'x', 3, {}, { k: 0, d: 'l', n: 'a' }, { k: 0, d: 1, n: 'a', s: '1' }]) {
    assert.equal(P.decodeCard(bad), null, JSON.stringify(bad));
  }
  assert.deepEqual(P.decodeCards([{ k: 0, d: 'l', n: 'a', s: '0' }, 'junk', null]), [{ k: 0, d: 'light', n: 'a', s: 'off' }]);
  assert.deepEqual(P.decodeCards(undefined), []);
});

test('requests: v2, valid ids (ASCII, ≤ 16 chars), far below 900 bytes', () => {
  const ids = new Set();
  for (const now of [0, 1, 1_700_000_000_000, 2_176_782_335, 9_999_999_999_999]) {
    for (let i = 0; i < 3; i++) {
      const id = P.newId('a', now);
      assert.match(id, /^[A-Za-z0-9_-]{1,16}$/, id);
      ids.add(id);
    }
  }
  assert.equal(ids.size, 15, 'ids made in the same millisecond differ');
  const id = 'a'.repeat(16);
  assert.deepEqual(JSON.parse(P.encodeSync(id)), { v: 2, id, type: 'SYNC_REQUEST' });
  assert.deepEqual(JSON.parse(P.encodeCall(id, 9, 2147483647, false)), { v: 2, id, type: 'CALL_SERVICE', k: 9, fr: 2147483647 });
  const worst = P.encodeCall(id, 9, 2147483647, true);
  assert.equal(JSON.parse(worst).act, 'confirm');
  console.log(`worst CALL_SERVICE from the watch: ${Buffer.byteLength(worst)} bytes`);
  assert.ok(Buffer.byteLength(worst) <= 900);
});

test('replies: garbage or a reply without id/type is null', () => {
  for (const text of ['', 'garbage', '[]', 'null', '{"id":"a1"}', '{"type":"ACK"}', '{"id":1,"type":"ACK"}']) {
    assert.equal(P.decodeReply(text), null, text);
  }
  assert.deepEqual(P.decodeReply('{"v":2,"id":"a1","type":"ACK","ok":true}'), { v: 2, id: 'a1', type: 'ACK', ok: true });
});

test('ACK codes: stale → resync, timeout → "délai dépassé", anything else → "HA injoignable"', () => {
  assert.equal(P.kindOf('stale'), 'stale');
  assert.equal(P.kindOf('timeout'), 'timeout');
  for (const code of ['confirm', 'denied', 'config', 'auth', 'ha', 'bad', 'version', 'internal', undefined, 'new']) {
    assert.equal(P.kindOf(code), 'ha', String(code));
  }
});

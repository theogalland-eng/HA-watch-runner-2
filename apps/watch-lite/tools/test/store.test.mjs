import { test } from 'node:test';
import assert from 'node:assert/strict';
import { logic } from './paths.mjs';

const S = await logic('store.js');

// The design's 5-favorite dashboard (v2 compact cards).
const FIVE = [
  { k: 0, d: 'light', n: 'Salon', s: 'on' },
  { k: 1, d: 'light', n: 'Cuisine', s: 'off' },
  { k: 2, d: 'switch', n: 'Prise bureau', s: 'on' },
  { k: 3, d: 'lock', n: 'Porte d’entrée', s: 'locked' },
  { k: 4, d: 'lock', n: 'Garage', s: 'unlocked' },
];

test('cards are validated: bad shapes, duplicate slots and extras are dropped; names capped', () => {
  const cards = S.normalizeCards([
    ...FIVE,
    { k: 2, d: 'light', n: 'dup', s: 'on' },
    { k: 11, d: 'light', n: 'out of range', s: 'on' },
    { k: 1.5, d: 'light', n: 'not an int', s: 'on' },
    { k: 5, d: 'light', n: 'Lampe de chevet des parents', s: 'off' },
    null,
    'nope',
  ]);
  assert.deepEqual(cards.map((c) => c.k), [0, 1, 2, 3, 4, 5]);
  assert.equal(cards[5].n.length, S.MAX_NAME);
  const many = Array.from({ length: 12 }, (_, k) => ({ k: k % 10, d: 'light', n: 'L' + k, s: 'on' }));
  assert.equal(S.normalizeCards(many).length, 10);
});

test('first launch without data: list (syncing), then error screens or the empty state', () => {
  const st = S.createState();
  assert.equal(S.screenOf(st), 'list');
  assert.equal(S.startSync(st), true);
  assert.equal(S.startSync(st), false, 'a tap during a sync is ignored');
  S.failSync(st, 'tel');
  assert.equal(S.screenOf(st), 'error_tel', 'no cache: full-screen error 5b');
  assert.equal(S.startSync(st), true);
  assert.equal(S.screenOf(st), 'error_tel', '"Réessayer" runs in place: the error screen stays');
  S.failSync(st, 'ha');
  assert.equal(S.screenOf(st), 'error_ha');
  S.applySync(st, 7, [], 1000);
  assert.equal(S.screenOf(st), 'empty', 'synced but no favorites: 5d');
  S.applySync(st, 8, FIVE, 2000);
  assert.equal(S.screenOf(st), 'list');
  assert.equal(st.fr, 8);
  assert.equal(st.lastSyncAt, 2000);
});

test('with data, a failed sync stays discreet: red indicator, list still shown', () => {
  const st = S.createState();
  S.applySync(st, 1, FIVE, 1000);
  S.startSync(st);
  S.failSync(st, 'ha');
  assert.equal(st.statusErr, 'ha');
  assert.equal(S.screenOf(st), 'list');
  S.startSync(st);
  S.applySync(st, 1, FIVE, 5000);
  assert.equal(st.statusErr, null, 'a good sync clears the indicator');
});

test('action feedback: pending → ok (new state) → cleared; second tap while pending ignored', () => {
  const st = S.createState();
  S.applySync(st, 1, FIVE, 0);
  const tok = S.startAction(st, 0, 'off');
  assert.ok(tok > 0);
  assert.equal(st.ents[0].phase, 'pending');
  assert.equal(S.startAction(st, 0, 'off'), 0, 'tap ignored on a pending row');
  assert.ok(S.startAction(st, 1, 'on') > 0, 'other rows stay usable');
  assert.equal(S.actionSucceeded(st, 0, tok, 'off'), true);
  assert.equal(st.ents[0].phase, 'ok');
  assert.equal(S.findCard(st, 0).s, 'off', 'state comes from HA confirmation, not optimism');
  assert.equal(S.clearPhase(st, 0, tok), true);
  assert.equal(st.ents[0], undefined);
});

test('failure turns the row red and the indicator red; the cached state is kept', () => {
  const st = S.createState();
  S.applySync(st, 1, FIVE, 0);
  const tok = S.startAction(st, 2, 'off');
  S.actionFailed(st, 2, tok, 'ha');
  assert.equal(st.ents[2].phase, 'fail');
  assert.equal(st.statusErr, 'ha');
  assert.equal(S.findCard(st, 2).s, 'on', 'cache state comes back after the 3 s');
  const tok2 = S.startAction(st, 1, 'on');
  S.actionFailed(st, 1, tok2, 'timeout');
  assert.equal(st.statusErr, 'ha', 'a timeout does not change the indicator');
});

test('late callbacks of an older action are ignored (token)', () => {
  const st = S.createState();
  S.applySync(st, 1, FIVE, 0);
  const t1 = S.startAction(st, 0, 'off');
  S.actionFailed(st, 0, t1, 'tel');
  S.clearPhase(st, 0, t1);
  const t2 = S.startAction(st, 0, 'off');
  assert.equal(S.actionSucceeded(st, 0, t1, 'off'), false);
  assert.equal(S.clearPhase(st, 0, t1), false);
  assert.equal(st.ents[0].phase, 'pending');
  assert.equal(st.ents[0].tok, t2);
});

test('sensors are read-only; unknown slots are ignored', () => {
  const st = S.createState();
  S.applySync(st, 1, [{ k: 0, d: 'sensor', n: 'Température salon', s: '21,5 °C' }], 0);
  assert.equal(S.startAction(st, 0, '21,5 °C'), 0);
  assert.equal(S.startAction(st, 9, 'on'), 0);
});

test('a resync with the same favorites revision keeps row feedback; a new revision drops it', () => {
  const st = S.createState();
  S.applySync(st, 1, FIVE, 0);
  S.startAction(st, 0, 'off');
  S.startAction(st, 4, 'locked');
  S.applySync(st, 1, FIVE.slice(0, 3), 10);
  assert.equal(st.ents[0].phase, 'pending', 'same fr: slot 0 is still the same light');
  assert.equal(st.ents[4], undefined, 'removed row');

  // New revision: slot 0 now holds a locked lock. The old "Extinction…" must not show on it,
  // and nothing may claim an unlock is in progress.
  const tok = st.ents[0].tok;
  S.applySync(st, 2, [{ k: 0, d: 'lock', n: 'Porte d’entrée', s: 'locked' }], 20);
  assert.deepEqual(st.ents, {});
  assert.equal(S.actionSucceeded(st, 0, tok, 'off'), false, 'late reply of the old action ignored');
  assert.equal(S.findCard(st, 0).s, 'locked');
});

test('single-entity refresh replaces the matching slot only', () => {
  const st = S.createState();
  S.applySync(st, 1, FIVE, 0);
  assert.equal(S.applyEntity(st, { k: 1, d: 'light', n: 'Cuisine', s: 'on' }), true);
  assert.equal(S.findCard(st, 1).s, 'on');
  assert.equal(S.applyEntity(st, { k: 8, d: 'light', n: 'X', s: 'on' }), false);
  assert.equal(S.applyEntity(st, { k: 1 }), false);
});

test('a reply after the action settled (8 s timeout) changes no feedback', () => {
  const st = S.createState();
  S.applySync(st, 1, FIVE, 1000);
  const tok = S.startAction(st, 0, 'off');
  assert.equal(S.actionFailed(st, 0, tok, 'timeout'), true);
  assert.equal(S.actionSucceeded(st, 0, tok, 'off'), false);
  assert.equal(S.actionFailed(st, 0, tok, 'ha'), false);
  assert.equal(st.ents[0].err, 'timeout');
  assert.equal(st.statusErr, null);
});

test('"Mis à jour": a refreshed card has its own time, else the last sync', () => {
  const st = S.createState();
  S.applySync(st, 1, FIVE, 1000);
  S.applyEntity(st, { k: 1, d: 'light', n: 'Cuisine', s: 'on' }, 5000);
  assert.equal(S.cardAt(st, 1), 5000);
  assert.equal(S.cardAt(st, 0), 1000);
  S.applySync(st, 1, FIVE, 9000);
  assert.equal(S.cardAt(st, 1), 9000, 'a full sync is newer');
});

// The app-level core (common/app/core.js, app.js bundle) and its link to the page (common/app/link.js):
// one session for the whole app, created before the page, drawn by the page through getCore().
import { test as nodeTest } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { main, MAIN, HAS_STUB, NO_STUB } from './paths.mjs';

const test = HAS_STUB ? nodeTest : (name, fn) => nodeTest(name, { skip: NO_STUB }, fn);
const { createCore } = await main('common/app/core.js');
const { publishCore, getCore, unpublishCore } = await main('common/app/link.js');
const { TAP_GUARD_MS } = await main('common/logic/session.js');
const W = HAS_STUB ? await main('common/services/wearengine.js') : null;
const { PEER } = await main('common/config/peer.js');

function clock() {
  let now = 1_700_000_000_000;
  let seq = 0;
  const queue = new Map();
  return {
    now: () => now,
    timers: { set(fn, ms) { queue.set(++seq, { at: now + ms, fn }); return seq; }, clear(id) { queue.delete(id); } },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        let next = null;
        for (const [k, e] of queue) if (e.at <= end && (next === null || e.at < queue.get(next).at)) next = k;
        if (next === null) break;
        const e = queue.get(next);
        queue.delete(next);
        now = e.at;
        e.fn();
      }
      now = end;
    },
    pending: () => queue.size,
  };
}

const noFile = { readText: ({ fail }) => fail('none', 301), writeText: ({ success }) => success() };

function makeCore(dev) {
  const c = clock();
  W.configureStub({ favorites: 5, network: 'ok', cache: false, ...dev }, c.timers);
  const core = createCore({ sdk: { P2pClient: W.P2pClient, Message: W.Message, Builder: W.Builder }, peer: PEER, file: noFile, timers: c.timers, now: c.now, version: '1.0.0' });
  return { core, c };
}

test('the core syncs once from app.js, before any page; the page attached later only redraws', () => {
  const { core, c } = makeCore();
  assert.equal(core.isStub, true);
  assert.equal(core.version, '1.0.0');
  core.start();
  core.start(); // idempotent
  c.advance(1500);
  assert.equal(core.session.st.cards.length, 5, 'synced without a page');
  let draws = 0;
  core.attach(() => { draws += 1; });
  core.tapRow(0);
  assert.ok(draws > 0, 'a tap redraws the attached page');
  assert.equal(core.session.st.ents[0].phase, 'pending');
  core.attach(null); // page gone: the action goes on
  c.advance(1300);
  assert.equal(core.session.st.ents[0].phase, 'ok', 'the action survives without a page');
});

test('the core forwards every tap with the tap guard, and unlocks only after "Déverrouiller"', () => {
  const { core, c } = makeCore();
  core.start();
  c.advance(1500);
  core.tapRow(3);
  assert.equal(core.session.nav, 'confirm');
  core.confirmYes();
  assert.equal(core.session.nav, 'confirm', 'the tap that opened the confirmation does not confirm it');
  c.advance(TAP_GUARD_MS);
  core.confirmYes();
  assert.equal(core.session.nav, 'dash');
  c.advance(1300);
  assert.equal(core.session.st.cards.find((x) => x.k === 3).s, 'unlocked');
  c.advance(TAP_GUARD_MS);
  core.openSettings();
  assert.equal(core.session.nav, 'settings');
  assert.equal(core.back(), false);
  assert.equal(core.back(), true, 'back from the list quits');
});

test('destroy (app.js onDestroy) clears every timer and ignores late replies; it is idempotent', () => {
  const { core, c } = makeCore();
  core.start();
  c.advance(1500);
  core.tapRow(0);
  let draws = 0;
  core.attach(() => { draws += 1; });
  core.destroy();
  core.destroy();
  assert.equal(c.pending(), 0, 'no timer survives (the stub reply is dropped with the receiver)');
  c.advance(10000);
  assert.equal(draws, 0);
});

nodeTest('link: the core published by app.js is what every bundle gets back, until onDestroy', () => {
  assert.equal(getCore(), null);
  const core = { tag: 'core' };
  publishCore(core);
  assert.equal(getCore(), core);
  assert.equal(JSON.__haWatchCore, core, 'kept on a built-in object shared by app.js and the pages');
  unpublishCore();
  assert.equal(getCore(), null);
});

nodeTest('app.js publishes the core and the page only reads it (no core module in the page)', () => {
  const app = readFileSync(resolve(MAIN, 'app.js'), 'utf8');
  const page = readFileSync(resolve(MAIN, 'pages/index/index.js'), 'utf8');
  assert.match(app, /publishCore\(core\)/);
  assert.match(app, /core\.start\(\)/);
  assert.match(app, /onDestroy[\s\S]*core\.destroy\(\)[\s\S]*unpublishCore\(\)/);
  assert.match(page, /getCore\(\)/);
  for (const m of ['session.js', 'p2pClient.js', 'haRepository.js', 'wearengine.js', 'core.js']) {
    assert.doesNotMatch(page, new RegExp(`from '[^']*${m.replace('.', '\\.')}'`), `page imports ${m}`);
  }
});

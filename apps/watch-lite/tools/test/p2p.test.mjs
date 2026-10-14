// P2P client (common/services/p2pClient.js) on a fake Wear Engine SDK, and the repository
// (common/services/haRepository.js) on a fake P2P client and a fake @system.file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { main, logic } from './paths.mjs';

const { createP2pClient } = await main('common/services/p2pClient.js');
const { createHaRepository, CACHE_URI } = await main('common/services/haRepository.js');
const { PEER } = await main('common/config/peer.js');
const { serializeCache } = await logic('cache.js');

/** Fake lite SDK: records peers, receiver and sent texts; the test drives the replies. */
function fakeSdk() {
  const sdk = { peer: {}, receiver: null, sent: [], unregistered: 0 };
  sdk.Builder = function () {};
  sdk.Builder.prototype.setDescription = function (text) { this.text = text; };
  sdk.Message = function () {};
  sdk.Message.prototype.setBuilder = function (b) { this.builder = b; };
  sdk.P2pClient = function () {};
  sdk.P2pClient.prototype.setPeerPkgName = (pkg) => { sdk.peer.pkg = pkg; };
  sdk.P2pClient.prototype.setPeerFingerPrint = (fp) => { sdk.peer.fingerprint = fp; };
  sdk.P2pClient.prototype.registerReceiver = (r) => { sdk.receiver = r; };
  sdk.P2pClient.prototype.unregisterReceiver = (r) => { assert.equal(r, sdk.receiver); sdk.unregistered += 1; };
  sdk.P2pClient.prototype.send = (message, cb) => { sdk.sent.push({ text: message.builder.text, cb }); };
  sdk.reply = (obj) => sdk.receiver.onReceiveMessage(typeof obj === 'string' ? obj : JSON.stringify(obj));
  return sdk;
}

function client() {
  const sdk = fakeSdk();
  const got = {};
  const p2p = createP2pClient(sdk, PEER);
  const ask = (id) => p2p.request(`{"id":"${id}"}`, id, (err, reply) => { got[id] = err || reply; });
  return { sdk, p2p, got, ask };
}

test('p2p: peer set from peer.js, one receiver, the text goes out through Builder.setDescription', () => {
  const { sdk, ask } = client();
  assert.deepEqual(sdk.peer, PEER);
  assert.equal(typeof sdk.receiver.onReceiveMessage, 'function');
  ask('a1');
  assert.deepEqual(sdk.sent.map((s) => s.text), ['{"id":"a1"}']);
});

test('p2p: replies are matched by id, out of order; unknown ids, duplicates and garbage are ignored', () => {
  const { sdk, got, ask } = client();
  ask('a1');
  ask('a2');
  sdk.reply({ v: 2, id: 'zz', type: 'ACK', ok: true });
  sdk.reply('garbage');
  sdk.reply({ v: 2, id: 'a2', type: 'ACK', ok: true });
  sdk.reply({ v: 2, id: 'a1', type: 'SYNC_RESPONSE', fr: 1, c: [] });
  sdk.reply({ v: 2, id: 'a1', type: 'ACK', ok: false, code: 'ha' });
  assert.deepEqual(got, {
    a2: { v: 2, id: 'a2', type: 'ACK', ok: true },
    a1: { v: 2, id: 'a1', type: 'SYNC_RESPONSE', fr: 1, c: [] },
  });
});

test('p2p: a message that cannot be sent is "tél. déconnecté", once', () => {
  const { sdk, got, ask } = client();
  ask('a1');
  ask('a2');
  sdk.sent[0].cb.onFailure();
  sdk.sent[1].cb.onSendResult({ code: 206 });
  sdk.sent[1].cb.onFailure();
  assert.deepEqual(got, { a1: { kind: 'tel' }, a2: { kind: 'tel' } });
  ask('a3');
  sdk.sent[2].cb.onSendResult({ code: 207 });
  sdk.sent[2].cb.onSuccess();
  assert.equal(got.a3, undefined, 'a delivered message still waits for its reply');
});

test('p2p: at most 8 requests wait; close drops them and unregisters the receiver', () => {
  const { sdk, p2p, got, ask } = client();
  for (let i = 0; i < 9; i++) ask('a' + i);
  sdk.reply({ id: 'a0', type: 'ACK', ok: true });
  assert.equal(got.a0, undefined, 'the oldest was dropped');
  sdk.reply({ id: 'a1', type: 'ACK', ok: true });
  assert.ok(got.a1);
  p2p.close();
  assert.equal(sdk.unregistered, 1);
  sdk.reply({ id: 'a8', type: 'ACK', ok: true });
  assert.equal(got.a8, undefined);
});

/** Fake P2P client: the test answers each request. */
function fakeP2p() {
  const p2p = { asked: [], closed: 0 };
  p2p.request = (text, id, cb) => p2p.asked.push({ msg: JSON.parse(text), id, cb });
  p2p.close = () => { p2p.closed += 1; };
  p2p.answer = (body) => { const r = p2p.asked.shift(); r.cb(null, { v: 2, id: r.id, ...body }); };
  return p2p;
}

function fakeFile(files = {}) {
  return {
    files,
    readText({ uri, success, fail }) { if (uri in files) success({ text: files[uri] }); else fail('no file', 301); },
    writeText({ uri, text, success }) { files[uri] = text; success(); },
  };
}

test('repository: sync sends SYNC_REQUEST and decodes { fr, cards }', () => {
  const p2p = fakeP2p();
  const repo = createHaRepository(p2p, fakeFile(), () => 1_700_000_000_000);
  let got = null;
  repo.sync((err, res) => { got = err || res; });
  const { msg, id } = p2p.asked[0];
  assert.deepEqual(msg, { v: 2, id, type: 'SYNC_REQUEST' });
  p2p.answer({ type: 'SYNC_RESPONSE', fr: 55808668, c: [{ k: 0, d: 'l', n: 'Kitchen', s: '1' }, { k: 1, d: 'k', n: 'Front door', s: 'L' }] });
  assert.deepEqual(got, { fr: 55808668, cards: [{ k: 0, d: 'light', n: 'Kitchen', s: 'on' }, { k: 1, d: 'lock', n: 'Front door', s: 'locked' }] });
});

test('repository: act sends CALL_SERVICE (act "confirm" only when confirmed) and returns the ACK card', () => {
  const p2p = fakeP2p();
  const repo = createHaRepository(p2p, fakeFile(), () => 5);
  const got = [];
  repo.act({ k: 1, fr: 7, confirm: true }, (err, card) => got.push(err || card));
  repo.act({ k: 0, fr: 7, confirm: false }, (err, card) => got.push(err || card));
  assert.deepEqual(p2p.asked.map((a) => a.msg), [
    { v: 2, id: p2p.asked[0].id, type: 'CALL_SERVICE', k: 1, fr: 7, act: 'confirm' },
    { v: 2, id: p2p.asked[1].id, type: 'CALL_SERVICE', k: 0, fr: 7 },
  ]);
  p2p.answer({ type: 'ACK', ok: true, c: { k: 1, d: 'k', n: 'Porte', s: 'U' } });
  p2p.answer({ type: 'ACK', ok: true });
  assert.deepEqual(got, [{ k: 1, d: 'lock', n: 'Porte', s: 'unlocked' }, null]);
});

test('repository: ACK errors map to stale / timeout / ha; a wrong reply type is ha; tel passes through', () => {
  const p2p = fakeP2p();
  const repo = createHaRepository(p2p, fakeFile(), () => 5);
  const got = [];
  const cb = (err) => got.push(err);
  for (const code of ['stale', 'timeout', 'auth']) {
    repo.act({ k: 0, fr: 1 }, cb);
    p2p.answer({ type: 'ACK', ok: false, code });
  }
  repo.sync(cb);
  p2p.answer({ type: 'ACK', ok: false, code: 'config' });
  repo.sync(cb);
  p2p.answer({ type: 'ACK', ok: true });
  repo.act({ k: 0, fr: 1 }, cb);
  p2p.answer({ type: 'SYNC_RESPONSE', fr: 1, c: [] });
  repo.sync(cb);
  p2p.asked.shift().cb({ kind: 'tel' }, null);
  assert.deepEqual(got, [{ kind: 'stale' }, { kind: 'timeout' }, { kind: 'ha' }, { kind: 'ha' }, { kind: 'ha' }, { kind: 'ha' }, { kind: 'tel' }]);
  repo.close();
  assert.equal(p2p.closed, 1);
});

test('repository: the cache file is read at launch and written by persist; missing or corrupt = no cache', () => {
  const state = { fr: 3, lastSyncAt: 1000, cards: [{ k: 0, d: 'light', n: 'Salon', s: 'on' }] };
  const file = fakeFile();
  const repo = createHaRepository(fakeP2p(), file, () => 5);
  let got = 'not called';
  repo.loadCache((c) => { got = c; });
  assert.equal(got, null, 'no file yet');
  repo.persist(state);
  assert.equal(file.files[CACHE_URI], serializeCache(state));
  repo.loadCache((c) => { got = c; });
  assert.deepEqual(got, { fr: 3, syncedAt: 1000, cards: state.cards });
  file.files[CACHE_URI] = '{broken';
  repo.loadCache((c) => { got = c; });
  assert.equal(got, null);

  const off = fakeFile({ [CACHE_URI]: serializeCache(state) });
  const noCache = createHaRepository(fakeP2p(), off, () => 5, { useCache: false });
  noCache.loadCache((c) => { got = c; });
  assert.equal(got, null, 'dev.js cache: false ignores the file');
  noCache.persist({ ...state, fr: 4 });
  assert.equal(off.files[CACHE_URI], serializeCache(state), '…and leaves it as it was');
});

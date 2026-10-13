// The design's interaction rules (docs/design/watch-lite/README.md § Règles d'interaction), played
// with fake timers on the real Mock and checked on the view-models with the real fr-FR texts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { logic, main, strings, MAIN } from './paths.mjs';
import { ICONS } from '../icons/spec.mjs';

const S = await logic('session.js');
const V = await logic('view.js');
const M = await main('common/repo/mockRepository.js');
const FR = strings('fr-FR');
const ICON_PATHS = new Set(ICONS.map((i) => '/common/icons/' + i.file));
const C = { txt: '#E0E0E0', sub: '#8C8C8C', off: '#6B6B6B', on: '#FFC247', lock: '#3DD68C', unlock: '#FF8A3D', act: '#41BDF5', err: '#FF5A52' };
const MIN = 60000;

/** Manual clock: timers fire in time order when the test advances it. */
function createClock() {
  let now = 1_700_000_000_000;
  let seq = 0;
  const queue = new Map();
  return {
    now: () => now,
    timers: {
      set(fn, ms) {
        seq += 1;
        queue.set(seq, { at: now + ms, fn });
        return seq;
      },
      clear(id) {
        queue.delete(id);
      },
    },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        let id = null;
        for (const [k, e] of queue) if (e.at <= end && (id === null || e.at < queue.get(id).at)) id = k;
        if (id === null) break;
        const e = queue.get(id);
        queue.delete(id);
        now = e.at;
        e.fn();
      }
      now = end;
    },
    pending: () => queue.size,
  };
}

/** Translation through the real fr-FR file: a missing key fails the test. */
function t(key) {
  assert.ok(Object.hasOwn(FR, key), `missing i18n key "${key}"`);
  return FR[key];
}

/** Opens the app on a repository (the Mock by default) and returns helpers. */
function launch(dev, makeRepo) {
  const clock = createClock();
  const repo = makeRepo ? makeRepo(clock) : M.createMockRepository(dev, clock.timers, clock.now);
  const acts = [];
  const spy = { ...repo, act: (req, cb) => { acts.push(req); repo.act(req, cb); } };
  let draws = 0;
  const se = S.createSession(spy, clock.timers, clock.now, () => { draws += 1; });
  S.open(se);
  const view = () => {
    const v = V.buildView(se, t, clock.now(), '1.0.0');
    for (const icon of [v.status?.icon, v.message?.icon, v.detail?.icon, ...(v.rows || []).flatMap((r) => [r.icon, r.check])]) {
      if (icon) assert.ok(ICON_PATHS.has(icon), `icon ${icon} is not one of the 26 generated PNGs`);
    }
    return v;
  };
  const row = (k) => view().rows.find((r) => r.k === k);
  return { se, clock, view, row, acts, draws: () => draws };
}

const DASH = { favorites: 5, network: 'ok', cache: true };

test('launch: the cache shows at once with a blue "Synchro…", then "à l’instant"; the age is recomputed on each render', () => {
  const app = launch(DASH);
  let v = app.view();
  assert.equal(v.screen, 'list');
  assert.deepEqual(v.rows.map((r) => r.name), ['Salon', 'Cuisine', 'Prise bureau', 'Porte d’entrée', 'Garage']);
  assert.deepEqual(v.status, { icon: '/common/icons/ic_sync_24_act.png', text: 'Synchro…', color: C.act });
  assert.deepEqual(app.row(0), { k: 0, name: 'Salon', icon: '/common/icons/ic_light_on.png', state: 'Allumée', color: C.on, check: '' });
  app.clock.advance(1500);
  v = app.view();
  assert.deepEqual(v.status, { icon: '/common/icons/ic_sync_24_sub.png', text: 'à l’instant', color: C.sub });
  app.clock.advance(3 * MIN);
  assert.equal(app.view().status.text, 'il y a 3 min');
  assert.ok(app.draws() > 0, 'the page is asked to redraw');
});

test('one tap = one action: only that row goes "en cours", then the new state + check for 1.5 s', () => {
  const app = launch(DASH);
  app.clock.advance(1500);
  S.tapRow(app.se, 0);
  assert.deepEqual(app.row(0), { k: 0, name: 'Salon', icon: '/common/icons/ic_pending_act.png', state: 'Extinction…', color: C.act, check: '' });
  assert.equal(app.row(1).state, 'Éteinte', 'the rest of the list is unchanged');
  S.tapRow(app.se, 0);
  assert.equal(app.acts.length, 1, 'a second tap while pending is ignored');
  S.tapRow(app.se, 1);
  assert.equal(app.row(1).state, 'Allumage…', 'the rest of the list stays usable');
  app.clock.advance(1300);
  assert.deepEqual(app.row(0), { k: 0, name: 'Salon', icon: '/common/icons/ic_light_off.png', state: 'Éteinte', color: C.off, check: '/common/icons/ic_check_24_off.png' });
  assert.equal(app.row(1).check, '/common/icons/ic_check_24_on.png');
  app.clock.advance(1499);
  assert.ok(app.row(0).check, 'check still shown before 1.5 s');
  app.clock.advance(1);
  assert.equal(app.row(0).check, '');
  assert.equal(app.row(0).state, 'Éteinte');
});

test('failure: red row with its cause for 3 s, red indicator, then the cached state comes back', () => {
  const app = launch({ ...DASH, network: 'ha' });
  app.clock.advance(1500);
  assert.deepEqual(app.view().status, { icon: '/common/icons/ic_ha_off_24_err.png', text: 'HA injoignable', color: C.err });
  assert.equal(app.view().screen, 'list', 'with a cache the error stays discreet');
  S.tapRow(app.se, 1);
  app.clock.advance(1300);
  assert.deepEqual(app.row(1), { k: 1, name: 'Cuisine', icon: '/common/icons/ic_fail_err.png', state: 'Échec : HA injoignable', color: C.err, check: '' });
  app.clock.advance(2999);
  assert.equal(app.row(1).state, 'Échec : HA injoignable', 'still red before 3 s');
  app.clock.advance(1);
  assert.equal(app.row(1).state, 'Éteinte');
  assert.equal(app.row(1).icon, '/common/icons/ic_light_off.png');

  const tel = launch({ ...DASH, network: 'tel' });
  tel.clock.advance(900);
  assert.equal(tel.view().status.text, 'Tél. déconnecté');
  S.tapRow(tel.se, 2);
  tel.clock.advance(500);
  assert.equal(tel.row(2).state, 'Échec : tél. déconnecté');
});

test('no answer within 8 s: "Échec : délai dépassé"; a late answer changes no feedback', () => {
  let late = null;
  const cards = M.DEMO.slice(0, 5);
  const app = launch(null, (clock) => ({
    loadCache: (cb) => cb({ fr: 1, syncedAt: clock.now() - MIN, cards }),
    sync: (cb) => cb(null, { fr: 1, cards }),
    act: (req, cb) => { late = cb; },
    close() {},
  }));
  S.tapRow(app.se, 2);
  app.clock.advance(7999);
  assert.equal(app.row(2).state, 'Extinction…');
  app.clock.advance(1);
  assert.equal(app.row(2).state, 'Échec : délai dépassé');
  assert.equal(app.view().status.color, C.sub, 'a timeout does not turn the indicator red');
  late(null, { k: 2, d: 'switch', n: 'Prise bureau', s: 'off' });
  assert.equal(app.row(2).state, 'Échec : délai dépassé', 'the late success shows no check');
  app.clock.advance(3000);
  assert.equal(app.row(2).state, 'Éteint', 'but its state is the truth from Home Assistant');
});

test('unlocking goes through the confirmation (auto-cancelled after 10 s); locking stays immediate', () => {
  const app = launch(DASH);
  app.clock.advance(1500);
  S.tapRow(app.se, 3);
  assert.equal(app.view().screen, 'confirm');
  assert.equal(app.view().confirmName, 'Porte d’entrée');
  app.clock.advance(9999);
  assert.equal(app.view().screen, 'confirm', 'still open before 10 s');
  app.clock.advance(1);
  assert.equal(app.view().screen, 'list');
  assert.equal(app.acts.length, 0, 'nothing is sent without "Déverrouiller"');

  S.tapRow(app.se, 3);
  S.confirmYes(app.se);
  app.clock.advance(S.CONFIRM_GUARD_MS - 1);
  S.confirmYes(app.se);
  assert.equal(app.view().screen, 'confirm', 'a double tap cannot skip the confirmation');
  assert.equal(app.acts.length, 0);
  app.clock.advance(1);
  S.confirmYes(app.se);
  assert.equal(app.view().screen, 'list', 'back to where it came from');
  assert.deepEqual(app.acts[0], { k: 3, fr: 1, confirm: true });
  assert.equal(app.row(3).state, 'Déverrouillage…');
  app.clock.advance(1300);
  assert.equal(app.row(3).state, 'Déverrouillée');
  assert.equal(app.row(3).check, '/common/icons/ic_check_24_unlock.png');

  S.tapRow(app.se, 4);
  assert.equal(app.view().screen, 'list', 'locking needs no confirmation');
  assert.deepEqual(app.acts[1], { k: 4, fr: 1, confirm: false });
  assert.equal(app.row(4).state, 'Verrouillage…');
});

test('the 10 s auto-cancel never fires once the confirmation is closed (Annuler, Déverrouiller, swipe)', () => {
  const app = launch({ ...DASH, favorites: 10 });
  app.clock.advance(1500);
  const settingsAfter10s = (close) => {
    S.tapRow(app.se, 3);
    app.clock.advance(S.CONFIRM_GUARD_MS);
    close();
    S.openSettings(app.se);
    app.clock.advance(10000);
    assert.equal(app.view().screen, 'settings', 'no late jump back to the list');
    S.back(app.se);
  };
  settingsAfter10s(() => S.confirmNo(app.se));
  settingsAfter10s(() => S.back(app.se));
  settingsAfter10s(() => S.confirmYes(app.se));
  assert.equal(app.acts.length, 1);
});

test('taps reach only the visible screen: a click after a long press does not act, a stray tap keeps one confirmation', () => {
  const app = launch(DASH);
  app.clock.advance(1500);
  S.longPressRow(app.se, 0);
  S.tapRow(app.se, 0);
  assert.equal(app.view().screen, 'detail');
  assert.equal(app.acts.length, 0, 'the long-pressed light is not toggled');
  S.tapStatus(app.se);
  S.openSettings(app.se);
  assert.equal(app.view().screen, 'detail', 'list-only taps are ignored outside the list');
  S.back(app.se);

  S.tapRow(app.se, 3);
  S.tapRow(app.se, 3);
  S.confirmNo(app.se);
  S.openSettings(app.se);
  app.clock.advance(10000);
  assert.equal(app.view().screen, 'settings', 'no second 10 s timer was left behind');

  S.back(app.se);
  S.tapDetailButton(app.se);
  assert.equal(app.acts.length, 0, 'the detail button only works on the detail');
});

test('the Mock refuses an unlock that skipped the confirmation, like the companion', () => {
  const clock = createClock();
  const repo = M.createMockRepository(DASH, clock.timers, clock.now);
  let res = null;
  repo.act({ k: 3, fr: 1, confirm: false }, (err) => { res = err; });
  clock.advance(1300);
  assert.deepEqual(res, { kind: 'ha' });
  repo.act({ k: 3, fr: 9, confirm: true }, (err) => { res = err; });
  clock.advance(1300);
  assert.deepEqual(res, { kind: 'stale' }, 'an old favorites revision is refused');
  assert.deepEqual(M.DEMO.map((c) => c.n), ['Salon', 'Cuisine', 'Prise bureau', 'Porte d’entrée', 'Garage', 'Lampe de chevet parents', 'Volet séjour', 'Température salon', 'Bonne nuit', 'Ventilation']);
});

test('detail: name, big state, last update, one button in the target colour, greyed while running', () => {
  const app = launch({ ...DASH, favorites: 10 });
  app.clock.advance(1500);
  S.longPressRow(app.se, 0);
  let d = app.view().detail;
  assert.equal(app.view().screen, 'detail');
  assert.deepEqual(d, {
    icon: '/common/icons/ic_light_on.png', name: 'Salon', state: 'Allumée', color: C.on, meta: 'Mis à jour à l’instant', metaColor: C.sub,
    hasButton: true, btnText: 'Éteindre', btnColor: C.txt, btnBorder: C.off, btnOpacity: 1, readOnly: false,
  });
  S.tapDetailButton(app.se);
  d = app.view().detail;
  assert.equal(d.state, 'Extinction…');
  assert.equal(d.btnOpacity, 0.4);
  S.tapDetailButton(app.se);
  assert.equal(app.acts.length, 1, 'the greyed button is inactive');
  app.clock.advance(1300 + 2 * MIN);
  d = app.view().detail;
  assert.equal(d.state, 'Éteinte');
  assert.deepEqual([d.btnText, d.btnColor, d.btnBorder], ['Allumer', C.on, C.on]);
  assert.equal(d.meta, 'Mis à jour il y a 2 min', 'age of the refreshed card');

  S.back(app.se);
  S.tapRow(app.se, 7);
  d = app.view().detail;
  assert.equal(d.state, '21,5 °C');
  assert.equal(d.hasButton, false);
  assert.equal(d.readOnly, true, 'sensor: "Lecture seule"');

  S.back(app.se);
  S.longPressRow(app.se, 4);
  assert.deepEqual([app.view().detail.btnText, app.view().detail.btnColor], ['Verrouiller', C.lock]);
  S.back(app.se);
  S.longPressRow(app.se, 3);
  assert.deepEqual([app.view().detail.btnText, app.view().detail.btnColor], ['Déverrouiller', C.unlock]);
  S.tapDetailButton(app.se);
  assert.equal(app.view().screen, 'confirm');
  S.confirmNo(app.se);
  assert.equal(app.view().screen, 'detail', 'cancel returns to the detail');
  S.tapDetailButton(app.se);
  app.clock.advance(S.CONFIRM_GUARD_MS);
  S.confirmYes(app.se);
  assert.equal(app.view().screen, 'detail');
  assert.equal(app.view().detail.state, 'Déverrouillage…');
});

test('a failed action in the detail keeps the cached state; the cause replaces "Mis à jour"', () => {
  const app = launch({ ...DASH, network: 'ha' });
  app.clock.advance(1500);
  S.longPressRow(app.se, 0);
  S.tapDetailButton(app.se);
  app.clock.advance(1300);
  const d = app.view().detail;
  assert.deepEqual([d.icon, d.state, d.color, d.meta, d.metaColor], ['/common/icons/ic_fail_err.png', 'Allumée', C.on, 'Échec : HA injoignable', C.err]);
});

test('no cache: full-screen 5b / 5c; "Réessayer" works in place and leaves only on success', () => {
  let ok = false;
  const cards = M.DEMO.slice(0, 5);
  const app = launch(null, (clock) => ({
    loadCache: (cb) => cb(null),
    sync: (cb) => clock.timers.set(() => (ok ? cb(null, { fr: 1, cards }) : cb({ kind: 'tel' })), 900),
    act() {},
    close() {},
  }));
  assert.equal(app.view().screen, 'list', 'first sync: empty list with "Synchro…"');
  app.clock.advance(900);
  assert.deepEqual(app.view().message, {
    icon: '/common/icons/ic_phone_off_err.png', t1: 'Téléphone non', t2: 'connecté',
    b1: 'Activez le Bluetooth et ouvrez', b2: 'l’app compagnon.', btn: 'Réessayer',
  });
  assert.equal(app.view().screen, 'error');
  S.retry(app.se);
  assert.equal(app.view().screen, 'error');
  assert.equal(app.view().message.btn, 'Connexion…');
  app.clock.advance(900);
  assert.equal(app.view().message.btn, 'Réessayer', 'still failing: stays on the error');
  ok = true;
  S.retry(app.se);
  app.clock.advance(900);
  assert.equal(app.view().screen, 'list');

  const ha = launch({ favorites: 5, network: 'ha', cache: false });
  ha.clock.advance(1500);
  const m = ha.view().message;
  assert.deepEqual([m.icon, m.t1, m.t2, m.b1, m.b2], ['/common/icons/ic_ha_off_err.png', 'Home Assistant', 'injoignable', 'Vérifiez le réseau du', 'téléphone.']);
});

test('with a cache, the red indicator opens the error screen; it is ignored during a sync', () => {
  const app = launch({ ...DASH, network: 'tel' });
  S.tapStatus(app.se);
  assert.equal(app.view().screen, 'list', 'ignored while syncing');
  app.clock.advance(900);
  S.tapStatus(app.se);
  assert.equal(app.view().screen, 'error');
  assert.equal(app.view().message.t1, 'Téléphone non');
  S.back(app.se);
  assert.equal(app.view().screen, 'list');

  const ok = launch(DASH);
  ok.clock.advance(1500);
  S.tapStatus(ok.se);
  assert.equal(ok.view().status.text, 'Synchro…', 'a grey indicator resyncs');
});

test('no favorite: 5d with "Resynchroniser" ("Synchro…" while it runs)', () => {
  const app = launch({ favorites: 0, network: 'ok', cache: false });
  app.clock.advance(1500);
  assert.equal(app.view().screen, 'empty');
  assert.deepEqual(app.view().message, {
    icon: '/common/icons/ic_star_sub.png', t1: 'Aucun favori', t2: '', b1: 'Choisissez vos favoris dans', b2: 'l’app du téléphone', btn: 'Resynchroniser',
  });
  S.retry(app.se);
  assert.equal(app.view().message.btn, 'Synchro…');
});

test('settings: phone and HA status, resync, last sync, favorites, version', () => {
  const app = launch(DASH);
  S.openSettings(app.se);
  assert.deepEqual(app.view().settings, {
    phone: 'Inconnu', phoneColor: C.sub, ha: 'Inconnu', haColor: C.sub, btn: 'Synchro…', last: 'il y a 3 min', fav: '5 sur 10', version: '1.0.0',
  });
  app.clock.advance(1500);
  assert.deepEqual(app.view().settings, {
    phone: 'Connecté', phoneColor: C.lock, ha: 'Joignable', haColor: C.lock, btn: 'Resynchroniser', last: 'à l’instant', fav: '5 sur 10', version: '1.0.0',
  });
  S.retry(app.se);
  assert.equal(app.view().screen, 'settings', 'resync stays on the settings');

  const ha = launch({ ...DASH, network: 'ha' });
  ha.clock.advance(1500);
  S.openSettings(ha.se);
  assert.deepEqual([ha.view().settings.phone, ha.view().settings.ha, ha.view().settings.haColor], ['Connecté', 'Injoignable', C.err]);
  const tel = launch({ ...DASH, network: 'tel' });
  tel.clock.advance(900);
  S.openSettings(tel.se);
  assert.deepEqual([tel.view().settings.phone, tel.view().settings.phoneColor, tel.view().settings.ha], ['Déconnecté', C.err, 'Inconnu']);
});

test('swipe right: detail, settings, error → list; confirmation → its origin; list → quit', () => {
  const app = launch(DASH);
  app.clock.advance(1500);
  S.longPressRow(app.se, 0);
  assert.equal(S.back(app.se), false);
  assert.equal(app.view().screen, 'list');
  S.openSettings(app.se);
  S.back(app.se);
  assert.equal(app.view().screen, 'list');
  S.tapRow(app.se, 3);
  S.back(app.se);
  assert.equal(app.view().screen, 'list');
  S.longPressRow(app.se, 3);
  S.tapDetailButton(app.se);
  S.back(app.se);
  assert.equal(app.view().screen, 'detail');
  S.back(app.se);
  assert.equal(S.back(app.se), true, 'back from the list quits the app');
});

test('an action in flight survives screen changes (single page)', () => {
  const app = launch(DASH);
  app.clock.advance(1500);
  S.longPressRow(app.se, 0);
  S.tapDetailButton(app.se);
  S.back(app.se);
  assert.equal(app.row(0).state, 'Extinction…');
  S.openSettings(app.se);
  app.clock.advance(1300);
  S.back(app.se);
  assert.equal(app.row(0).state, 'Éteinte');
  assert.ok(app.row(0).check);
});

test('a resync that changes the favorites closes a confirmation or detail on that slot (never unlock the wrong lock)', () => {
  let fr = 1;
  const before = M.DEMO.slice(0, 5);
  const after = [{ k: 3, d: 'light', n: 'Autre', s: 'off' }];
  const app = launch(null, (clock) => ({
    loadCache: (cb) => cb({ fr: 1, syncedAt: clock.now(), cards: before }),
    sync: (cb) => clock.timers.set(() => cb(null, { fr, cards: fr === 1 ? before : after }), 1500),
    act() {},
    close() {},
  }));
  fr = 2;
  S.tapRow(app.se, 3);
  assert.equal(app.view().screen, 'confirm');
  app.clock.advance(1500);
  assert.equal(app.view().screen, 'list');
  assert.equal(app.clock.pending(), 0, 'the 10 s confirmation timer is gone');
  S.confirmYes(app.se);
  assert.equal(app.acts.length, 0);

  fr = 3;
  S.tapStatus(app.se);
  S.longPressRow(app.se, 3);
  assert.equal(app.view().detail.name, 'Autre', 'detail opened while the resync runs');
  app.clock.advance(1500);
  assert.equal(app.view().screen, 'list', 'the detail closes too');
});

test('an action reply never overwrites a slot after the favorites changed (B1: never unlock the wrong lock)', () => {
  let fr = 1;
  let reply = null;
  const garage = [{ k: 3, d: 'lock', n: 'Garage', s: 'unlocked' }];
  const porte = [{ k: 3, d: 'lock', n: 'Porte d’entrée', s: 'locked' }];
  const app = launch(null, (clock) => ({
    loadCache: (cb) => cb({ fr: 1, syncedAt: clock.now(), cards: garage }),
    sync: (cb) => clock.timers.set(() => cb(null, { fr, cards: fr === 1 ? garage : porte }), 100),
    act: (req, cb) => { reply = cb; },
    close() {},
  }));
  app.clock.advance(100);
  S.tapRow(app.se, 3);
  assert.deepEqual(app.acts[0], { k: 3, fr: 1, confirm: false }, 'locking the Garage');
  fr = 2;
  S.tapStatus(app.se);
  app.clock.advance(100);
  assert.equal(app.row(3).name, 'Porte d’entrée');
  reply(null, { k: 3, d: 'lock', n: 'Garage', s: 'locked' });
  assert.equal(app.row(3).name, 'Porte d’entrée', 'the old reply is dropped');
  assert.equal(app.row(3).state, 'Verrouillée');
  S.tapRow(app.se, 3);
  assert.equal(app.view().confirmName, 'Porte d’entrée', 'the confirmation names the lock that will open');
  app.clock.advance(S.CONFIRM_GUARD_MS);
  S.confirmYes(app.se);
  assert.deepEqual(app.acts[1], { k: 3, fr: 2, confirm: true });
  reply(null, { k: 4, d: 'light', n: 'Ailleurs', s: 'on' });
  assert.equal(app.row(3).name, 'Porte d’entrée', 'a reply for another slot is ignored');
});

test('a background sync that succeeds while the error screen is open returns to the list', () => {
  const cards = M.DEMO.slice(0, 5);
  let syncs = 0;
  const app = launch(null, (clock) => ({
    loadCache: (cb) => cb({ fr: 1, syncedAt: clock.now(), cards }),
    sync: (cb) => {
      syncs += 1;
      clock.timers.set(() => (syncs === 1 ? cb({ kind: 'ha' }) : cb(null, { fr: 1, cards })), 100);
    },
    act: (req, cb) => clock.timers.set(() => cb({ kind: 'stale' }), 500),
    close() {},
  }));
  app.clock.advance(100);
  S.tapRow(app.se, 0);
  S.tapStatus(app.se);
  assert.equal(app.view().screen, 'error');
  app.clock.advance(600);
  assert.equal(app.view().screen, 'list');
  assert.equal(S.back(app.se), true, 'one swipe from the list quits');
});

test('stale favorites: the action is dropped without an error and the list resyncs', () => {
  const cards = M.DEMO.slice(0, 5);
  let syncs = 0;
  const app = launch(null, (clock) => ({
    loadCache: (cb) => cb({ fr: 1, syncedAt: clock.now(), cards }),
    sync: (cb) => { syncs += 1; clock.timers.set(() => cb(null, { fr: 1, cards }), 100); },
    act: (req, cb) => clock.timers.set(() => cb({ kind: 'stale' }), 100),
    close() {},
  }));
  app.clock.advance(100);
  S.tapRow(app.se, 0);
  app.clock.advance(100);
  assert.equal(app.row(0).state, 'Allumée', 'no red row');
  assert.equal(app.view().status.text, 'Synchro…');
  assert.equal(syncs, 2);
});

test('leaving the page clears every timer and ignores late replies', () => {
  const app = launch(DASH);
  app.clock.advance(1500);
  S.tapRow(app.se, 0);
  S.tapRow(app.se, 3);
  assert.ok(app.clock.pending() > 0);
  S.destroy(app.se);
  assert.equal(app.clock.pending(), 0);

  let reply = null;
  const late = launch(null, (clock) => ({
    loadCache: (cb) => cb({ fr: 1, syncedAt: clock.now(), cards: M.DEMO.slice(0, 5) }),
    sync: (cb) => cb(null, { fr: 1, cards: M.DEMO.slice(0, 5) }),
    act: (req, cb) => { reply = cb; },
    close() {},
  }));
  S.tapRow(late.se, 0);
  S.destroy(late.se);
  const draws = late.draws();
  reply(null, { k: 0, d: 'light', n: 'Salon', s: 'off' });
  assert.equal(late.draws(), draws, 'no redraw after the page is gone');
  assert.equal(late.se.st.cards[0].s, 'on', 'and no state change');
});

test('fr-FR, en-US and ru-RU have the same keys and placeholders, none empty', () => {
  const langs = ['fr-FR', 'en-US', 'ru-RU'].map((l) => [l, strings(l)]);
  const keys = Object.keys(langs[0][1]).sort();
  const holes = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
  for (const [lang, s] of langs) {
    assert.deepEqual(Object.keys(s).sort(), keys, lang);
    for (const k of keys) {
      assert.ok(s[k].length > 0, `${lang}.${k} empty`);
      assert.equal(holes(s[k]), holes(FR[k]), `${lang}.${k} placeholders`);
    }
  }
});

test('every $t key of the page exists in the three languages', () => {
  const hml = readFileSync(join(MAIN, 'pages/index/index.hml'), 'utf8');
  const keys = [...hml.matchAll(/\$t\('strings\.(\w+)'\)/g)].map((m) => m[1]);
  assert.ok(keys.length >= 8);
  for (const lang of ['fr-FR', 'en-US', 'ru-RU']) {
    const s = strings(lang);
    for (const k of keys) assert.ok(Object.hasOwn(s, k), `${lang}: missing ${k}`);
  }
});

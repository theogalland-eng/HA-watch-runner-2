import { test } from 'node:test';
import assert from 'node:assert/strict';
import { logic } from './paths.mjs';
import { ICONS } from '../icons/spec.mjs';

const L = { ...(await logic('look.js')), ...(await logic('rules.js')) };
const card = (d, s) => ({ k: 0, d, n: 'X', s });
const ICON_FILES = new Set(ICONS.map((i) => i.file.replace(/\.png$/, '')));

test('state look matches the design palette and texts', () => {
  assert.deepEqual(L.stateLook(card('light', 'on')), { icon: 'ic_light_on', iconColor: 'on', textKey: 'st_light_on', text: null, stateColor: 'on' });
  assert.deepEqual(L.stateLook(card('light', 'off')), { icon: 'ic_light_off', iconColor: 'off', textKey: 'st_light_off', text: null, stateColor: 'off' });
  assert.equal(L.stateLook(card('switch', 'on')).textKey, 'st_switch_on');
  assert.equal(L.stateLook(card('lock', 'locked')).stateColor, 'lock');
  assert.equal(L.stateLook(card('lock', 'unlocked')).icon, 'ic_unlock_unlock');
  assert.equal(L.stateLook(card('cover', 'open')).textKey, 'st_open');
  assert.equal(L.stateLook(card('cover', 'closed')).icon, 'ic_cover_off');
  assert.deepEqual(L.stateLook(card('scene', 'idle')), { icon: 'ic_scene_act', iconColor: 'act', textKey: 'st_scene', text: null, stateColor: 'sub' });
  assert.deepEqual(L.stateLook(card('sensor', '21,5 °C')), { icon: 'ic_sensor_sub', iconColor: 'sub', textKey: null, text: '21,5 °C', stateColor: 'txt' });
});

test('states not drawn in the design stay readable (unavailable, jammed)', () => {
  assert.equal(L.stateLook(card('light', 'unavailable')).textKey, 'st_unavailable');
  assert.equal(L.stateLook(card('light', 'unavailable')).icon, 'ic_light_off');
  assert.equal(L.stateLook(card('lock', 'unknown')).icon, 'ic_fail_err', 'no grey lock icon exists');
  assert.equal(L.stateLook(card('lock', 'jammed')).textKey, 'st_jammed');
  assert.equal(L.stateLook(card('sensor', 'unavailable')).textKey, 'st_unavailable', 'a sensor with no value (or an unknown code)');
  assert.equal(L.stateLook(card('sensor', 'unknown')).textKey, 'st_unavailable');
  assert.equal(L.stateLook(card('scene', 'unknown')).textKey, 'st_scene', 'a scene is "unknown" until first activated');
  assert.equal(L.tapAction(card('scene', 'unknown')), 'run');
  assert.equal(L.tapAction(card('scene', 'unavailable')), 'none');
});

test('transient states show as "en cours", never as the end state (security of locks)', () => {
  const locking = L.stateLook(card('lock', 'locking'));
  assert.deepEqual(locking, { icon: 'ic_pending_act', iconColor: 'act', textKey: 'pend_lock', text: null, stateColor: 'act' });
  assert.equal(L.stateLook(card('lock', 'unlocking')).textKey, 'pend_unlock');
  assert.equal(L.stateLook(card('lock', 'opening')).textKey, 'pend_unlock');
  assert.equal(L.stateLook(card('lock', 'open')).textKey, 'st_unlocked');
  assert.equal(L.stateLook(card('cover', 'opening')).textKey, 'pend_open');
  assert.equal(L.stateLook(card('cover', 'closing')).textKey, 'pend_close');
  // HA confirmed the call but the lock is still moving: no "Déverrouillée", no check yet.
  const ok = L.rowView(card('lock', 'locking'), { phase: 'ok' });
  assert.equal(ok.textKey, 'pend_lock');
  assert.equal(ok.check, null);
  for (const s of ['locking', 'unlocking', 'opening']) {
    assert.equal(L.tapAction(card('lock', s)), 'none', s);
    assert.equal(L.detailButton(card('lock', s)), null, s);
  }
});

test('one tap = one action, except unlocking (confirmation) and sensors (detail)', () => {
  assert.equal(L.tapAction(card('light', 'on')), 'run');
  assert.equal(L.tapAction(card('lock', 'unlocked')), 'run', 'locking stays immediate');
  assert.equal(L.tapAction(card('lock', 'locked')), 'confirm');
  assert.equal(L.tapAction(card('sensor', '21')), 'detail');
  assert.equal(L.tapAction(card('switch', 'unavailable')), 'none');
});

test('pending texts follow the target state', () => {
  assert.equal(L.pendingKey('light', L.targetOf('light', 'on')), 'pend_off'); // « Extinction… »
  assert.equal(L.pendingKey('switch', L.targetOf('switch', 'off')), 'pend_on'); // « Allumage… »
  assert.equal(L.pendingKey('lock', L.targetOf('lock', 'locked')), 'pend_unlock');
  assert.equal(L.pendingKey('lock', L.targetOf('lock', 'unlocked')), 'pend_lock');
  assert.equal(L.pendingKey('cover', L.targetOf('cover', 'open')), 'pend_close');
  assert.equal(L.pendingKey('scene', 'idle'), 'pend_scene');
});

test('row feedback: pending blue, failure red, success with the check in the new state colour', () => {
  const salon = card('light', 'on');
  assert.deepEqual(L.rowView(salon, null), { ...L.stateLook(salon), check: null });
  const pending = L.rowView(salon, { phase: 'pending', to: 'off' });
  assert.equal(pending.icon, 'ic_pending_act');
  assert.equal(pending.textKey, 'pend_off');
  assert.equal(pending.stateColor, 'act');
  const fail = L.rowView(salon, { phase: 'fail', err: 'ha' });
  assert.equal(fail.icon, 'ic_fail_err');
  assert.equal(fail.textKey, 'fail_ha');
  assert.equal(L.rowView(salon, { phase: 'fail', err: 'tel' }).textKey, 'fail_phone');
  assert.equal(L.rowView(salon, { phase: 'fail', err: 'timeout' }).textKey, 'fail_timeout');
  assert.equal(L.rowView(card('light', 'on'), { phase: 'ok' }).check, 'ic_check_24_on');
  assert.equal(L.rowView(card('lock', 'locked'), { phase: 'ok' }).check, 'ic_check_24_lock');
  const scene = L.rowView(card('scene', 'idle'), { phase: 'ok' });
  assert.equal(scene.textKey, 'st_scene_done');
  assert.equal(scene.check, 'ic_check_24_act');
});

test('detail button takes the colour of the state it leads to; sensors have none', () => {
  assert.deepEqual(L.detailButton(card('light', 'on')), { key: 'btn_turn_off', color: 'txt', border: 'off' });
  assert.deepEqual(L.detailButton(card('light', 'off')), { key: 'btn_turn_on', color: 'on', border: 'on' });
  assert.deepEqual(L.detailButton(card('lock', 'locked')), { key: 'btn_unlock', color: 'unlock', border: 'unlock' });
  assert.deepEqual(L.detailButton(card('lock', 'unlocked')), { key: 'btn_lock', color: 'lock', border: 'lock' });
  assert.equal(L.detailButton(card('cover', 'closed')).key, 'btn_open');
  assert.equal(L.detailButton(card('scene', 'idle')).color, 'act');
  assert.equal(L.detailButton(card('sensor', '21')), null);
  assert.equal(L.detailButton(card('light', 'unavailable')), null, 'no "Allumer" when the tap is ignored');
});

test('every icon the logic can return exists among the 26 generated PNGs', () => {
  const states = ['on', 'off', 'locked', 'unlocked', 'locking', 'unlocking', 'opening', 'closing', 'jammed', 'open', 'closed', 'idle', 'unavailable', 'unknown', '21,5 °C'];
  const phases = [null, { phase: 'pending', to: 'on' }, { phase: 'fail', err: 'ha' }, { phase: 'ok' }];
  for (const d of L.DOMAINS) {
    for (const s of states) {
      for (const ent of phases) {
        const v = L.rowView(card(d, s), ent);
        assert.ok(ICON_FILES.has(v.icon), `${d}/${s}: ${v.icon}`);
        if (v.check) assert.ok(ICON_FILES.has(v.check), `${d}/${s}: ${v.check}`);
      }
    }
  }
});

test('rules.canAct matches the detail button: an action exactly when look.js draws a button', () => {
  for (const d of ['light', 'switch', 'lock', 'cover', 'scene', 'sensor', 'climate']) {
    for (const s of ['on', 'off', 'locked', 'unlocked', 'locking', 'jammed', 'open', 'closing', 'unknown', 'unavailable', '21,5 °C']) {
      assert.equal(L.canAct(card(d, s)), L.detailButton(card(d, s)) !== null, `${d}/${s}`);
    }
  }
});

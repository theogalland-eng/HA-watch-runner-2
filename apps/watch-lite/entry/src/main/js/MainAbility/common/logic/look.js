// How a favorite looks and behaves, ported from the design prototype (look(), rowVM(), detailVM()).
// A card is the v2 compact shape { k: slot, d: domain, n: name, s: state }. The watch stays
// presentation-only: it never decides HA services, only icons, colours, texts and the tap gesture.
// Pure ES5, no @system import (unit-tested with Node). Texts are i18n keys of `strings.*`.
// The action rules (tap, target, busy) live in rules.js, shared with the app-level core.
import { transientKey, isDown, isBusy } from './rules.js';

/** Domains the watch can draw. light/switch/lock come from the companion; cover/scene/sensor are ready. */
export var DOMAINS = ['light', 'switch', 'lock', 'cover', 'scene', 'sensor'];

/** Base look of a card at rest: icon file name, icon colour role, state text (key or raw), state colour role. */
export function stateLook(card) {
    var d = card.d;
    var s = card.s;
    // Not drawn in the design: HA "unavailable"/"unknown". Grey text; the icon is the grey "off"
    // variant, or the red alert for a lock (no grey lock exists, and a lock of unknown state matters).
    var moving = transientKey(d, s);
    if (moving) {
        return { icon: 'ic_pending_act', iconColor: 'act', textKey: moving, text: null, stateColor: 'act' };
    }
    if (isDown(d, s)) {
        if (d === 'lock') {
            return { icon: 'ic_fail_err', iconColor: 'err', textKey: 'st_unavailable', text: null, stateColor: 'off' };
        }
        return { icon: iconFor(d), iconColor: d === 'scene' ? 'act' : 'off', textKey: 'st_unavailable', text: null, stateColor: 'off' };
    }
    if (d === 'light') {
        return s === 'on'
            ? { icon: 'ic_light_on', iconColor: 'on', textKey: 'st_light_on', text: null, stateColor: 'on' }
            : { icon: 'ic_light_off', iconColor: 'off', textKey: 'st_light_off', text: null, stateColor: 'off' };
    }
    if (d === 'switch') {
        return s === 'on'
            ? { icon: 'ic_switch_on', iconColor: 'on', textKey: 'st_switch_on', text: null, stateColor: 'on' }
            : { icon: 'ic_switch_off', iconColor: 'off', textKey: 'st_switch_off', text: null, stateColor: 'off' };
    }
    if (d === 'lock') {
        if (s === 'locked') {
            return { icon: 'ic_lock_lock', iconColor: 'lock', textKey: 'st_locked', text: null, stateColor: 'lock' };
        }
        if (s === 'jammed') {
            return { icon: 'ic_fail_err', iconColor: 'err', textKey: 'st_jammed', text: null, stateColor: 'err' };
        }
        return { icon: 'ic_unlock_unlock', iconColor: 'unlock', textKey: 'st_unlocked', text: null, stateColor: 'unlock' }; // unlocked, open
    }
    if (d === 'cover') {
        return s === 'open'
            ? { icon: 'ic_cover_on', iconColor: 'on', textKey: 'st_open', text: null, stateColor: 'on' }
            : { icon: 'ic_cover_off', iconColor: 'off', textKey: 'st_closed', text: null, stateColor: 'off' };
    }
    if (d === 'scene') {
        return { icon: 'ic_scene_act', iconColor: 'act', textKey: 'st_scene', text: null, stateColor: 'sub' };
    }
    // sensor (and any unknown domain): the raw value, e.g. "21,5 °C", in main text colour.
    return { icon: 'ic_sensor_sub', iconColor: 'sub', textKey: null, text: String(s), stateColor: 'txt' };
}

/** Icon at rest for an entity whose state is unknown (grey "off" variant when one exists). */
function iconFor(d) {
    if (d === 'light') {
        return 'ic_light_off';
    }
    if (d === 'switch') {
        return 'ic_switch_off';
    }
    if (d === 'cover') {
        return 'ic_cover_off';
    }
    if (d === 'scene') {
        return 'ic_scene_act';
    }
    return 'ic_sensor_sub';
}

/** "En cours" text key for an action heading to `to` (Allumage…, Extinction…, Verrouillage…). */
export function pendingKey(d, to) {
    if (d === 'light' || d === 'switch') {
        return to === 'on' ? 'pend_on' : 'pend_off';
    }
    if (d === 'lock') {
        return to === 'locked' ? 'pend_lock' : 'pend_unlock';
    }
    if (d === 'cover') {
        return to === 'open' ? 'pend_open' : 'pend_close';
    }
    if (d === 'scene') {
        return 'pend_scene';
    }
    return 'pend_generic';
}

/** Failure text key: 'tel' → tél. déconnecté, 'ha' → HA injoignable, otherwise délai dépassé. */
export function failKey(kind) {
    if (kind === 'tel') {
        return 'fail_phone';
    }
    if (kind === 'ha') {
        return 'fail_ha';
    }
    return 'fail_timeout';
}

/** Success check mark: one PNG per state colour (ic_check_24_<role>). */
var CHECK_ROLES = { on: true, off: true, lock: true, unlock: true, act: true };

/**
 * Row view-model. `ent` is the action feedback of that row: { phase: null|'pending'|'ok'|'fail',
 * to, err }. Only the touched row changes (design rule "retour d'action sur la ligne").
 */
export function rowView(card, ent) {
    var look = stateLook(card);
    var phase = ent ? ent.phase : null;
    var v = {
        icon: look.icon,
        iconColor: look.iconColor,
        textKey: look.textKey,
        text: look.text,
        stateColor: look.stateColor,
        check: null
    };
    if (phase === 'pending') {
        v.icon = 'ic_pending_act';
        v.iconColor = 'act';
        v.textKey = pendingKey(card.d, ent.to);
        v.text = null;
        v.stateColor = 'act';
    } else if (phase === 'fail') {
        v.icon = 'ic_fail_err';
        v.iconColor = 'err';
        v.textKey = failKey(ent.err);
        v.text = null;
        v.stateColor = 'err';
    } else if (phase === 'ok' && !transientKey(card.d, card.s)) {
        // Success shows the new state + check; a device still moving (e.g. "locking") keeps its
        // "en cours" look without a check until a later refresh.
        if (card.d === 'scene') {
            v.textKey = 'st_scene_done';
            v.stateColor = 'act';
        }
        v.check = CHECK_ROLES[v.stateColor] ? 'ic_check_24_' + v.stateColor : null;
    }
    return v;
}

/**
 * Detail screen's single main button, in the colour of the state it leads to (design 4a/4b):
 * { key, color, border }, or null for a read-only sensor and for an entity that cannot be acted
 * on right now (unavailable, or moving). "Éteindre"/"Fermer" stay neutral.
 */
export function detailButton(card) {
    var d = card.d;
    var s = card.s;
    if (isBusy(card)) {
        return null;
    }
    if (d === 'light' || d === 'switch') {
        return s === 'on'
            ? { key: 'btn_turn_off', color: 'txt', border: 'off' }
            : { key: 'btn_turn_on', color: 'on', border: 'on' };
    }
    if (d === 'lock') {
        return s === 'locked'
            ? { key: 'btn_unlock', color: 'unlock', border: 'unlock' }
            : { key: 'btn_lock', color: 'lock', border: 'lock' };
    }
    if (d === 'cover') {
        return s === 'open'
            ? { key: 'btn_close', color: 'txt', border: 'off' }
            : { key: 'btn_open', color: 'on', border: 'on' };
    }
    if (d === 'scene') {
        return { key: 'btn_run', color: 'act', border: 'act' };
    }
    return null;
}

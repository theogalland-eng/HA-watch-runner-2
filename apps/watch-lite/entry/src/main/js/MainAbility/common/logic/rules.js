// Action rules of a favorite: what a tap does, where an action is heading, whether the entity can be
// acted on now. Split out of look.js so the app-level core (app.js bundle) carries these few rules
// without the looks and texts, which only the page needs (docs/platform-constraints.md § Page size).
// A card is the v2 compact shape { k, d, n, s }. Pure ES5, no @system import (unit-tested with Node).

var UNAVAILABLE = { unavailable: true, unknown: true };

/**
 * HA states where the device is moving between two states (HA usually reports `locking` right after
 * a lock call). Shown as "en cours" with the transition text; never as the end state.
 */
var TRANSIENT = {
    lock: { locking: 'pend_lock', unlocking: 'pend_unlock', opening: 'pend_unlock' },
    cover: { opening: 'pend_open', closing: 'pend_close' }
};

/** Domains with one action (a sensor is read-only). */
var ACTIONABLE = { light: true, 'switch': true, lock: true, cover: true, scene: true };

/** "En cours" text key of a moving state (e.g. lock "locking"), or null. */
export function transientKey(d, s) {
    var t = TRANSIENT[d];
    return t && t[s] ? t[s] : null;
}

/** HA reports no usable state. A scene is `unknown` until first activated: that one is fine. */
export function isDown(d, s) {
    return d === 'scene' ? s === 'unavailable' : !!UNAVAILABLE[s];
}

/** Whether the entity cannot be acted on right now (unavailable, or moving between states). */
export function isBusy(card) {
    return isDown(card.d, card.s) || transientKey(card.d, card.s) !== null;
}

/** Whether the detail screen offers its action button (look.js detailButton draws it). */
export function canAct(card) {
    return !!ACTIONABLE[card.d] && !isBusy(card);
}

/** State the action is heading to (drives the "en cours" text). */
export function targetOf(d, s) {
    if (d === 'light' || d === 'switch') {
        return s === 'on' ? 'off' : 'on';
    }
    if (d === 'lock') {
        return s === 'locked' ? 'unlocked' : 'locked';
    }
    if (d === 'cover') {
        return s === 'open' ? 'closed' : 'open';
    }
    return s;
}

/**
 * What a tap on a row does: 'detail' (read-only sensor), 'confirm' (unlocking always goes through
 * the confirmation screen), 'none' (unavailable entity) or 'run' (one tap = one action).
 */
export function tapAction(card) {
    if (card.d === 'sensor') {
        return 'detail';
    }
    if (isBusy(card)) {
        return 'none';
    }
    if (card.d === 'lock' && card.s === 'locked') {
        return 'confirm';
    }
    return 'run';
}

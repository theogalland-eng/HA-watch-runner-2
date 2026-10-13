// Watch side of the compact P2P protocol v2 (docs/p2p-protocol.md, ADR-0008). The code tables are
// the same as the companion's CardCodes.kt: a test parses both and the protocol doc and compares.
// Pure ES5, no RegExp, no @system import (unit-tested with Node).

export var VERSION = 2;

/** `d` code → HA domain. */
export var DOMAINS = { l: 'light', s: 'switch', k: 'lock', c: 'cover', e: 'scene', n: 'sensor' };

/** `s` code → HA state (every domain but sensor, whose `s` is its value). */
export var STATES = {
    '1': 'on', '0': 'off', L: 'locked', U: 'unlocked', x: 'unavailable', '?': 'unknown',
    g: 'locking', h: 'unlocking', j: 'jammed', o: 'open', f: 'closed'
};

var SENSOR = 'n';
var seq = 0;

/** A request id: ASCII, at most 16 characters (the companion drops anything else). */
export function newId(prefix, nowMs) {
    seq = (seq + 1) % 1296;
    return prefix + (nowMs % 2176782336).toString(36) + seq.toString(36);
}

export function encodeSync(id) {
    return JSON.stringify({ v: VERSION, id: id, type: 'SYNC_REQUEST' });
}

/** Act on slot `k` of favorites revision `fr`; `confirm` only after the unlock confirmation. */
export function encodeCall(id, k, fr, confirm) {
    var msg = { v: VERSION, id: id, type: 'CALL_SERVICE', k: k, fr: fr };
    if (confirm) {
        msg.act = 'confirm';
    }
    return JSON.stringify(msg);
}

/** A reply object, or null when it is not readable JSON with an id and a type. */
export function decodeReply(text) {
    var o;
    try {
        o = JSON.parse(text);
    } catch (e) {
        return null;
    }
    return o && typeof o === 'object' && typeof o.id === 'string' && typeof o.type === 'string' ? o : null;
}

/**
 * Card in the watch's shape { k, d: domain, n, s: state }. An unknown state code reads as
 * `unknown`; an unknown domain code becomes a read-only row ("Indisponible"); never a crash.
 * Returns null when the shape itself is wrong (store.normalizeCard then drops it).
 */
export function decodeCard(c) {
    if (!c || typeof c !== 'object' || typeof c.d !== 'string' || typeof c.s !== 'string') {
        return null;
    }
    var domain = DOMAINS[c.d];
    if (!domain) {
        return { k: c.k, d: 'sensor', n: c.n, s: 'unknown' };
    }
    return { k: c.k, d: domain, n: c.n, s: c.d === SENSOR ? c.s : (STATES[c.s] || 'unknown') };
}

export function decodeCards(list) {
    var out = [];
    for (var i = 0; list && i < list.length; i++) {
        var c = decodeCard(list[i]);
        if (c) {
            out.push(c);
        }
    }
    return out;
}

/** What an `ACK.code` means for the watch: resync, "délai dépassé", or "HA injoignable". */
export function kindOf(code) {
    return code === 'stale' || code === 'timeout' ? code : 'ha';
}

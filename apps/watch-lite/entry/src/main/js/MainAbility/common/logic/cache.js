// Last known favorites, kept on the watch so the list shows instantly at launch (design: "le cache
// d'abord"). Serialised compactly; stored with @system.file by the page/service layer (PR 3c),
// because @system.storage values must stay under 128 bytes. Pure ES5 (unit-tested with Node).
import { normalizeCards } from './store.js';
import { utf8Bytes } from './format.js';

export var CACHE_FORMAT = 2;
/** @system.file readText reads 4096 bytes by default: stay below. */
export var MAX_CACHE_BYTES = 4096;

/** Returns the cache text, or null if it would not fit (never truncates silently). */
export function serializeCache(state) {
    var rows = [];
    for (var i = 0; i < state.cards.length; i++) {
        var c = state.cards[i];
        rows.push([c.k, c.d, c.n, c.s]);
    }
    var text = JSON.stringify({ f: CACHE_FORMAT, fr: state.fr, t: state.lastSyncAt, c: rows });
    return utf8Bytes(text) <= MAX_CACHE_BYTES ? text : null;
}

/** Parses a cache text into { fr, syncedAt, cards }; null when absent, corrupt or from another format. */
export function parseCache(text) {
    if (typeof text !== 'string' || text.length === 0) {
        return null;
    }
    var o;
    try {
        o = JSON.parse(text);
    } catch (e) {
        return null;
    }
    if (!o || o.f !== CACHE_FORMAT || !o.c || typeof o.c.length !== 'number' || typeof o.t !== 'number') {
        return null;
    }
    var cards = [];
    for (var i = 0; i < o.c.length; i++) {
        var r = o.c[i];
        if (r && r.length === 4) {
            cards.push({ k: r[0], d: r[1], n: r[2], s: r[3] });
        }
    }
    return { fr: o.fr === undefined ? null : o.fr, syncedAt: o.t, cards: normalizeCards(cards) };
}

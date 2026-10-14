// Formatting helpers. Pure ES5 (JerryScript), no @system import: unit-tested with Node.

export var MINUTE_MS = 60000;

/**
 * Age of a timestamp as an i18n descriptor, like the design's "à l'instant / il y a 3 min /
 * il y a 2 h". Returns null when there is no timestamp. Recomputed on each render: no timer.
 */
export function agoParts(nowMs, thenMs) {
    if (!thenMs) {
        return null;
    }
    var minutes = Math.floor((nowMs - thenMs) / MINUTE_MS);
    if (minutes < 1) {
        return { key: 'ago_now', n: 0 };
    }
    if (minutes < 60) {
        return { key: 'ago_min', n: minutes };
    }
    return { key: 'ago_hour', n: Math.round(minutes / 60) };
}

/**
 * Replaces [name] placeholders: fill('il y a [n] min', { n: 3 }) → 'il y a 3 min'. Unknown ones
 * stay. Square brackets, because lite's $t consumes {name} itself; no RegExp (none on lite).
 */
export function fill(template, params) {
    var s = String(template);
    var out = '';
    var i = 0;
    while (i < s.length) {
        var open = s.indexOf('[', i);
        var close = open < 0 ? -1 : s.indexOf(']', open + 1);
        if (close < 0) {
            out += s.slice(i);
            break;
        }
        var name = s.slice(open + 1, close);
        out += s.slice(i, open) + (params && params[name] !== undefined ? String(params[name]) : s.slice(open, close + 1));
        i = close + 1;
    }
    return out;
}

/** Fallback truncation when CSS ellipsis is not available: keeps maxChars characters, "…" included. */
export function ellipsize(text, maxChars) {
    var s = String(text);
    if (s.length <= maxChars) {
        return s;
    }
    return s.slice(0, Math.max(0, maxChars - 1)) + '…';
}

// utf8Bytes lives in utf8.js (the cache in the app.js bundle needs it without the rest of this file).
export { utf8Bytes } from './utf8.js';

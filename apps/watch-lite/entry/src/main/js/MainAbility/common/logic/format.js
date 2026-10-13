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

/** Replaces {name} placeholders: fill('il y a {n} min', { n: 3 }) → 'il y a 3 min'. */
export function fill(template, params) {
    return String(template).replace(/\{(\w+)\}/g, function (all, name) {
        return params && params[name] !== undefined ? String(params[name]) : all;
    });
}

/** Fallback truncation when CSS ellipsis is not available: keeps maxChars characters, "…" included. */
export function ellipsize(text, maxChars) {
    var s = String(text);
    if (s.length <= maxChars) {
        return s;
    }
    return s.slice(0, Math.max(0, maxChars - 1)) + '…';
}

/** UTF-8 byte length of a string (no TextEncoder on lite). */
export function utf8Bytes(str) {
    var n = 0;
    for (var i = 0; i < str.length; i++) {
        var c = str.charCodeAt(i);
        if (c < 0x80) {
            n += 1;
        } else if (c < 0x800) {
            n += 2;
        } else if (c >= 0xd800 && c <= 0xdbff) {
            n += 4; // surrogate pair = one 4-byte code point
            i++;
        } else {
            n += 3;
        }
    }
    return n;
}

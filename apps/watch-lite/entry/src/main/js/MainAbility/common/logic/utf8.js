// UTF-8 byte length, alone so the cache (app.js bundle) does not carry format.js. Pure ES5.

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

package io.github.theogallandeng.hawatch.companion.core.protocol

/**
 * The v2 one-letter codes and size limits of a [Card]. The tables are also in
 * `docs/p2p-protocol.md` (§ Codes) and in the lite watch's `common/logic/protocol.js`; tests check
 * that they stay identical. Limits are counted in **JSON bytes** (UTF-8 after escaping), so a card
 * can never push a message past the 900-byte budget, whatever the names contain.
 */
object CardCodes {

    /** HA domain → `d`. The companion maps light, switch and lock; the others are reserved. */
    val DOMAINS: Map<String, String> = linkedMapOf(
        "light" to "l", "switch" to "s", "lock" to "k", "cover" to "c", "scene" to "e", "sensor" to "n",
    )

    /** HA state → `s`, for every domain but sensor (whose `s` is its short value). */
    val STATES: Map<String, String> = linkedMapOf(
        "on" to "1", "off" to "0", "locked" to "L", "unlocked" to "U", "unavailable" to "x", "unknown" to "?",
        "locking" to "g", "unlocking" to "h", "jammed" to "j", "open" to "o", "closed" to "f",
    )

    const val UNKNOWN_STATE = "?"
    const val SENSOR = "n"
    const val MAX_NAME_CHARS = 20
    const val MAX_NAME_BYTES = 40
    const val MAX_SENSOR_CHARS = 12
    const val MAX_SENSOR_BYTES = 12

    /** Card for slot [k]; null when the domain has no code. */
    fun card(k: Int, domain: String, name: String, state: String): Card? {
        val d = DOMAINS[domain] ?: return null
        val s = if (d == SENSOR) limit(state, MAX_SENSOR_CHARS, MAX_SENSOR_BYTES) else stateCode(domain, state)
        return Card(k, d, limit(name, MAX_NAME_CHARS, MAX_NAME_BYTES), s)
    }

    /** A lock's `open` reads as unlocked and `opening` as unlocking; anything unmapped is `?`. */
    fun stateCode(domain: String, state: String): String {
        val key = when {
            domain == "lock" && state == "open" -> "unlocked"
            domain == "lock" && state == "opening" -> "unlocking"
            else -> state
        }
        return STATES[key] ?: UNKNOWN_STATE
    }

    /**
     * Typographic quotes ’ ‘ become ' (the lite watch font draws them full width), control
     * characters are dropped, then the text is cut on a code-point boundary to [maxChars] characters
     * and [maxBytes] JSON bytes.
     */
    fun limit(text: String, maxChars: Int, maxBytes: Int): String {
        val out = StringBuilder()
        var chars = 0
        var bytes = 0
        var i = 0
        while (i < text.length && chars < maxChars) {
            var cp = text.codePointAt(i)
            i += Character.charCount(cp)
            if (cp == 0x2019 || cp == 0x2018) cp = '\''.code
            if (cp < 0x20 || cp == 0x7F) continue
            val size = jsonBytes(cp)
            if (bytes + size > maxBytes) break
            out.appendCodePoint(cp)
            chars++
            bytes += size
        }
        return out.toString()
    }

    /** Bytes of one code point in a JSON string: `"` and `\` are escaped, the rest is UTF-8. */
    private fun jsonBytes(cp: Int): Int = when {
        cp == '"'.code || cp == '\\'.code -> 2
        cp < 0x80 -> 1
        cp < 0x800 -> 2
        cp < 0x10000 -> 3
        else -> 4
    }

    /**
     * Favorites revision `fr`: FNV-1a 32-bit hash of the ordered entity ids, on 31 bits. Stateless
     * (the same list gives the same `fr`, even after a reinstall); a different list or order gives a
     * different `fr` except with probability about 2⁻³¹.
     */
    fun favoritesRevision(favorites: List<String>): Long {
        var h = 0x811C9DC5L
        for (b in favorites.joinToString("\n").toByteArray(Charsets.UTF_8)) {
            h = h xor (b.toLong() and 0xFF)
            h = (h * 0x01000193L) and 0xFFFFFFFFL
        }
        return h and 0x7FFFFFFFL
    }
}

package io.github.theogallandeng.hawatch.companion.core.config

import okhttp3.HttpUrl.Companion.toHttpUrlOrNull

/** Validation/normalization of what the user types in the settings screen. Pure, unit-tested. */
object HaInput {

    enum class UrlError { EMPTY, NOT_HTTPS, MALFORMED }

    sealed interface UrlResult {
        data class Valid(val url: String) : UrlResult
        data class Invalid(val error: UrlError) : UrlResult
    }

    /**
     * HTTPS only (the token must never travel in clear text). A missing scheme defaults to https.
     * Result has no trailing slash, query or fragment, e.g. `https://ha.example.org:8123`.
     */
    fun normalizeUrl(input: String): UrlResult {
        val trimmed = input.trim()
        if (trimmed.isEmpty()) return UrlResult.Invalid(UrlError.EMPTY)

        val lower = trimmed.lowercase()
        val withScheme = when {
            lower.startsWith("https://") -> trimmed
            lower.startsWith("http://") -> return UrlResult.Invalid(UrlError.NOT_HTTPS)
            "://" in trimmed -> return UrlResult.Invalid(UrlError.MALFORMED)
            else -> "https://$trimmed"
        }
        val url = withScheme.toHttpUrlOrNull() ?: return UrlResult.Invalid(UrlError.MALFORMED)
        if (url.query != null || url.fragment != null || url.username.isNotEmpty()) {
            return UrlResult.Invalid(UrlError.MALFORMED)
        }
        val path = url.encodedPath.trimEnd('/')
        val port = if (url.port == 443) "" else ":${url.port}"
        val host = if (':' in url.host) "[${url.host}]" else url.host // IPv6 literal
        return UrlResult.Valid("https://$host$port$path")
    }

    /** Trims and drops a pasted `Bearer ` prefix. Returns null if nothing usable remains. */
    fun normalizeToken(input: String): String? {
        val t = input.trim().removePrefix("Bearer ").removePrefix("bearer ").trim()
        return t.takeIf { it.isNotEmpty() && it.none(Char::isWhitespace) }
    }
}

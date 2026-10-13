package io.github.theogallandeng.hawatch.companion.core.config

/** What the bridge needs to answer the watch. Read fresh for every request (settings may change). */
class CompanionSettings(
    val baseUrl: String,
    val token: String,
    /** Ordered entity ids; the watch shows them in this order. At most [MAX_FAVORITES]. */
    val favorites: List<String>,
) {
    // Never print the token (logs, crash reports, debugger summaries).
    override fun toString(): String = "CompanionSettings(baseUrl=<set>, token=<redacted>, favorites=${favorites.size})"

    companion object {
        /** Keeps the watch list short and every SYNC_RESPONSE small. */
        const val MAX_FAVORITES = 10
    }
}

/** Source of [CompanionSettings]; returns null while the companion is not configured. */
fun interface CompanionConfig {
    fun current(): CompanionSettings?
}

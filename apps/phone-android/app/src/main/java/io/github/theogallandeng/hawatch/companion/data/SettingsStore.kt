package io.github.theogallandeng.hawatch.companion.data

import android.content.Context
import io.github.theogallandeng.hawatch.companion.core.config.CompanionSettings

/** Non-secret settings. The token lives in [SecureTokenStore]. */
class SettingsStore(context: Context) {

    private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /** Normalized HTTPS base URL (see `HaInput.normalizeUrl`), or null if not set. */
    var baseUrl: String?
        get() = prefs.getString(KEY_URL, null)
        set(value) = prefs.edit().putString(KEY_URL, value).apply()

    /** Ordered favorite entity ids (watch display order), capped at [CompanionSettings.MAX_FAVORITES]. */
    var favorites: List<String>
        get() = prefs.getString(KEY_FAVORITES, null)?.split(SEPARATOR)?.filter { it.isNotBlank() }.orEmpty()
        set(value) = prefs.edit()
            .putString(KEY_FAVORITES, value.distinct().take(CompanionSettings.MAX_FAVORITES).joinToString(SEPARATOR))
            .apply()

    var serviceEnabled: Boolean
        get() = prefs.getBoolean(KEY_SERVICE_ENABLED, true)
        set(value) = prefs.edit().putBoolean(KEY_SERVICE_ENABLED, value).apply()

    private companion object {
        const val PREFS = "settings"
        const val KEY_URL = "base_url"
        const val KEY_FAVORITES = "favorites"
        const val KEY_SERVICE_ENABLED = "service_enabled"
        const val SEPARATOR = "\n"
    }
}

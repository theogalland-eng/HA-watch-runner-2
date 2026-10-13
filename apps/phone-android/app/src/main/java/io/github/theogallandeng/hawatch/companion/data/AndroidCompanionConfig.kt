package io.github.theogallandeng.hawatch.companion.data

import io.github.theogallandeng.hawatch.companion.core.config.CompanionConfig
import io.github.theogallandeng.hawatch.companion.core.config.CompanionSettings

/** Reads settings + token fresh on each watch request, so changes apply without restarting anything. */
class AndroidCompanionConfig(
    private val settings: SettingsStore,
    private val tokens: SecureTokenStore,
) : CompanionConfig {

    fun isConfigured(): Boolean = settings.baseUrl != null && tokens.hasToken()

    override fun current(): CompanionSettings? {
        val url = settings.baseUrl ?: return null
        val token = tokens.read() ?: return null
        return CompanionSettings(url, token, settings.favorites)
    }
}

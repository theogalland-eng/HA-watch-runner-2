package io.github.theogallandeng.hawatch.companion.ui

import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import io.github.theogallandeng.hawatch.companion.R
import io.github.theogallandeng.hawatch.companion.core.config.HaInput
import io.github.theogallandeng.hawatch.companion.core.ha.HaException

/** A string resource + its arguments, resolved in the UI (keeps ViewModels free of Context strings). */
data class UiText(@StringRes val id: Int, val args: List<Any> = emptyList()) {
    @Composable
    fun resolve(): String = stringResource(id, *args.toTypedArray())
}

fun HaException.toUiText(): UiText = when (this) {
    is HaException.Unauthorized -> UiText(R.string.error_unauthorized, listOf(code))
    is HaException.NotFound -> UiText(R.string.error_not_found)
    is HaException.Http -> UiText(R.string.error_http, listOf(code))
    is HaException.Timeout -> UiText(R.string.error_timeout)
    is HaException.Unreachable -> UiText(R.string.error_unreachable)
    is HaException.BadResponse -> UiText(R.string.error_bad_response)
}

fun HaInput.UrlError.toUiText(): UiText = when (this) {
    HaInput.UrlError.EMPTY -> UiText(R.string.error_url_empty)
    HaInput.UrlError.NOT_HTTPS -> UiText(R.string.error_url_not_https)
    HaInput.UrlError.MALFORMED -> UiText(R.string.error_url_malformed)
}

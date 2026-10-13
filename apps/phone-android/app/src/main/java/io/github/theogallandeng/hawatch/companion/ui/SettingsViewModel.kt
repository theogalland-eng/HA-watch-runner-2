package io.github.theogallandeng.hawatch.companion.ui

import android.app.Activity
import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import io.github.theogallandeng.hawatch.companion.BuildConfig
import io.github.theogallandeng.hawatch.companion.R
import io.github.theogallandeng.hawatch.companion.appGraph
import io.github.theogallandeng.hawatch.companion.core.config.CompanionSettings
import io.github.theogallandeng.hawatch.companion.core.config.HaInput
import io.github.theogallandeng.hawatch.companion.core.ha.HaException
import io.github.theogallandeng.hawatch.companion.core.protocol.MsgType
import io.github.theogallandeng.hawatch.companion.core.protocol.ProtocolCodec
import io.github.theogallandeng.hawatch.companion.service.BridgeServiceController
import io.github.theogallandeng.hawatch.companion.wear.WearEngineStatus
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

sealed interface ActionState {
    data object Idle : ActionState
    data object Running : ActionState
    data class Done(val message: UiText, val success: Boolean) : ActionState
}

data class WatchStatus(
    val healthInstalled: Boolean = false,
    val permission: Boolean? = null,
    val watchName: String? = null,
    val errorCode: Int? = null,
)

data class SettingsUiState(
    val urlInput: String = "",
    /** Never pre-filled with the saved token: the saved token is never shown again. */
    val tokenInput: String = "",
    val tokenSaved: Boolean = false,
    val editingToken: Boolean = true,
    val saveResult: ActionState = ActionState.Idle,
    val connectionTest: ActionState = ActionState.Idle,
    val favorites: List<String> = emptyList(),
    val serviceEnabled: Boolean = true,
    val preview: ActionState = ActionState.Idle,
    val watch: WatchStatus = WatchStatus(),
    val peerFingerprintMissing: Boolean = false,
)

class SettingsViewModel(app: Application) : AndroidViewModel(app) {

    private val graph = app.appGraph
    private val _state = MutableStateFlow(loadState())
    val state: StateFlow<SettingsUiState> = _state.asStateFlow()

    private fun loadState(): SettingsUiState {
        val tokenSaved = graph.tokens.hasToken()
        return SettingsUiState(
            urlInput = graph.settings.baseUrl.orEmpty(),
            tokenSaved = tokenSaved,
            editingToken = !tokenSaved,
            favorites = graph.settings.favorites,
            serviceEnabled = graph.settings.serviceEnabled,
            peerFingerprintMissing = BuildConfig.WATCH_PEER_FINGERPRINT.isBlank() ||
                BuildConfig.WATCH_PEER_FINGERPRINT.startsWith("PUT_"),
        )
    }

    /** Called when the screen (re)appears: reload stored values and run the one-shot watch checks. */
    fun onResume() {
        _state.update { it.copy(favorites = graph.settings.favorites, serviceEnabled = graph.settings.serviceEnabled) }
        BridgeServiceController.sync(getApplication())
        refreshWatchStatus()
    }

    fun onUrlChange(value: String) = _state.update { it.copy(urlInput = value, saveResult = ActionState.Idle) }

    fun onTokenChange(value: String) = _state.update { it.copy(tokenInput = value, saveResult = ActionState.Idle) }

    fun onEditToken(editing: Boolean) = _state.update { it.copy(editingToken = editing, tokenInput = "") }

    fun save() {
        val s = _state.value
        val url = when (val r = HaInput.normalizeUrl(s.urlInput)) {
            is HaInput.UrlResult.Valid -> r.url
            is HaInput.UrlResult.Invalid -> return fail(r.error.toUiText())
        }
        val newToken = if (s.editingToken) {
            HaInput.normalizeToken(s.tokenInput) ?: return fail(UiText(R.string.error_token_invalid))
        } else {
            null
        }
        graph.settings.baseUrl = url
        newToken?.let { graph.tokens.save(it) }
        _state.update {
            it.copy(
                urlInput = url,
                tokenInput = "",
                tokenSaved = graph.tokens.hasToken(),
                editingToken = false,
                saveResult = ActionState.Done(UiText(R.string.saved), success = true),
            )
        }
        BridgeServiceController.sync(getApplication())
    }

    private fun fail(message: UiText) = _state.update { it.copy(saveResult = ActionState.Done(message, success = false)) }

    /** `GET /api/` with the saved URL + token. */
    fun testConnection() {
        val settings = graph.config.current()
        if (settings == null) {
            _state.update { it.copy(connectionTest = ActionState.Done(UiText(R.string.error_not_configured), false)) }
            return
        }
        _state.update { it.copy(connectionTest = ActionState.Running) }
        viewModelScope.launch {
            val result = try {
                graph.haClientFactory.create(settings.baseUrl, settings.token).checkApi()
                ActionState.Done(UiText(R.string.test_ok), success = true)
            } catch (e: HaException) {
                ActionState.Done(e.toUiText(), success = false)
            }
            _state.update { it.copy(connectionTest = result) }
        }
    }

    fun setServiceEnabled(enabled: Boolean) {
        graph.settings.serviceEnabled = enabled
        _state.update { it.copy(serviceEnabled = enabled) }
        BridgeServiceController.sync(getApplication())
    }

    /** Runs exactly what the watch would trigger (a SYNC_REQUEST), locally, and reports the reply size. */
    fun previewSync() {
        _state.update { it.copy(preview = ActionState.Running) }
        viewModelScope.launch {
            val reply = graph.newRequestHandler().handle("""{"v":1,"id":"preview","type":"${MsgType.SYNC_REQUEST}"}""")
            val obj = reply?.let { ProtocolCodec.json.parseToJsonElement(it) as? JsonObject }
            val type = (obj?.get("type") as? JsonPrimitive)?.content
            val result = if (type == MsgType.SYNC_RESPONSE) {
                val count = (obj?.get("cards") as? JsonArray)?.size ?: 0
                val bytes = reply.orEmpty().toByteArray(Charsets.UTF_8).size
                ActionState.Done(UiText(R.string.preview_result, listOf(count, bytes)), success = true)
            } else {
                val error = (obj?.get("error") as? JsonPrimitive)?.content ?: "?"
                ActionState.Done(UiText(R.string.error_watch_reply, listOf(error)), success = false)
            }
            _state.update { it.copy(preview = result) }
        }
    }

    fun refreshWatchStatus() {
        val context = getApplication<Application>()
        if (!WearEngineStatus.isHealthInstalled(context)) {
            _state.update { it.copy(watch = WatchStatus(healthInstalled = false)) }
            return
        }
        viewModelScope.launch {
            var status = WatchStatus(healthInstalled = true)
            when (val p = WearEngineStatus.hasDevicePermission(context)) {
                is WearEngineStatus.Result.Ok -> status = status.copy(permission = p.value)
                is WearEngineStatus.Result.Failed -> status = status.copy(errorCode = p.code)
            }
            if (status.permission == true) {
                when (val d = WearEngineStatus.connectedWatchName(context)) {
                    is WearEngineStatus.Result.Ok -> status = status.copy(watchName = d.value)
                    is WearEngineStatus.Result.Failed -> status = status.copy(errorCode = d.code)
                }
            }
            _state.update { it.copy(watch = status) }
        }
    }

    fun requestWearPermission(activity: Activity) {
        WearEngineStatus.requestDevicePermission(activity) {
            refreshWatchStatus()
            BridgeServiceController.sync(getApplication()) // re-registers receivers if already running
        }
    }

    companion object {
        const val MAX_FAVORITES = CompanionSettings.MAX_FAVORITES
    }
}

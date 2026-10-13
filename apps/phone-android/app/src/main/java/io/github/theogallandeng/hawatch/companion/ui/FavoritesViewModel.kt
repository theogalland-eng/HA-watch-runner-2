package io.github.theogallandeng.hawatch.companion.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import io.github.theogallandeng.hawatch.companion.R
import io.github.theogallandeng.hawatch.companion.appGraph
import io.github.theogallandeng.hawatch.companion.core.config.CompanionSettings
import io.github.theogallandeng.hawatch.companion.core.ha.HaException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class EntityItem(val entityId: String, val name: String, val state: String, val missing: Boolean = false)

data class FavoritesUiState(
    val loading: Boolean = false,
    val error: UiText? = null,
    val entities: List<EntityItem> = emptyList(),
    /** Ordered: the watch shows favorites in this order. */
    val selected: List<String> = emptyList(),
    val query: String = "",
    val limitReached: Boolean = false,
) {
    val visible: List<EntityItem>
        get() = if (query.isBlank()) entities
        else entities.filter { it.name.contains(query, ignoreCase = true) || it.entityId.contains(query, ignoreCase = true) }
}

/** Favorites picker. The only place that fetches the full `/api/states` list, once, when opened. */
class FavoritesViewModel(app: Application) : AndroidViewModel(app) {

    private val graph = app.appGraph
    private val _state = MutableStateFlow(FavoritesUiState(selected = graph.settings.favorites))
    val state: StateFlow<FavoritesUiState> = _state.asStateFlow()

    /** Called each time the picker opens (user action), never in the background. */
    fun load() {
        val settings = graph.config.current()
        if (settings == null) {
            _state.update { it.copy(error = UiText(R.string.error_not_configured)) }
            return
        }
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            try {
                val supported = graph.haClientFactory.create(settings.baseUrl, settings.token).getStates()
                    .filter { graph.mapper.isSupported(it.entityId) }
                    .map { EntityItem(it.entityId, it.friendlyName ?: it.entityId, it.state) }
                    .sortedWith(compareBy({ it.entityId.substringBefore('.') }, { it.name.lowercase() }))
                val known = supported.map { it.entityId }.toSet()
                // Keep removable entries for favorites that disappeared from HA.
                val missing = _state.value.selected.filter { it !in known }
                    .map { EntityItem(it, it, "", missing = true) }
                _state.update { it.copy(loading = false, entities = missing + supported) }
            } catch (e: HaException) {
                _state.update { it.copy(loading = false, error = e.toUiText()) }
            }
        }
    }

    fun onQueryChange(query: String) = _state.update { it.copy(query = query) }

    fun toggle(entityId: String) {
        val current = _state.value.selected
        val next = when {
            entityId in current -> current - entityId
            current.size >= CompanionSettings.MAX_FAVORITES -> {
                _state.update { it.copy(limitReached = true) }
                return
            }
            else -> current + entityId
        }
        graph.settings.favorites = next
        _state.update { it.copy(selected = next, limitReached = false) }
    }
}

package io.github.theogallandeng.hawatch.companion.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import io.github.theogallandeng.hawatch.companion.R
import io.github.theogallandeng.hawatch.companion.core.config.CompanionSettings

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FavoritesScreen(viewModel: FavoritesViewModel, onBack: () -> Unit) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { viewModel.load() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.favorites_title)) },
                navigationIcon = { TextButton(onClick = onBack) { Text(stringResource(R.string.action_back)) } },
            )
        },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(stringResource(R.string.favorites_count, state.selected.size, CompanionSettings.MAX_FAVORITES))
            if (state.limitReached) {
                Text(
                    stringResource(R.string.favorites_limit, CompanionSettings.MAX_FAVORITES),
                    color = MaterialTheme.colorScheme.error,
                )
            }
            OutlinedTextField(
                value = state.query,
                onValueChange = viewModel::onQueryChange,
                label = { Text(stringResource(R.string.favorites_search)) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            when {
                state.loading -> Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        CircularProgressIndicator()
                        Text(stringResource(R.string.favorites_loading))
                    }
                }
                state.error != null -> Column {
                    Text(state.error!!.resolve(), color = MaterialTheme.colorScheme.error)
                    Button(onClick = viewModel::load) { Text(stringResource(R.string.action_retry)) }
                }
                state.entities.isEmpty() -> Text(stringResource(R.string.favorites_empty))
                else -> LazyColumn(Modifier.fillMaxSize()) {
                    items(state.visible, key = { it.entityId }) { item ->
                        val position = state.selected.indexOf(item.entityId)
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .clickable { viewModel.toggle(item.entityId) }
                                .padding(vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Checkbox(checked = position >= 0, onCheckedChange = { viewModel.toggle(item.entityId) })
                            Column(Modifier.weight(1f)) {
                                Text(if (position >= 0) "${position + 1}. ${item.name}" else item.name)
                                Text(
                                    if (item.missing) stringResource(R.string.favorites_missing) else "${item.entityId} · ${item.state}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = if (item.missing) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

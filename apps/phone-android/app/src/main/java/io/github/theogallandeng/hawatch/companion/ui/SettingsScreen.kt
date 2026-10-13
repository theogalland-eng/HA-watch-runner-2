package io.github.theogallandeng.hawatch.companion.ui

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import io.github.theogallandeng.hawatch.companion.R
import io.github.theogallandeng.hawatch.companion.wear.WearEngineStatus

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(viewModel: SettingsViewModel, onOpenFavorites: () -> Unit) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    var notificationsGranted by remember { mutableStateOf(notificationsGranted(context)) }
    val notificationLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        notificationsGranted = it
    }

    LifecycleResumeEffect(Unit) {
        viewModel.onResume()
        notificationsGranted = notificationsGranted(context)
        onPauseOrDispose { }
    }

    Scaffold(topBar = { TopAppBar(title = { Text(stringResource(R.string.app_name)) }) }) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            HomeAssistantSection(state, viewModel)
            FavoritesSection(state, onOpenFavorites)
            WatchSection(
                state = state,
                viewModel = viewModel,
                notificationsGranted = notificationsGranted,
                onRequestNotifications = {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        notificationLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                    }
                },
            )
            HyperOsSection()
        }
    }
}

@Composable
private fun HomeAssistantSection(state: SettingsUiState, viewModel: SettingsViewModel) {
    Section(stringResource(R.string.section_ha)) {
        OutlinedTextField(
            value = state.urlInput,
            onValueChange = viewModel::onUrlChange,
            label = { Text(stringResource(R.string.field_url)) },
            placeholder = { Text(stringResource(R.string.field_url_hint)) },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
            modifier = Modifier.fillMaxWidth(),
        )
        if (state.editingToken) {
            OutlinedTextField(
                value = state.tokenInput,
                onValueChange = viewModel::onTokenChange,
                label = { Text(stringResource(R.string.field_token)) },
                singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, autoCorrectEnabled = false),
                modifier = Modifier.fillMaxWidth(),
            )
            if (state.tokenSaved) {
                TextButton(onClick = { viewModel.onEditToken(false) }) { Text(stringResource(R.string.action_cancel)) }
            }
        } else {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    stringResource(if (state.tokenSaved) R.string.token_saved else R.string.token_missing),
                    modifier = Modifier.weight(1f),
                )
                TextButton(onClick = { viewModel.onEditToken(true) }) { Text(stringResource(R.string.action_replace_token)) }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = viewModel::save) { Text(stringResource(R.string.action_save)) }
            OutlinedButton(
                onClick = viewModel::testConnection,
                enabled = state.connectionTest != ActionState.Running,
            ) { Text(stringResource(R.string.action_test_connection)) }
        }
        ActionResult(state.saveResult)
        ActionResult(state.connectionTest, running = R.string.test_running)
    }
}

@Composable
private fun FavoritesSection(state: SettingsUiState, onOpenFavorites: () -> Unit) {
    Section(stringResource(R.string.section_favorites)) {
        Text(stringResource(R.string.favorites_hint), style = MaterialTheme.typography.bodySmall)
        if (state.favorites.isEmpty()) {
            Text(stringResource(R.string.favorites_none))
        } else {
            Text(stringResource(R.string.favorites_count, state.favorites.size, SettingsViewModel.MAX_FAVORITES))
            state.favorites.forEachIndexed { i, id ->
                Text("${i + 1}. $id", style = MaterialTheme.typography.bodyMedium)
            }
        }
        Button(onClick = onOpenFavorites) { Text(stringResource(R.string.action_choose_favorites)) }
    }
}

@Composable
private fun WatchSection(
    state: SettingsUiState,
    viewModel: SettingsViewModel,
    notificationsGranted: Boolean,
    onRequestNotifications: () -> Unit,
) {
    val context = LocalContext.current
    Section(stringResource(R.string.section_watch)) {
        val watch = state.watch
        Text(stringResource(if (watch.healthInstalled) R.string.health_ok else R.string.health_missing))
        if (watch.healthInstalled) {
            when (watch.permission) {
                true -> Text(stringResource(R.string.wear_permission_granted))
                false -> Text(stringResource(R.string.wear_permission_missing))
                null -> watch.errorCode?.let { Text(stringResource(R.string.wear_unavailable, it)) }
            }
            if (watch.permission != true) {
                Button(onClick = { (context as? Activity)?.let(viewModel::requestWearPermission) }) {
                    Text(stringResource(R.string.action_grant_wear))
                }
            } else {
                Text(watch.watchName?.let { stringResource(R.string.watch_connected, it) } ?: stringResource(R.string.watch_none))
            }
        }
        if (state.peerFingerprintMissing) {
            Text(
                stringResource(R.string.peer_fingerprint_missing),
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
            )
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(stringResource(R.string.service_switch))
                Text(stringResource(R.string.service_switch_desc), style = MaterialTheme.typography.bodySmall)
            }
            Switch(checked = state.serviceEnabled, onCheckedChange = viewModel::setServiceEnabled)
        }
        if (!notificationsGranted) {
            OutlinedButton(onClick = onRequestNotifications) { Text(stringResource(R.string.action_allow_notifications)) }
        }
        OutlinedButton(onClick = viewModel::previewSync, enabled = state.preview != ActionState.Running) {
            Text(stringResource(R.string.action_preview_sync))
        }
        ActionResult(state.preview)
    }
}

@Composable
private fun HyperOsSection() {
    val context = LocalContext.current
    Section(stringResource(R.string.section_hyperos)) {
        Text(stringResource(R.string.hyperos_steps), style = MaterialTheme.typography.bodyMedium)
        OutlinedButton(onClick = { openAppDetails(context, context.packageName) }) {
            Text(stringResource(R.string.action_open_app_settings))
        }
        OutlinedButton(onClick = { openAppDetails(context, WearEngineStatus.HEALTH_PACKAGE) }) {
            Text(stringResource(R.string.action_open_health_settings))
        }
    }
}

@Composable
private fun Section(title: String, content: @Composable () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            content()
        }
    }
}

@Composable
private fun ActionResult(state: ActionState, running: Int? = null) {
    when (state) {
        ActionState.Idle -> Unit
        ActionState.Running -> Row(verticalAlignment = Alignment.CenterVertically) {
            CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
            if (running != null) {
                Spacer(Modifier.width(8.dp))
                Text(stringResource(running))
            }
        }
        is ActionState.Done -> Text(
            state.message.resolve(),
            color = if (state.success) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,
        )
    }
}

private fun notificationsGranted(context: Context): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
        ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

private fun openAppDetails(context: Context, packageName: String) {
    val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", packageName, null))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    try {
        context.startActivity(intent)
    } catch (e: android.content.ActivityNotFoundException) {
        // Settings app missing the screen: nothing sensible to do.
    }
}

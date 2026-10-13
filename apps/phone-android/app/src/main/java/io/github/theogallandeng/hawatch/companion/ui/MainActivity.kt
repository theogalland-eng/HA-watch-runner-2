package io.github.theogallandeng.hawatch.companion.ui

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.lifecycle.viewmodel.compose.viewModel

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            CompanionTheme {
                // Two screens: no navigation library needed.
                var showFavorites by rememberSaveable { mutableStateOf(false) }
                val settingsViewModel: SettingsViewModel = viewModel()
                if (showFavorites) {
                    BackHandler { showFavorites = false }
                    FavoritesScreen(viewModel = viewModel(), onBack = {
                        showFavorites = false
                        settingsViewModel.onResume()
                    })
                } else {
                    SettingsScreen(viewModel = settingsViewModel, onOpenFavorites = { showFavorites = true })
                }
            }
        }
    }
}

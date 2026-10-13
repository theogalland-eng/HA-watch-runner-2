package io.github.theogallandeng.hawatch.companion.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Restarts the bridge after a reboot or an app update, if enabled and configured.
 * (`connectedDevice` services may still be started from BOOT_COMPLETED on Android 15.)
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED -> BridgeServiceController.sync(context)
        }
    }
}

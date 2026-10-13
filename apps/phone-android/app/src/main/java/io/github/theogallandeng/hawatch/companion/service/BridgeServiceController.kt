package io.github.theogallandeng.hawatch.companion.service

import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat
import io.github.theogallandeng.hawatch.companion.appGraph

/** Starts or stops [WatchBridgeService] to match the settings (enabled + configured). */
object BridgeServiceController {

    fun shouldRun(context: Context): Boolean {
        val graph = context.appGraph
        return graph.settings.serviceEnabled && graph.config.isConfigured()
    }

    /** Call from the foreground (activity, boot): starting a foreground service from the background is restricted. */
    fun sync(context: Context) {
        if (shouldRun(context)) start(context) else stop(context)
    }

    private fun start(context: Context) {
        try {
            ContextCompat.startForegroundService(context, Intent(context, WatchBridgeService::class.java))
        } catch (e: IllegalStateException) { // ForegroundServiceStartNotAllowedException (API 31+) extends it
            context.appGraph.logger.log("service start refused: ${e.javaClass.simpleName}")
        }
    }

    private fun stop(context: Context) {
        context.stopService(Intent(context, WatchBridgeService::class.java))
    }
}

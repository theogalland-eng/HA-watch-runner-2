package io.github.theogallandeng.hawatch.companion.service

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import io.github.theogallandeng.hawatch.companion.BuildConfig
import io.github.theogallandeng.hawatch.companion.R
import io.github.theogallandeng.hawatch.companion.appGraph
import io.github.theogallandeng.hawatch.companion.core.bridge.CompanionBridge
import io.github.theogallandeng.hawatch.companion.ui.MainActivity
import io.github.theogallandeng.hawatch.companion.wear.WearEngineTransport
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel

/**
 * Keeps the Wear Engine receiver alive so the watch can reach the phone (HyperOS kills background
 * apps, and Wear Engine requires the phone app to be running).
 *
 * Battery contract: while idle this does **nothing** — no wakelock, no timer, no network. Work only
 * happens when a watch message arrives (one HA REST call per request, then idle again).
 */
class WatchBridgeService : Service() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var transport: WearEngineTransport? = null
    private var bridge: CompanionBridge? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (!enterForeground()) {
            stopSelf()
            return START_NOT_STICKY
        }
        val existing = transport
        if (existing != null) {
            existing.refresh() // e.g. the user just granted the Wear Engine permission
        } else {
            val graph = appGraph
            try {
                val t = WearEngineTransport(this, BuildConfig.WATCH_PEER_PKG, BuildConfig.WATCH_PEER_FINGERPRINT, graph.logger)
                val b = CompanionBridge(t, graph.newRequestHandler(), scope, graph.logger)
                b.start()
                transport = t
                bridge = b
            } catch (e: RuntimeException) { // Wear Engine throws if Huawei Health is missing
                graph.logger.log("bridge start failed: ${e.javaClass.simpleName}")
                stopSelf() // nothing to wait for; the settings screen retries when reopened
                return START_NOT_STICKY
            }
        }
        return START_STICKY
    }

    override fun onDestroy() {
        bridge?.stop()
        bridge = null
        transport = null
        scope.cancel()
        super.onDestroy()
    }

    private fun enterForeground(): Boolean {
        val manager = getSystemService(NotificationManager::class.java)
        val channel = NotificationChannel(CHANNEL_ID, getString(R.string.notif_channel_name), NotificationManager.IMPORTANCE_MIN)
        channel.description = getString(R.string.notif_channel_desc)
        channel.setShowBadge(false)
        manager.createNotificationChannel(channel)
        val openApp = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_bridge)
            .setContentTitle(getString(R.string.app_name))
            .setContentText(getString(R.string.notif_text))
            .setContentIntent(openApp)
            .setOngoing(true)
            .setSilent(true)
            .setShowWhen(false)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build()
        return try {
            val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE else 0
            ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, type)
            true
        } catch (e: RuntimeException) { // start not allowed from background / missing FGS prerequisite
            appGraph.logger.log("startForeground refused: ${e.javaClass.simpleName}")
            false
        }
    }

    private companion object {
        const val CHANNEL_ID = "watch_bridge"
        const val NOTIFICATION_ID = 1
    }
}

package io.github.theogallandeng.hawatch.companion.wear

import android.content.Context
import com.huawei.wearengine.HiWear
import com.huawei.wearengine.client.ServiceConnectionListener
import com.huawei.wearengine.client.WearEngineClient
import com.huawei.wearengine.common.WearEngineErrorCode
import com.huawei.wearengine.device.Device
import com.huawei.wearengine.p2p.Message
import com.huawei.wearengine.p2p.P2pClient
import com.huawei.wearengine.p2p.Receiver
import com.huawei.wearengine.p2p.SendCallback
import io.github.theogallandeng.hawatch.companion.core.bridge.CompanionLogger
import io.github.theogallandeng.hawatch.companion.core.bridge.IncomingMessage
import io.github.theogallandeng.hawatch.companion.core.bridge.WatchMessageListener
import io.github.theogallandeng.hawatch.companion.core.bridge.WatchPeer
import io.github.theogallandeng.hawatch.companion.core.bridge.WatchTransport
import java.io.IOException
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull

/**
 * Real [WatchTransport] over Huawei Wear Engine P2P (the phone side of `@kit.WearEngine` /
 * the lite watch's `P2pClient`). The Huawei Health app relays the messages over Bluetooth.
 *
 * Battery: this only registers receivers with Huawei Health (an IPC registration). There is no
 * polling and no timer; registration is refreshed only on Health (re)connection or when the app
 * explicitly asks ([refresh], e.g. when the settings screen is opened).
 *
 * Needs the user to have granted `Permission.DEVICE_MANAGER` (settings screen) and a real watch
 * app identity ([peerPkgName] + [peerFingerprint]) matching what is installed on the watch.
 */
class WearEngineTransport(
    context: Context,
    peerPkgName: String,
    peerFingerprint: String,
    private val logger: CompanionLogger,
) : WatchTransport {

    private val appContext = context.applicationContext
    private val p2p: P2pClient = HiWear.getP2pClient(appContext)
        .setPeerPkgName(peerPkgName)
        .setPeerFingerPrint(peerFingerprint)

    @Volatile
    private var listener: WatchMessageListener? = null
    private var wearEngineClient: WearEngineClient? = null

    /** Device UUID → receiver registered for it. */
    private val receivers = ConcurrentHashMap<String, Receiver>()

    private class WearPeer(val device: Device) : WatchPeer

    override fun start(listener: WatchMessageListener) {
        this.listener = listener
        val client = HiWear.getWearEngineClient(appContext, object : ServiceConnectionListener {
            override fun onServiceConnect() {
                logger.log("wear engine connected")
                refresh()
            }

            override fun onServiceDisconnect() {
                // Huawei Health went away: its registrations are gone with it. Re-register on reconnect.
                logger.log("wear engine disconnected")
                receivers.clear()
            }
        })
        wearEngineClient = client
        client.registerServiceConnectionListener()
            .addOnFailureListener { logger.log("service listener failed: ${wearErrorCode(it)}") }
        refresh()
    }

    /**
     * (Re)registers a receiver for every bonded watch that does not have one yet. Bonded rather than
     * connected only, so that a watch which is out of range right now is still covered when it comes back.
     */
    fun refresh() {
        if (listener == null) return
        HiWear.getDeviceClient(appContext).bondedDevices
            .addOnSuccessListener { devices ->
                devices.orEmpty().forEach { register(it) }
                logger.log("bonded devices: ${devices?.size ?: 0}, receivers: ${receivers.size}")
            }
            .addOnFailureListener { logger.log("bonded devices failed: ${wearErrorCode(it)}") }
    }

    private fun register(device: Device) {
        val uuid = device.uuid ?: return
        if (receivers.containsKey(uuid)) return
        val receiver = Receiver { message -> onMessage(device, message) }
        receivers[uuid] = receiver
        p2p.registerReceiver(device, receiver)
            .addOnSuccessListener { logger.log("receiver registered") }
            .addOnFailureListener {
                receivers.remove(uuid)
                logger.log("receiver registration failed: ${wearErrorCode(it)}")
            }
    }

    private fun onMessage(device: Device, message: Message?) {
        val data = message?.data ?: return
        if (data.isEmpty() || data.size > MAX_INCOMING_BYTES) {
            logger.log("ignored message of ${data.size} bytes")
            return
        }
        listener?.onMessage(IncomingMessage(WearPeer(device), String(data, Charsets.UTF_8)))
    }

    override suspend fun send(peer: WatchPeer, payload: String) {
        val device = (peer as WearPeer).device
        val message = Message.Builder().setPayload(payload.toByteArray(Charsets.UTF_8)).build()
        // The watch gives up after 8 s anyway; never leave a reply coroutine hanging on Huawei Health.
        withTimeoutOrNull(SEND_TIMEOUT_MILLIS) { deliver(device, message) }
            ?: throw IOException("Wear Engine send timed out")
    }

    private suspend fun deliver(device: Device, message: Message) {
        suspendCancellableCoroutine { cont ->
            // onSendResult (binder thread) and the Task failure (main thread) may both fire:
            // only the first one may resume the continuation.
            val done = AtomicBoolean(false)
            p2p.send(device, message, object : SendCallback {
                override fun onSendResult(resultCode: Int) {
                    if (!done.compareAndSet(false, true)) return
                    if (resultCode == WearEngineErrorCode.ERROR_CODE_COMM_SUCCESS) cont.resume(Unit)
                    else cont.resumeWithException(IOException("Wear Engine send failed: $resultCode"))
                }

                override fun onSendProgress(progress: Long) = Unit
            }).addOnFailureListener {
                if (done.compareAndSet(false, true)) {
                    cont.resumeWithException(IOException("Wear Engine send failed: ${wearErrorCode(it)}"))
                }
            }
        }
    }

    override fun stop() {
        listener = null
        receivers.values.forEach { p2p.unregisterReceiver(it) }
        receivers.clear()
        wearEngineClient?.unregisterServiceConnectionListener()
        wearEngineClient = null
    }

    private companion object {
        /** Requests are a few hundred bytes; anything big is not ours. */
        const val MAX_INCOMING_BYTES = 16 * 1024
        const val SEND_TIMEOUT_MILLIS = 8_000L
    }
}

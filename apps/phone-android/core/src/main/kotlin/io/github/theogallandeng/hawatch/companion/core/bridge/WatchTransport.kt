package io.github.theogallandeng.hawatch.companion.core.bridge

/**
 * Transport to the watch. The real implementation is Wear Engine P2P (Android app module); tests use
 * an in-memory fake. Per the contract the watch always initiates: the phone only *replies*.
 */
interface WatchTransport {
    /** Starts listening. [listener] may be called on any thread. */
    fun start(listener: WatchMessageListener)

    /** Sends [payload] (one UTF-8 JSON object) to [peer]. Throws on failure. */
    suspend fun send(peer: WatchPeer, payload: String)

    fun stop()
}

/** Opaque handle on the sender, used to address the reply (a Wear Engine `Device` in production). */
interface WatchPeer

data class IncomingMessage(val peer: WatchPeer, val payload: String)

fun interface WatchMessageListener {
    fun onMessage(message: IncomingMessage)
}

/** Minimal logging seam. Implementations must never receive secrets: callers only log types/ids/sizes. */
fun interface CompanionLogger {
    fun log(message: String)

    companion object {
        val NONE = CompanionLogger { }
    }
}

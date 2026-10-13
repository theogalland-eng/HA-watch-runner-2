package io.github.theogallandeng.hawatch.companion.core.protocol

import kotlinx.serialization.Serializable

/**
 * Kotlin side of the watch ↔ phone wire contract, `docs/p2p-protocol.md` (**v2, compact**).
 * Wear Engine limits every P2P message to 1 KB in both directions, so every message stays
 * ≤ 900 bytes in the worst case (checked by `ProtocolCodecTest`). Decision: ADR-0008.
 */
const val PROTOCOL_VERSION: Int = 2

object MsgType {
    const val SYNC_REQUEST = "SYNC_REQUEST"
    const val SYNC_RESPONSE = "SYNC_RESPONSE"
    const val CALL_SERVICE = "CALL_SERVICE"
    const val ACK = "ACK"
}

/** `ACK.code` values (short ASCII, never the token or the URL). */
object AckCode {
    const val STALE = "stale"
    const val CONFIRM = "confirm"
    const val DENIED = "denied"
    const val CONFIG = "config"
    const val AUTH = "auth"
    const val HA = "ha"
    const val TIMEOUT = "timeout"
    const val BAD = "bad"
    const val VERSION = "version"
    const val INTERNAL = "internal"
}

/**
 * A favorite as the watch sees it: slot [k] (index in the favorites list), domain code [d], name
 * [n], state code [s] (see [CardCodes]). Build it with [CardCodes.card] so the size limits hold.
 */
@Serializable
data class Card(val k: Int, val d: String, val n: String, val s: String)

// ---- Requests (watch → phone) ----

sealed interface WatchRequest {
    val v: Int
    val id: String

    data class Sync(override val v: Int, override val id: String) : WatchRequest

    /** Act on slot [k] of favorites revision [fr]; [confirm] = `act: "confirm"` (required to unlock). */
    data class CallService(
        override val v: Int,
        override val id: String,
        val k: Int,
        val fr: Long,
        val confirm: Boolean,
    ) : WatchRequest

    /** Readable envelope (we can echo `id`) but unusable content; [code] is the `ACK.code` to send. */
    data class Invalid(override val v: Int, override val id: String, val code: String) : WatchRequest
}

// ---- Replies (phone → watch) ----

@Serializable
data class SyncResponse(
    val v: Int,
    val id: String,
    val type: String = MsgType.SYNC_RESPONSE,
    val fr: Long,
    val c: List<Card>,
)

@Serializable
data class Ack(
    val v: Int,
    val id: String,
    val type: String = MsgType.ACK,
    val ok: Boolean,
    /** Set when [ok] is false. */
    val code: String? = null,
    /** The acted-on favorite, read back from Home Assistant, when [ok] is true. */
    val c: Card? = null,
)

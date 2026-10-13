package io.github.theogallandeng.hawatch.companion.core.protocol

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Kotlin mirror of the watch ↔ phone wire contract, `docs/p2p-protocol.md` (v1).
 * The ArkTS definitions (`EntityCard.ets`, `P2pMessages.ets`) are authoritative; keep this in sync.
 */
const val PROTOCOL_VERSION: Int = 1

object MsgType {
    const val SYNC_REQUEST = "SYNC_REQUEST"
    const val SYNC_RESPONSE = "SYNC_RESPONSE"
    const val SYNC_ENTITY_REQUEST = "SYNC_ENTITY_REQUEST"
    const val SYNC_ENTITY_RESPONSE = "SYNC_ENTITY_RESPONSE"
    const val CALL_SERVICE = "CALL_SERVICE"
    const val ACK = "ACK"
}

/** A self-describing HA service call the watch renders and echoes back as `CALL_SERVICE`. */
@Serializable
data class EntityAction(
    val kind: String = KIND_SERVICE,
    val label: String,
    val domain: String,
    val service: String,
    val data: Map<String, String>,
) {
    companion object {
        const val KIND_SERVICE = "SERVICE"
    }
}

@Serializable
data class EntityCard(
    @SerialName("entity_id") val entityId: String,
    val domain: String,
    val name: String,
    val state: String,
    val icon: String? = null,
    val primary: EntityAction,
    val secondary: List<EntityAction> = emptyList(),
)

// ---- Requests (watch → phone) ----

sealed interface WatchRequest {
    val v: Int
    val id: String

    data class Sync(override val v: Int, override val id: String) : WatchRequest

    data class SyncEntity(override val v: Int, override val id: String, val entityId: String) : WatchRequest

    data class CallService(
        override val v: Int,
        override val id: String,
        val domain: String,
        val service: String,
        val data: Map<String, String>,
    ) : WatchRequest

    /** Readable envelope (we can echo `id`) but unusable content: unknown type, missing field, bad `v`. */
    data class Invalid(override val v: Int, override val id: String, val reason: String) : WatchRequest
}

// ---- Replies (phone → watch) ----

@Serializable
data class SyncResponse(
    val v: Int,
    val id: String,
    val type: String = MsgType.SYNC_RESPONSE,
    val cards: List<EntityCard>,
)

@Serializable
data class SyncEntityResponse(
    val v: Int,
    val id: String,
    val type: String = MsgType.SYNC_ENTITY_RESPONSE,
    /** Omitted on the wire when null: "entity no longer exists, keep the old card". */
    val card: EntityCard? = null,
)

@Serializable
data class Ack(
    val v: Int,
    val id: String,
    val type: String = MsgType.ACK,
    val ok: Boolean,
    val error: String? = null,
)

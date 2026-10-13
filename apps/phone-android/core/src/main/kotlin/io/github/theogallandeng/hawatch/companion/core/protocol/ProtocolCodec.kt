package io.github.theogallandeng.hawatch.companion.core.protocol

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull

/**
 * JSON encoding/decoding of P2P messages. Decoding is tolerant (the envelope is read first so that a
 * reply can echo `id` even when the body is wrong); encoding is compact (no whitespace, no nulls) to
 * keep messages short for the watch.
 */
object ProtocolCodec {

    val json: Json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true // `kind`, `type`, `secondary` are required by the contract
        explicitNulls = false // absent `card` / `icon` / `error` are omitted, not sent as null
    }

    /**
     * Returns null when the message is unusable *and* has no readable `id` (nothing to reply to).
     */
    fun decodeRequest(raw: String): WatchRequest? {
        val obj = try {
            json.parseToJsonElement(raw) as? JsonObject
        } catch (e: IllegalArgumentException) { // SerializationException extends it
            null
        } ?: return null

        val id = obj.string("id")?.takeIf { it.isNotEmpty() } ?: return null
        val vElement = obj["v"]
        val v = (vElement as? JsonPrimitive)?.intOrNull ?: PROTOCOL_VERSION
        if (vElement != null && v != PROTOCOL_VERSION) return WatchRequest.Invalid(v, id, "unsupported version")

        return when (obj.string("type")) {
            MsgType.SYNC_REQUEST -> WatchRequest.Sync(v, id)
            MsgType.SYNC_ENTITY_REQUEST -> {
                val entityId = obj.string("entity_id")
                if (entityId.isNullOrEmpty()) WatchRequest.Invalid(v, id, "missing entity_id")
                else WatchRequest.SyncEntity(v, id, entityId)
            }
            MsgType.CALL_SERVICE -> {
                val domain = obj.string("domain")
                val service = obj.string("service")
                val data = stringMap(obj["data"])
                when {
                    domain.isNullOrEmpty() || service.isNullOrEmpty() -> WatchRequest.Invalid(v, id, "missing domain/service")
                    data == null -> WatchRequest.Invalid(v, id, "bad data")
                    else -> WatchRequest.CallService(v, id, domain, service, data)
                }
            }
            else -> WatchRequest.Invalid(v, id, "unsupported type")
        }
    }

    fun encodeSync(req: WatchRequest, cards: List<EntityCard>): String =
        json.encodeToString(SyncResponse.serializer(), SyncResponse(v = req.v, id = req.id, cards = cards))

    fun encodeSyncEntity(req: WatchRequest, card: EntityCard?): String =
        json.encodeToString(SyncEntityResponse.serializer(), SyncEntityResponse(v = req.v, id = req.id, card = card))

    fun encodeAck(req: WatchRequest, ok: Boolean, error: String? = null): String =
        json.encodeToString(Ack.serializer(), Ack(v = req.v, id = req.id, ok = ok, error = error))

    private fun JsonObject.string(key: String): String? {
        val p = this[key] as? JsonPrimitive ?: return null
        return if (p.isString) p.content else null
    }

    /** `Record<string, string>`: primitives are accepted and stringified, nested values are rejected. */
    private fun stringMap(element: JsonElement?): Map<String, String>? {
        if (element == null || element is JsonNull) return emptyMap()
        val obj = element as? JsonObject ?: return null
        val out = LinkedHashMap<String, String>(obj.size)
        for ((k, value) in obj) {
            val p = value as? JsonPrimitive ?: return null
            if (p is JsonNull) continue
            out[k] = p.content
        }
        return out
    }
}

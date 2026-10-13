package io.github.theogallandeng.hawatch.companion.core.protocol

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.longOrNull

/**
 * JSON encoding/decoding of v2 P2P messages. Decoding is tolerant (the envelope is read first so
 * that a reply can echo `id` even when the body is wrong); encoding is compact (no whitespace, no
 * nulls) to stay under the 1 KB Wear Engine limit.
 */
object ProtocolCodec {

    val json: Json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true // `type` is required by the contract
        explicitNulls = false // absent `code` / `c` are omitted, not sent as null
    }

    /** `id`: ASCII, at most 16 characters, so that an echoed reply stays within the size budget. */
    private val ID = Regex("^[A-Za-z0-9_-]{1,16}$")

    /** Returns null when the message is unusable *and* has no valid `id` (nothing to reply to). */
    fun decodeRequest(raw: String): WatchRequest? {
        val obj = try {
            json.parseToJsonElement(raw) as? JsonObject
        } catch (e: IllegalArgumentException) { // SerializationException extends it
            null
        } ?: return null

        val id = obj.string("id")?.takeIf { ID.matches(it) } ?: return null
        val v = (obj["v"] as? JsonPrimitive)?.intOrNull
        if (v != PROTOCOL_VERSION) return WatchRequest.Invalid(PROTOCOL_VERSION, id, AckCode.VERSION)

        return when (obj.string("type")) {
            MsgType.SYNC_REQUEST -> WatchRequest.Sync(v, id)
            MsgType.CALL_SERVICE -> {
                val k = (obj["k"] as? JsonPrimitive)?.takeUnless { it.isString }?.intOrNull
                val fr = (obj["fr"] as? JsonPrimitive)?.takeUnless { it.isString }?.longOrNull
                val act = obj.string("act")
                when {
                    k == null || fr == null -> WatchRequest.Invalid(v, id, AckCode.BAD)
                    act != null && act != ACT_CONFIRM -> WatchRequest.Invalid(v, id, AckCode.BAD)
                    else -> WatchRequest.CallService(v, id, k, fr, confirm = act == ACT_CONFIRM)
                }
            }
            else -> WatchRequest.Invalid(v, id, AckCode.BAD)
        }
    }

    fun encodeSync(req: WatchRequest, fr: Long, cards: List<Card>): String =
        json.encodeToString(SyncResponse.serializer(), SyncResponse(v = PROTOCOL_VERSION, id = req.id, fr = fr, c = cards))

    fun encodeAck(req: WatchRequest, card: Card?): String =
        json.encodeToString(Ack.serializer(), Ack(v = PROTOCOL_VERSION, id = req.id, ok = true, c = card))

    fun encodeError(req: WatchRequest, code: String): String =
        json.encodeToString(Ack.serializer(), Ack(v = PROTOCOL_VERSION, id = req.id, ok = false, code = code))

    private fun JsonObject.string(key: String): String? {
        val p = this[key] as? JsonPrimitive ?: return null
        return if (p.isString) p.content else null
    }

    /** `CALL_SERVICE.act` value that allows unlocking. */
    const val ACT_CONFIRM = "confirm"
}

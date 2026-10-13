package io.github.theogallandeng.hawatch.companion.core.protocol

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ProtocolCodecTest {

    private fun parse(json: String): JsonObject = ProtocolCodec.json.parseToJsonElement(json).jsonObject

    @Test
    fun `decodes SYNC_REQUEST from the contract example`() {
        val req = ProtocolCodec.decodeRequest("""{ "v": 1, "id": "sync-ab12", "type": "SYNC_REQUEST" }""")
        assertEquals(WatchRequest.Sync(1, "sync-ab12"), req)
    }

    @Test
    fun `decodes SYNC_ENTITY_REQUEST`() {
        val req = ProtocolCodec.decodeRequest(
            """{ "v": 1, "id": "get_card-cd34", "type": "SYNC_ENTITY_REQUEST", "entity_id": "light.kitchen" }""",
        )
        assertEquals(WatchRequest.SyncEntity(1, "get_card-cd34", "light.kitchen"), req)
    }

    @Test
    fun `decodes CALL_SERVICE`() {
        val req = ProtocolCodec.decodeRequest(
            """{ "v": 1, "id": "svc-ef56", "type": "CALL_SERVICE",
                 "domain": "light", "service": "toggle", "data": { "entity_id": "light.kitchen" } }""",
        )
        assertEquals(
            WatchRequest.CallService(1, "svc-ef56", "light", "toggle", mapOf("entity_id" to "light.kitchen")),
            req,
        )
    }

    @Test
    fun `unknown fields are ignored`() {
        val req = ProtocolCodec.decodeRequest("""{"v":1,"id":"a","type":"SYNC_REQUEST","extra":{"x":[1,2]}}""")
        assertEquals(WatchRequest.Sync(1, "a"), req)
    }

    @Test
    fun `unreadable messages without id are dropped`() {
        assertNull(ProtocolCodec.decodeRequest("not json"))
        assertNull(ProtocolCodec.decodeRequest("[1,2,3]"))
        assertNull(ProtocolCodec.decodeRequest("""{"v":1,"type":"SYNC_REQUEST"}"""))
        assertNull(ProtocolCodec.decodeRequest("""{"v":1,"id":"","type":"SYNC_REQUEST"}"""))
    }

    @Test
    fun `readable envelope with bad content becomes Invalid so the id can be echoed`() {
        assertEquals(
            WatchRequest.Invalid(1, "x1", "unsupported type"),
            ProtocolCodec.decodeRequest("""{"v":1,"id":"x1","type":"PING"}"""),
        )
        assertEquals(
            WatchRequest.Invalid(1, "x2", "missing entity_id"),
            ProtocolCodec.decodeRequest("""{"v":1,"id":"x2","type":"SYNC_ENTITY_REQUEST"}"""),
        )
        assertEquals(
            WatchRequest.Invalid(1, "x3", "missing domain/service"),
            ProtocolCodec.decodeRequest("""{"v":1,"id":"x3","type":"CALL_SERVICE","data":{}}"""),
        )
        assertEquals(
            WatchRequest.Invalid(1, "x4", "bad data"),
            ProtocolCodec.decodeRequest("""{"v":1,"id":"x4","type":"CALL_SERVICE","domain":"light","service":"toggle","data":{"a":{"b":1}}}"""),
        )
        assertEquals(
            WatchRequest.Invalid(2, "x5", "unsupported version"),
            ProtocolCodec.decodeRequest("""{"v":2,"id":"x5","type":"SYNC_REQUEST"}"""),
        )
    }

    @Test
    fun `missing v defaults to the current protocol version`() {
        assertEquals(WatchRequest.Sync(PROTOCOL_VERSION, "a"), ProtocolCodec.decodeRequest("""{"id":"a","type":"SYNC_REQUEST"}"""))
    }

    @Test
    fun `SYNC_RESPONSE echoes id and v and carries the full card shape`() {
        val card = EntityCard(
            entityId = "light.kitchen",
            domain = "light",
            name = "Kitchen",
            state = "off",
            primary = EntityAction(label = "Turn on", domain = "light", service = "turn_on", data = mapOf("entity_id" to "light.kitchen")),
        )
        val out = parse(ProtocolCodec.encodeSync(WatchRequest.Sync(1, "sync-ab12"), listOf(card)))

        assertEquals("1", out["v"]!!.jsonPrimitive.content)
        assertEquals("sync-ab12", out["id"]!!.jsonPrimitive.content)
        assertEquals("SYNC_RESPONSE", out["type"]!!.jsonPrimitive.content)
        val c = out["cards"]!!.let { ProtocolCodec.json.decodeFromJsonElement(EntityCard.serializer(), (it as kotlinx.serialization.json.JsonArray)[0]) }
        assertEquals(card, c)
        val raw = out["cards"].toString()
        assertTrue("kind must be sent", raw.contains("\"kind\":\"SERVICE\""))
        assertTrue("secondary must be sent even when empty", raw.contains("\"secondary\":[]"))
        assertTrue("entity_id uses snake_case", raw.contains("\"entity_id\":\"light.kitchen\""))
        assertFalse("absent icon is omitted, not null", raw.contains("icon"))
    }

    @Test
    fun `SYNC_ENTITY_RESPONSE omits card when absent`() {
        val out = ProtocolCodec.encodeSyncEntity(WatchRequest.SyncEntity(1, "get_card-cd34", "light.x"), null)
        assertEquals("""{"v":1,"id":"get_card-cd34","type":"SYNC_ENTITY_RESPONSE"}""", out)
    }

    @Test
    fun `ACK is compact and omits error on success`() {
        val req = WatchRequest.CallService(1, "svc-ef56", "light", "toggle", emptyMap())
        assertEquals("""{"v":1,"id":"svc-ef56","type":"ACK","ok":true}""", ProtocolCodec.encodeAck(req, ok = true))
        assertEquals(
            """{"v":1,"id":"svc-ef56","type":"ACK","ok":false,"error":"HA returned 401"}""",
            ProtocolCodec.encodeAck(req, ok = false, error = "HA returned 401"),
        )
    }

    @Test
    fun `replies echo the request version verbatim`() {
        val req = WatchRequest.Invalid(2, "x5", "unsupported version")
        assertEquals("2", parse(ProtocolCodec.encodeAck(req, ok = false, error = req.reason))["v"]!!.jsonPrimitive.content)
    }
}

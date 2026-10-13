package io.github.theogallandeng.hawatch.companion.core.protocol

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ProtocolCodecTest {

    private fun decode(raw: String) = ProtocolCodec.decodeRequest(raw)

    @Test
    fun `decodes SYNC_REQUEST and CALL_SERVICE`() {
        assertEquals(WatchRequest.Sync(2, "sync-1"), decode("""{"v":2,"id":"sync-1","type":"SYNC_REQUEST"}"""))
        assertEquals(
            WatchRequest.CallService(2, "svc-1", k = 3, fr = 55808668, confirm = true),
            decode("""{"v":2,"id":"svc-1","type":"CALL_SERVICE","k":3,"fr":55808668,"act":"confirm"}"""),
        )
        assertEquals(
            WatchRequest.CallService(2, "svc-2", k = 0, fr = 1, confirm = false),
            decode("""{"v":2,"id":"svc-2","type":"CALL_SERVICE","k":0,"fr":1,"extra":true}"""),
        )
    }

    @Test
    fun `a readable envelope with bad content becomes Invalid so that the id can be echoed`() {
        val cases = mapOf(
            """{"v":2,"id":"a","type":"CALL_SERVICE","fr":1}""" to AckCode.BAD,
            """{"v":2,"id":"a","type":"CALL_SERVICE","k":"3","fr":1}""" to AckCode.BAD,
            """{"v":2,"id":"a","type":"CALL_SERVICE","k":1.5,"fr":1}""" to AckCode.BAD,
            """{"v":2,"id":"a","type":"CALL_SERVICE","k":1,"fr":1,"act":"force"}""" to AckCode.BAD,
            """{"v":2,"id":"a","type":"SYNC_ENTITY_REQUEST","k":1}""" to AckCode.BAD,
            """{"v":1,"id":"a","type":"SYNC_REQUEST"}""" to AckCode.VERSION,
            """{"id":"a","type":"SYNC_REQUEST"}""" to AckCode.VERSION,
        )
        for ((raw, code) in cases) assertEquals(raw, WatchRequest.Invalid(2, "a", code), decode(raw))
    }

    @Test
    fun `messages without a valid id get no reply`() {
        for (raw in listOf(
            "not json",
            """["SYNC_REQUEST"]""",
            """{"v":2,"type":"SYNC_REQUEST"}""",
            """{"v":2,"id":"","type":"SYNC_REQUEST"}""",
            """{"v":2,"id":"12345678901234567","type":"SYNC_REQUEST"}""",
            """{"v":2,"id":"sync-é","type":"SYNC_REQUEST"}""",
        )) assertNull(raw, decode(raw))
    }

    @Test
    fun `replies are compact, without whitespace or null fields`() {
        val req = WatchRequest.Sync(2, "s1")
        assertEquals(
            """{"v":2,"id":"s1","type":"SYNC_RESPONSE","fr":7,"c":[{"k":0,"d":"l","n":"Salon","s":"1"}]}""",
            ProtocolCodec.encodeSync(req, 7, listOf(Card(0, "l", "Salon", "1"))),
        )
        assertEquals("""{"v":2,"id":"s1","type":"ACK","ok":true}""", ProtocolCodec.encodeAck(req, null))
        assertEquals(
            """{"v":2,"id":"s1","type":"ACK","ok":true,"c":{"k":2,"d":"k","n":"Porte","s":"U"}}""",
            ProtocolCodec.encodeAck(req, Card(2, "k", "Porte", "U")),
        )
        assertEquals("""{"v":2,"id":"s1","type":"ACK","ok":false,"code":"stale"}""", ProtocolCodec.encodeError(req, AckCode.STALE))
    }

    /**
     * Wear Engine caps a P2P message at 1 KB in both directions: every v2 message stays ≤ 900 bytes
     * in the worst case (10 favorites, 20-character accented names, 12-byte sensor values, 16-char
     * ids, the largest `fr`). Sizes are printed for the PR.
     */
    @Test
    fun `worst cases stay within 900 bytes in both directions`() {
        val id = "abcdefghijklmnop"
        val fr = 0x7FFFFFFFL
        val accented = "Éèàùçéèàùçéèàùçéèàùç" // 20 characters, 40 bytes
        val sensor = "-12345,6 °C°" // 12 characters, 14 bytes: cut to 12 bytes
        val tricky = listOf(accented, "\"\\\"\\\"\\\"\\\"\\\"\\\"\\\"\\\"\\\"\\\"", "🏠".repeat(20), "d’entrée".repeat(4))
        val req = WatchRequest.Sync(2, id)
        val messages = mutableMapOf<String, String>()
        messages["SYNC_REQUEST"] = """{"v":2,"id":"$id","type":"SYNC_REQUEST"}"""
        messages["CALL_SERVICE"] = """{"v":2,"id":"$id","type":"CALL_SERVICE","k":9,"fr":$fr,"act":"confirm"}"""
        for (name in tricky) {
            val sensors = (0..9).map { CardCodes.card(it, "sensor", name, sensor)!! }
            val states = (0..9).map { CardCodes.card(it, "lock", name, "unavailable")!! }
            messages["SYNC_RESPONSE sensors ${name.take(4)}"] = ProtocolCodec.encodeSync(req, fr, sensors)
            messages["SYNC_RESPONSE states ${name.take(4)}"] = ProtocolCodec.encodeSync(req, fr, states)
            messages["ACK card ${name.take(4)}"] = ProtocolCodec.encodeAck(req, sensors[9])
        }
        messages["ACK error"] = ProtocolCodec.encodeError(req, AckCode.INTERNAL)
        for ((label, json) in messages) {
            val bytes = json.toByteArray(Charsets.UTF_8).size
            println("worst case: $label = $bytes bytes")
            assertTrue("$label is $bytes bytes", bytes <= 900)
        }
        assertEquals(896, messages.getValue("SYNC_RESPONSE sensors Éèàù").toByteArray(Charsets.UTF_8).size)
    }
}

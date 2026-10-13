package io.github.theogallandeng.hawatch.companion.core.bridge

import io.github.theogallandeng.hawatch.companion.core.FakeHaClient
import io.github.theogallandeng.hawatch.companion.core.FakeWatchTransport
import io.github.theogallandeng.hawatch.companion.core.TEST_TOKEN
import io.github.theogallandeng.hawatch.companion.core.config.CompanionSettings
import io.github.theogallandeng.hawatch.companion.core.haState
import io.github.theogallandeng.hawatch.companion.core.ha.HaClientFactory
import io.github.theogallandeng.hawatch.companion.core.mapping.EntityCardMapper
import io.github.theogallandeng.hawatch.companion.core.protocol.ProtocolCodec
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CompanionBridgeTest {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val transport = FakeWatchTransport()

    private val ha = FakeHaClient(
        states = mapOf(
            "light.kitchen" to haState("light.kitchen", "off", "Kitchen"),
            "lock.front_door" to haState("lock.front_door", "locked", "Front door"),
        ),
        delays = mapOf("lock.front_door" to 300L),
    )

    private val bridge = CompanionBridge(
        transport = transport,
        handler = WatchRequestHandler(
            config = { CompanionSettings("https://ha.example.org", TEST_TOKEN, listOf("light.kitchen", "lock.front_door")) },
            clientFactory = HaClientFactory { _, _ -> ha },
            mapper = EntityCardMapper(),
        ),
        scope = scope,
    )

    @After
    fun tearDown() {
        scope.cancel()
    }

    private fun awaitReplies(count: Int) = runBlocking {
        withTimeout(5_000) { while (transport.sent.size < count) delay(10) }
    }

    private fun replyIds(): List<String> =
        transport.sent.map { ProtocolCodec.json.parseToJsonElement(it.second).jsonObject["id"]!!.jsonPrimitive.content }

    @Test
    fun `a watch request is answered to the same peer with the same id`() {
        bridge.start()
        val peer = FakeWatchTransport.Peer("gt-runner-2")
        transport.receive("""{"v":1,"id":"get_card-1","type":"SYNC_ENTITY_REQUEST","entity_id":"light.kitchen"}""", peer)
        awaitReplies(1)

        val (to, payload) = transport.sent.single()
        assertEquals(peer, to)
        assertTrue(payload.contains("\"type\":\"SYNC_ENTITY_RESPONSE\""))
        assertEquals(listOf("get_card-1"), replyIds())
    }

    @Test
    fun `replies may go out of order, each correlated by id`() {
        bridge.start()
        transport.receive("""{"v":1,"id":"slow","type":"SYNC_ENTITY_REQUEST","entity_id":"lock.front_door"}""")
        transport.receive("""{"v":1,"id":"fast","type":"SYNC_ENTITY_REQUEST","entity_id":"light.kitchen"}""")
        awaitReplies(2)
        assertEquals(listOf("fast", "slow"), replyIds())
    }

    @Test
    fun `an action reaches Home Assistant and is acknowledged`() {
        bridge.start()
        transport.receive("""{"v":1,"id":"svc-1","type":"CALL_SERVICE","domain":"light","service":"turn_on","data":{"entity_id":"light.kitchen"}}""")
        awaitReplies(1)
        assertEquals("""{"v":1,"id":"svc-1","type":"ACK","ok":true}""", transport.sent.single().second)
        assertEquals(Triple("light", "turn_on", mapOf("entity_id" to "light.kitchen")), ha.calls.single())
    }

    @Test
    fun `unreadable messages get no reply and nothing happens between requests`() {
        bridge.start()
        transport.receive("garbage")
        runBlocking { delay(200) }
        assertTrue(transport.sent.isEmpty())
        assertTrue("no HA call without a watch request", ha.calls.isEmpty())
    }

    @Test
    fun `stop detaches from the transport`() {
        bridge.start()
        assertTrue(transport.started)
        bridge.stop()
        assertFalse(transport.started)
    }
}

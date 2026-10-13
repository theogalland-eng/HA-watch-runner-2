package io.github.theogallandeng.hawatch.companion.core.bridge

import io.github.theogallandeng.hawatch.companion.core.FakeHaClient
import io.github.theogallandeng.hawatch.companion.core.TEST_TOKEN
import io.github.theogallandeng.hawatch.companion.core.config.CompanionConfig
import io.github.theogallandeng.hawatch.companion.core.config.CompanionSettings
import io.github.theogallandeng.hawatch.companion.core.haState
import io.github.theogallandeng.hawatch.companion.core.ha.HaClient
import io.github.theogallandeng.hawatch.companion.core.ha.HaClientFactory
import io.github.theogallandeng.hawatch.companion.core.ha.HaState
import io.github.theogallandeng.hawatch.companion.core.ha.OkHttpHaClient
import io.github.theogallandeng.hawatch.companion.core.mapping.EntityCardMapper
import io.github.theogallandeng.hawatch.companion.core.protocol.EntityCard
import io.github.theogallandeng.hawatch.companion.core.protocol.ProtocolCodec
import io.github.theogallandeng.hawatch.companion.core.stateJson
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/** End-to-end protocol behaviour against a fake Home Assistant (MockWebServer). */
class WatchRequestHandlerTest {

    private lateinit var server: MockWebServer
    private val routes = mutableMapOf<String, () -> MockResponse>()

    private var favorites: List<String> = listOf("light.kitchen", "switch.router", "lock.front_door")
    private var configured = true

    private val config = CompanionConfig {
        if (configured) CompanionSettings(server.url("/").toString().trimEnd('/'), TEST_TOKEN, favorites) else null
    }

    private fun handler(deadlineMillis: Long = 2_000) = WatchRequestHandler(
        config = config,
        clientFactory = OkHttpHaClient.factory(OkHttpClient.Builder().callTimeout(3, TimeUnit.SECONDS).build()),
        mapper = EntityCardMapper(),
        deadlineMillis = deadlineMillis,
    )

    @Before
    fun setUp() {
        server = MockWebServer()
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse =
                routes["${request.method} ${request.path}"]?.invoke() ?: MockResponse().setResponseCode(404)
        }
        server.start()
        route("GET /api/states/light.kitchen") { MockResponse().setBody(stateJson("light.kitchen", "on", "Kitchen")) }
        route("GET /api/states/switch.router") { MockResponse().setBody(stateJson("switch.router", "off", "Router")) }
        route("GET /api/states/lock.front_door") { MockResponse().setBody(stateJson("lock.front_door", "locked", "Front door")) }
        route("POST /api/services/light/turn_off") { MockResponse().setBody("[]") }
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    private fun route(key: String, response: () -> MockResponse) {
        routes[key] = response
    }

    private fun parse(json: String?): JsonObject = ProtocolCodec.json.parseToJsonElement(json!!).jsonObject

    private fun cards(reply: JsonObject): List<EntityCard> =
        ProtocolCodec.json.decodeFromJsonElement(ListSerializer(EntityCard.serializer()), reply["cards"]!!)

    private fun JsonObject.str(key: String): String? = this[key]?.jsonPrimitive?.content

    private fun requestedPaths(): List<String> = List(server.requestCount) { server.takeRequest().path!! }

    // ---- SYNC_REQUEST ----

    @Test
    fun `sync returns favorites only, in the user's order, echoing id and v`() = runBlocking {
        favorites = listOf("lock.front_door", "light.kitchen")
        val reply = parse(handler().handle("""{"v":1,"id":"sync-ab12","type":"SYNC_REQUEST"}"""))

        assertEquals("SYNC_RESPONSE", reply.str("type"))
        assertEquals("sync-ab12", reply.str("id"))
        assertEquals("1", reply.str("v"))
        val cards = cards(reply)
        assertEquals(listOf("lock.front_door", "light.kitchen"), cards.map { it.entityId })
        assertEquals("unlock", cards[0].primary.service)
        assertEquals("turn_off", cards[1].primary.service)
        assertEquals("Kitchen", cards[1].name)
        assertFalse("switch.router is not a favorite", requestedPaths().any { it.contains("switch.router") })
    }

    @Test
    fun `sync never fetches the full state list`() = runBlocking {
        handler().handle("""{"v":1,"id":"s","type":"SYNC_REQUEST"}""")
        assertFalse(requestedPaths().contains("/api/states"))
    }

    @Test
    fun `sync skips an entity that no longer exists`() = runBlocking {
        favorites = listOf("light.kitchen", "light.removed")
        val reply = parse(handler().handle("""{"v":1,"id":"s","type":"SYNC_REQUEST"}"""))
        assertEquals(listOf("light.kitchen"), cards(reply).map { it.entityId })
    }

    @Test
    fun `sync with no favorites returns an empty list without any HA call`() = runBlocking {
        favorites = emptyList()
        val reply = parse(handler().handle("""{"v":1,"id":"s","type":"SYNC_REQUEST"}"""))
        assertEquals("SYNC_RESPONSE", reply.str("type"))
        assertTrue(cards(reply).isEmpty())
        assertEquals(0, server.requestCount)
    }

    @Test
    fun `sync with a revoked token answers ACK error 401`() = runBlocking {
        listOf("light.kitchen", "switch.router", "lock.front_door").forEach { id ->
            route("GET /api/states/$id") { MockResponse().setResponseCode(401) }
        }
        val reply = parse(handler().handle("""{"v":1,"id":"sync-1","type":"SYNC_REQUEST"}"""))
        assertEquals("ACK", reply.str("type"))
        assertEquals("sync-1", reply.str("id"))
        assertEquals("false", reply.str("ok"))
        assertEquals("HA returned 401", reply.str("error"))
    }

    @Test
    fun `sync prefers partial data when one entity is slow`() = runBlocking {
        route("GET /api/states/switch.router") {
            MockResponse().setBody(stateJson("switch.router", "off", "Router")).setHeadersDelay(2, TimeUnit.SECONDS)
        }
        val started = System.nanoTime()
        val reply = parse(handler(deadlineMillis = 500).handle("""{"v":1,"id":"s","type":"SYNC_REQUEST"}"""))
        val elapsedMs = (System.nanoTime() - started) / 1_000_000

        assertEquals("SYNC_RESPONSE", reply.str("type"))
        assertEquals(listOf("light.kitchen", "lock.front_door"), cards(reply).map { it.entityId })
        assertTrue("answered at the deadline, not after the slow call ($elapsedMs ms)", elapsedMs < 1_500)
    }

    @Test
    fun `sync leaves out an entity that fails on its own while others succeed`() = runBlocking {
        route("GET /api/states/switch.router") { MockResponse().setResponseCode(500) }
        val reply = parse(handler().handle("""{"v":1,"id":"s","type":"SYNC_REQUEST"}"""))
        assertEquals("SYNC_RESPONSE", reply.str("type"))
        assertEquals(listOf("light.kitchen", "lock.front_door"), cards(reply).map { it.entityId })
    }

    @Test
    fun `sync answers ACK timeout when nothing arrives before the deadline`() = runBlocking {
        listOf("light.kitchen", "switch.router", "lock.front_door").forEach { id ->
            route("GET /api/states/$id") { MockResponse().setBody("{}").setHeadersDelay(2, TimeUnit.SECONDS) }
        }
        val reply = parse(handler(deadlineMillis = 300).handle("""{"v":1,"id":"s","type":"SYNC_REQUEST"}"""))
        assertEquals("ACK", reply.str("type"))
        assertEquals("timeout", reply.str("error"))
    }

    @Test
    fun `sync reports HA unreachable when every call fails`() = runBlocking {
        server.shutdown()
        val reply = parse(handler().handle("""{"v":1,"id":"s","type":"SYNC_REQUEST"}"""))
        assertEquals("ACK", reply.str("type"))
        assertEquals("HA unreachable", reply.str("error"))
    }

    // ---- SYNC_ENTITY_REQUEST ----

    @Test
    fun `sync entity returns the fresh card`() = runBlocking {
        val reply = parse(handler().handle("""{"v":1,"id":"get_card-cd34","type":"SYNC_ENTITY_REQUEST","entity_id":"switch.router"}"""))
        assertEquals("SYNC_ENTITY_RESPONSE", reply.str("type"))
        assertEquals("get_card-cd34", reply.str("id"))
        val card = ProtocolCodec.json.decodeFromJsonElement(EntityCard.serializer(), reply["card"]!!)
        assertEquals("off", card.state)
        assertEquals("turn_on", card.primary.service)
    }

    @Test
    fun `sync entity omits the card when the entity is gone`() = runBlocking {
        favorites = favorites + "light.removed"
        val reply = parse(handler().handle("""{"v":1,"id":"g","type":"SYNC_ENTITY_REQUEST","entity_id":"light.removed"}"""))
        assertEquals("SYNC_ENTITY_RESPONSE", reply.str("type"))
        assertNull(reply["card"])
    }

    @Test
    fun `sync entity of a non-favorite is not fetched`() = runBlocking {
        favorites = listOf("light.kitchen")
        val reply = parse(handler().handle("""{"v":1,"id":"g","type":"SYNC_ENTITY_REQUEST","entity_id":"switch.router"}"""))
        assertNull(reply["card"])
        assertEquals(0, server.requestCount)
    }

    @Test
    fun `sync entity with a revoked token answers ACK error`() = runBlocking {
        route("GET /api/states/light.kitchen") { MockResponse().setResponseCode(401) }
        val reply = parse(handler().handle("""{"v":1,"id":"g","type":"SYNC_ENTITY_REQUEST","entity_id":"light.kitchen"}"""))
        assertEquals("ACK", reply.str("type"))
        assertEquals("HA returned 401", reply.str("error"))
    }

    @Test
    fun `sync entity times out with ACK timeout`() = runBlocking {
        route("GET /api/states/light.kitchen") { MockResponse().setBody("{}").setHeadersDelay(2, TimeUnit.SECONDS) }
        val reply = parse(handler(deadlineMillis = 300).handle("""{"v":1,"id":"g","type":"SYNC_ENTITY_REQUEST","entity_id":"light.kitchen"}"""))
        assertEquals("ACK", reply.str("type"))
        assertEquals("timeout", reply.str("error"))
    }

    // ---- CALL_SERVICE ----

    @Test
    fun `call service posts to HA and acks ok`() = runBlocking {
        val reply = parse(
            handler().handle(
                """{"v":1,"id":"svc-ef56","type":"CALL_SERVICE","domain":"light","service":"turn_off","data":{"entity_id":"light.kitchen"}}""",
            ),
        )
        assertEquals("""{"v":1,"id":"svc-ef56","type":"ACK","ok":true}""", reply.toString())
        val req = server.takeRequest()
        assertEquals("/api/services/light/turn_off", req.path)
        assertEquals("""{"entity_id":"light.kitchen"}""", req.body.readUtf8())
    }

    @Test
    fun `call service forwards only entity_id`() = runBlocking {
        handler().handle(
            """{"v":1,"id":"s","type":"CALL_SERVICE","domain":"light","service":"turn_off","data":{"entity_id":"light.kitchen","brightness":"255"}}""",
        )
        assertEquals("""{"entity_id":"light.kitchen"}""", server.takeRequest().body.readUtf8())
    }

    @Test
    fun `call service on a non-favorite or a forbidden service is refused without HA call`() = runBlocking {
        favorites = listOf("light.kitchen", "lock.front_door")
        val h = handler()
        val notFavorite = parse(h.handle("""{"v":1,"id":"a","type":"CALL_SERVICE","domain":"switch","service":"turn_on","data":{"entity_id":"switch.router"}}"""))
        val noLockToggle = parse(h.handle("""{"v":1,"id":"b","type":"CALL_SERVICE","domain":"lock","service":"toggle","data":{"entity_id":"lock.front_door"}}"""))
        val domainMismatch = parse(h.handle("""{"v":1,"id":"c","type":"CALL_SERVICE","domain":"lock","service":"unlock","data":{"entity_id":"light.kitchen"}}"""))
        val noEntity = parse(h.handle("""{"v":1,"id":"d","type":"CALL_SERVICE","domain":"light","service":"turn_on","data":{}}"""))

        for (r in listOf(notFavorite, noLockToggle, domainMismatch, noEntity)) {
            assertEquals("false", r.str("ok"))
            assertEquals("not allowed", r.str("error"))
        }
        assertEquals(0, server.requestCount)
    }

    @Test
    fun `call service failure is reported in the ACK`() = runBlocking {
        route("POST /api/services/light/turn_off") { MockResponse().setResponseCode(500) }
        val reply = parse(
            handler().handle("""{"v":1,"id":"s","type":"CALL_SERVICE","domain":"light","service":"turn_off","data":{"entity_id":"light.kitchen"}}"""),
        )
        assertEquals("false", reply.str("ok"))
        assertEquals("HA returned 500", reply.str("error"))
    }

    // ---- Envelope / configuration ----

    @Test
    fun `not configured answers every request with an ACK error`() = runBlocking {
        configured = false
        val reply = parse(handler().handle("""{"v":1,"id":"s","type":"SYNC_REQUEST"}"""))
        assertEquals("ACK", reply.str("type"))
        assertEquals("companion not configured", reply.str("error"))
        assertEquals(0, server.requestCount)
    }

    @Test
    fun `a stored token with non-ASCII characters yields an ACK, never a crash`() = runBlocking {
        val h = WatchRequestHandler(
            config = { CompanionSettings(server.url("/").toString(), "abc\u200Bdef", favorites) },
            clientFactory = OkHttpHaClient.factory(OkHttpClient()),
            mapper = EntityCardMapper(),
        )
        val sync = parse(h.handle("""{"v":1,"id":"s","type":"SYNC_REQUEST"}"""))
        assertEquals("ACK", sync.str("type"))
        assertEquals("invalid token", sync.str("error"))
        val call = parse(h.handle("""{"v":1,"id":"c","type":"CALL_SERVICE","domain":"light","service":"turn_off","data":{"entity_id":"light.kitchen"}}"""))
        assertEquals("invalid token", call.str("error"))
        assertEquals(0, server.requestCount)
    }

    @Test
    fun `an unexpected exception becomes ACK internal error`() = runBlocking {
        val broken = object : HaClient by FakeHaClient() {
            override suspend fun getState(entityId: String): HaState = throw IllegalStateException("boom")
            override suspend fun callService(domain: String, service: String, data: Map<String, String>) =
                throw IllegalStateException("boom")
        }
        val h = WatchRequestHandler(
            config = { CompanionSettings("https://ha.example.org", TEST_TOKEN, favorites) },
            clientFactory = HaClientFactory { _, _ -> broken },
            mapper = EntityCardMapper(),
        )
        for (msg in listOf(
            """{"v":1,"id":"a","type":"SYNC_REQUEST"}""",
            """{"v":1,"id":"b","type":"SYNC_ENTITY_REQUEST","entity_id":"light.kitchen"}""",
            """{"v":1,"id":"c","type":"CALL_SERVICE","domain":"light","service":"turn_off","data":{"entity_id":"light.kitchen"}}""",
        )) {
            val reply = parse(h.handle(msg))
            assertEquals("ACK", reply.str("type"))
            assertEquals("internal error", reply.str("error"))
        }
    }

    @Test
    fun `unknown type is answered, unreadable message is dropped`() = runBlocking {
        val reply = parse(handler().handle("""{"v":1,"id":"p","type":"PING"}"""))
        assertEquals("p", reply.str("id"))
        assertEquals("unsupported type", reply.str("error"))
        assertNull(handler().handle("garbage"))
    }

    @Test
    fun `the token never appears in any reply`() = runBlocking {
        favorites = listOf("light.kitchen", "light.removed")
        route("GET /api/states/light.kitchen") { MockResponse().setResponseCode(401).setBody(TEST_TOKEN) }
        val h = handler()
        val replies = listOf(
            h.handle("""{"v":1,"id":"1","type":"SYNC_REQUEST"}"""),
            h.handle("""{"v":1,"id":"2","type":"SYNC_ENTITY_REQUEST","entity_id":"light.kitchen"}"""),
            h.handle("""{"v":1,"id":"3","type":"CALL_SERVICE","domain":"light","service":"turn_on","data":{"entity_id":"light.kitchen"}}"""),
            h.handle("""{"v":1,"id":"4","type":"CALL_SERVICE","domain":"light","service":"x","data":{"entity_id":"light.kitchen"}}"""),
        )
        replies.forEach { assertFalse(it!!.contains(TEST_TOKEN)) }
        assertFalse(replies.any { it!!.contains(server.hostName) })
    }

    @Test
    fun `a full sync of the maximum number of favorites stays small`() = runBlocking {
        val ids = (1..CompanionSettings.MAX_FAVORITES).map { "light.living_room_ceiling_$it" }
        val fake = FakeHaClient(ids.associateWith { haState(it, "on", "Living room ceiling light $it") })
        val h = WatchRequestHandler(
            config = { CompanionSettings("https://ha.example.org", TEST_TOKEN, ids) },
            clientFactory = HaClientFactory { _, _ -> fake },
            mapper = EntityCardMapper(),
        )
        val reply = h.handle("""{"v":1,"id":"sync-0123456789","type":"SYNC_REQUEST"}""")!!
        assertEquals(CompanionSettings.MAX_FAVORITES, cards(parse(reply)).size)
        val bytes = reply.toByteArray(Charsets.UTF_8).size
        assertTrue("SYNC_RESPONSE is $bytes bytes", bytes < 3_000)
    }
}

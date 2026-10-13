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
import io.github.theogallandeng.hawatch.companion.core.protocol.Card
import io.github.theogallandeng.hawatch.companion.core.protocol.CardCodes
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

/** End-to-end protocol v2 behaviour against a fake Home Assistant (MockWebServer). */
class WatchRequestHandlerTest {

    private lateinit var server: MockWebServer
    private val routes = mutableMapOf<String, () -> MockResponse>()

    private var favorites: List<String> = listOf("light.kitchen", "switch.router", "lock.front_door")
    private var configured = true
    private val fr: Long get() = CardCodes.favoritesRevision(favorites)

    private val config = CompanionConfig {
        if (configured) CompanionSettings(server.url("/").toString().trimEnd('/'), TEST_TOKEN, favorites) else null
    }

    /** Short settle timings by default; the two timing tests use the real ones (500 ms / 5 s). */
    private fun handler(
        deadlineMillis: Long = 2_000,
        settleIntervalMillis: Long = 20,
        settleWindowMillis: Long = 200,
    ) = WatchRequestHandler(
        config = config,
        clientFactory = OkHttpHaClient.factory(OkHttpClient.Builder().callTimeout(3, TimeUnit.SECONDS).build()),
        mapper = EntityCardMapper(),
        deadlineMillis = deadlineMillis,
        settleIntervalMillis = settleIntervalMillis,
        settleWindowMillis = settleWindowMillis,
    )

    @Before
    fun setUp() {
        server = MockWebServer()
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse =
                routes["${request.method} ${request.path}"]?.invoke() ?: MockResponse().setResponseCode(404)
        }
        server.start()
        state("light.kitchen", "on", "Kitchen")
        state("switch.router", "off", "Router")
        state("lock.front_door", "locked", "Front door")
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    private fun route(key: String, response: () -> MockResponse) {
        routes[key] = response
    }

    private fun state(id: String, state: String, name: String) =
        route("GET /api/states/$id") { MockResponse().setBody(stateJson(id, state, name)) }

    private fun parse(json: String?): JsonObject = ProtocolCodec.json.parseToJsonElement(json!!).jsonObject

    private fun cards(reply: JsonObject): List<Card> =
        ProtocolCodec.json.decodeFromJsonElement(ListSerializer(Card.serializer()), reply["c"]!!)

    private fun card(reply: JsonObject): Card? = reply["c"]?.let { ProtocolCodec.json.decodeFromJsonElement(Card.serializer(), it) }

    private fun JsonObject.str(key: String): String? = this[key]?.jsonPrimitive?.content

    private fun requestedPaths(): List<String> = List(server.requestCount) { server.takeRequest().let { "${it.method} ${it.path}" } }

    private fun call(k: Int, act: String? = null, revision: Long = fr): String =
        """{"v":2,"id":"svc-$k","type":"CALL_SERVICE","k":$k,"fr":$revision${act?.let { ",\"act\":\"$it\"" } ?: ""}}"""

    private fun millisSince(started: Long) = (System.nanoTime() - started) / 1_000_000

    // ---- SYNC_REQUEST ----

    @Test
    fun `sync returns favorites only, slot k = index in the user's list, with the revision fr`() = runBlocking {
        favorites = listOf("lock.front_door", "light.kitchen")
        val reply = parse(handler().handle("""{"v":2,"id":"sync-ab12","type":"SYNC_REQUEST"}"""))

        assertEquals("SYNC_RESPONSE", reply.str("type"))
        assertEquals("sync-ab12", reply.str("id"))
        assertEquals("2", reply.str("v"))
        assertEquals(fr.toString(), reply.str("fr"))
        assertEquals(listOf(Card(0, "k", "Front door", "L"), Card(1, "l", "Kitchen", "1")), cards(reply))
        assertFalse("switch.router is not a favorite", requestedPaths().any { it.contains("switch.router") })
    }

    @Test
    fun `sync never fetches the full state list`() = runBlocking {
        handler().handle("""{"v":2,"id":"s","type":"SYNC_REQUEST"}""")
        assertFalse(requestedPaths().contains("GET /api/states"))
    }

    @Test
    fun `sync leaves out an entity that no longer exists, keeping the other slots`() = runBlocking {
        favorites = listOf("light.kitchen", "light.removed", "lock.front_door")
        val reply = parse(handler().handle("""{"v":2,"id":"s","type":"SYNC_REQUEST"}"""))
        assertEquals(listOf(0, 2), cards(reply).map { it.k })
    }

    @Test
    fun `sync with no favorites returns an empty list without any HA call`() = runBlocking {
        favorites = emptyList()
        val reply = parse(handler().handle("""{"v":2,"id":"s","type":"SYNC_REQUEST"}"""))
        assertEquals("SYNC_RESPONSE", reply.str("type"))
        assertTrue(cards(reply).isEmpty())
        assertEquals(0, server.requestCount)
    }

    @Test
    fun `sync with a revoked token answers code auth`() = runBlocking {
        favorites.forEach { id -> route("GET /api/states/$id") { MockResponse().setResponseCode(401) } }
        val reply = parse(handler().handle("""{"v":2,"id":"sync-1","type":"SYNC_REQUEST"}"""))
        assertEquals("""{"v":2,"id":"sync-1","type":"ACK","ok":false,"code":"auth"}""", reply.toString())
    }

    @Test
    fun `sync prefers partial data when one entity is slow`() = runBlocking {
        route("GET /api/states/switch.router") {
            MockResponse().setBody(stateJson("switch.router", "off", "Router")).setHeadersDelay(2, TimeUnit.SECONDS)
        }
        val started = System.nanoTime()
        val reply = parse(handler(deadlineMillis = 500).handle("""{"v":2,"id":"s","type":"SYNC_REQUEST"}"""))
        val elapsedMs = millisSince(started)

        assertEquals(listOf(0, 2), cards(reply).map { it.k })
        assertTrue("answered at the deadline, not after the slow call ($elapsedMs ms)", elapsedMs < 1_500)
    }

    @Test
    fun `sync leaves out an entity that fails on its own while others succeed`() = runBlocking {
        route("GET /api/states/switch.router") { MockResponse().setResponseCode(500) }
        val reply = parse(handler().handle("""{"v":2,"id":"s","type":"SYNC_REQUEST"}"""))
        assertEquals(listOf(0, 2), cards(reply).map { it.k })
    }

    @Test
    fun `sync answers code timeout when nothing arrives before the deadline`() = runBlocking {
        favorites.forEach { id -> route("GET /api/states/$id") { MockResponse().setBody("{}").setHeadersDelay(2, TimeUnit.SECONDS) } }
        val reply = parse(handler(deadlineMillis = 300).handle("""{"v":2,"id":"s","type":"SYNC_REQUEST"}"""))
        assertEquals("timeout", reply.str("code"))
    }

    @Test
    fun `sync reports code ha when Home Assistant is unreachable`() = runBlocking {
        server.shutdown()
        val reply = parse(handler().handle("""{"v":2,"id":"s","type":"SYNC_REQUEST"}"""))
        assertEquals("ha", reply.str("code"))
    }

    // ---- CALL_SERVICE ----

    @Test
    fun `an action with an old favorites revision is refused as stale, without HA call`() = runBlocking {
        val reply = parse(handler().handle(call(0, revision = fr + 1)))
        assertEquals("""{"v":2,"id":"svc-0","type":"ACK","ok":false,"code":"stale"}""", reply.toString())
        assertEquals(0, server.requestCount)
    }

    @Test
    fun `a slot outside the favorites is denied, without HA call`() = runBlocking {
        for (k in listOf(3, 9, -1, 12)) assertEquals("denied", parse(handler().handle(call(k))).str("code"))
        assertEquals(0, server.requestCount)
    }

    @Test
    fun `the companion picks the service from the state it reads, and answers with HA's new state`() = runBlocking {
        route("POST /api/services/light/turn_off") { MockResponse().setBody("[" + stateJson("light.kitchen", "off", "Kitchen") + "]") }
        val reply = parse(handler().handle(call(0)))

        assertEquals("""{"v":2,"id":"svc-0","type":"ACK","ok":true,"c":{"k":0,"d":"l","n":"Kitchen","s":"0"}}""", reply.toString())
        assertEquals(listOf("GET /api/states/light.kitchen", "POST /api/services/light/turn_off"), requestedPaths())
    }

    @Test
    fun `only entity_id is forwarded to Home Assistant`() = runBlocking {
        route("POST /api/services/switch/turn_on") { MockResponse().setBody("[]") }
        handler().handle(call(1))
        server.takeRequest()
        assertEquals("""{"entity_id":"switch.router"}""", server.takeRequest().body.readUtf8())
    }

    @Test
    fun `when HA's response does not list the entity, it is read again`() = runBlocking {
        var posted = false
        route("POST /api/services/switch/turn_on") { posted = true; MockResponse().setBody("[]") }
        route("GET /api/states/switch.router") { MockResponse().setBody(stateJson("switch.router", if (posted) "on" else "off", "Router")) }
        val reply = parse(handler().handle(call(1)))
        assertEquals(Card(1, "s", "Router", "1"), card(reply))
    }

    @Test
    fun `unlocking without the watch's confirmation is refused, never sent to HA`() = runBlocking {
        val reply = parse(handler().handle(call(2)))
        assertEquals("confirm", reply.str("code"))
        assertEquals(listOf("GET /api/states/lock.front_door"), requestedPaths())
    }

    @Test
    fun `act confirm unlocks, locking needs no confirmation, an already unlocked lock is not called`() = runBlocking {
        route("POST /api/services/lock/unlock") { MockResponse().setBody("[" + stateJson("lock.front_door", "unlocked", "Front door") + "]") }
        assertEquals(Card(2, "k", "Front door", "U"), card(parse(handler().handle(call(2, act = "confirm")))))

        state("lock.front_door", "unlocked", "Front door")
        route("POST /api/services/lock/lock") { MockResponse().setBody("[" + stateJson("lock.front_door", "locked", "Front door") + "]") }
        assertEquals(Card(2, "k", "Front door", "L"), card(parse(handler().handle(call(2)))))

        val before = server.requestCount
        val already = parse(handler().handle(call(2, act = "confirm")))
        assertEquals(Card(2, "k", "Front door", "U"), card(already))
        assertEquals("only the state read", before + 1, server.requestCount)
        assertFalse(requestedPaths().drop(before).any { it.startsWith("POST") })
    }

    @Test
    fun `a state that settles after about 1 s is waited for, then sent (real 500 ms polling)`() = runBlocking {
        var unlockedAt = Long.MAX_VALUE
        route("POST /api/services/lock/unlock") {
            unlockedAt = System.nanoTime() + 1_000_000_000L
            MockResponse().setBody("[" + stateJson("lock.front_door", "unlocking", "Front door") + "]")
        }
        route("GET /api/states/lock.front_door") {
            val s = if (unlockedAt == Long.MAX_VALUE) "locked" else if (System.nanoTime() < unlockedAt) "unlocking" else "unlocked"
            MockResponse().setBody(stateJson("lock.front_door", s, "Front door"))
        }
        val started = System.nanoTime()
        val reply = parse(handler(deadlineMillis = 6_500, settleIntervalMillis = 500, settleWindowMillis = 5_000).handle(call(2, act = "confirm")))
        val elapsedMs = millisSince(started)

        assertEquals(Card(2, "k", "Front door", "U"), card(reply))
        assertTrue("answered once settled ($elapsedMs ms)", elapsedMs in 1_000..2_500)
    }

    @Test
    fun `a state still moving after 5 s is sent as is (the watch shows it en cours)`() = runBlocking {
        state("lock.front_door", "unlocked", "Front door")
        var posted = false
        route("POST /api/services/lock/lock") { posted = true; MockResponse().setBody("[]") }
        route("GET /api/states/lock.front_door") {
            MockResponse().setBody(stateJson("lock.front_door", if (posted) "locking" else "unlocked", "Front door"))
        }
        val started = System.nanoTime()
        val reply = parse(handler(deadlineMillis = 6_500, settleIntervalMillis = 500, settleWindowMillis = 5_000).handle(call(2)))
        val elapsedMs = millisSince(started)

        assertEquals("true", reply.str("ok"))
        assertEquals(Card(2, "k", "Front door", "g"), card(reply))
        assertTrue("gave up after the 5 s window, before the 6.5 s deadline ($elapsedMs ms)", elapsedMs in 4_400..6_500)
        val reads = requestedPaths().count { it == "GET /api/states/lock.front_door" }
        assertTrue("polled every ~500 ms only during the action ($reads reads)", reads in 9..13)
    }

    @Test
    fun `a Home Assistant failure gives ok false with a code and no card`() = runBlocking {
        route("POST /api/services/light/turn_off") { MockResponse().setResponseCode(500) }
        val reply = parse(handler().handle(call(0)))
        assertEquals("""{"v":2,"id":"svc-0","type":"ACK","ok":false,"code":"ha"}""", reply.toString())
        assertNull(reply["c"])
    }

    // ---- Envelope / configuration ----

    @Test
    fun `not configured answers code config`() = runBlocking {
        configured = false
        assertEquals("config", parse(handler().handle("""{"v":2,"id":"s","type":"SYNC_REQUEST"}""")).str("code"))
        assertEquals(0, server.requestCount)
    }

    @Test
    fun `a stored token with non-ASCII characters yields code auth, never a crash`() = runBlocking {
        val h = WatchRequestHandler(
            config = { CompanionSettings(server.url("/").toString(), "abc​def", favorites) },
            clientFactory = OkHttpHaClient.factory(OkHttpClient()),
            mapper = EntityCardMapper(),
        )
        assertEquals("auth", parse(h.handle("""{"v":2,"id":"s","type":"SYNC_REQUEST"}""")).str("code"))
        assertEquals("auth", parse(h.handle(call(0))).str("code"))
        assertEquals(0, server.requestCount)
    }

    @Test
    fun `an unexpected exception becomes code internal`() = runBlocking {
        val broken = object : HaClient by FakeHaClient() {
            override suspend fun getState(entityId: String): HaState = throw IllegalStateException("boom")
        }
        val h = WatchRequestHandler(
            config = { CompanionSettings("https://ha.example.org", TEST_TOKEN, favorites) },
            clientFactory = HaClientFactory { _, _ -> broken },
            mapper = EntityCardMapper(),
        )
        for (msg in listOf("""{"v":2,"id":"a","type":"SYNC_REQUEST"}""", call(0))) {
            assertEquals("internal", parse(h.handle(msg)).str("code"))
        }
    }

    @Test
    fun `unknown type, old version and bad id`() = runBlocking {
        assertEquals("bad", parse(handler().handle("""{"v":2,"id":"p","type":"PING"}""")).str("code"))
        assertEquals("version", parse(handler().handle("""{"v":1,"id":"p","type":"SYNC_REQUEST"}""")).str("code"))
        assertNull(handler().handle("garbage"))
        assertNull(handler().handle("""{"v":2,"id":"this-id-is-far-too-long","type":"SYNC_REQUEST"}"""))
    }

    @Test
    fun `the token and the URL never appear in any reply`() = runBlocking {
        favorites = listOf("light.kitchen", "light.removed")
        route("GET /api/states/light.kitchen") { MockResponse().setResponseCode(401).setBody(TEST_TOKEN) }
        val h = handler()
        val replies = listOf(h.handle("""{"v":2,"id":"1","type":"SYNC_REQUEST"}"""), h.handle(call(0)), h.handle(call(1)))
        replies.forEach { assertFalse(it!!.contains(TEST_TOKEN)) }
        assertFalse(replies.any { it!!.contains(server.hostName) })
    }

    @Test
    fun `replies stay under 900 bytes with 10 favorites and long accented names`() = runBlocking {
        val ids = (0 until CompanionSettings.MAX_FAVORITES).map { "light.chambre_$it" }
        val fake = FakeHaClient(ids.associateWith { haState(it, "unavailable", "Éèàùçéèàùçéèàùçéèàùç") })
        val h = WatchRequestHandler(
            config = { CompanionSettings("https://ha.example.org", TEST_TOKEN, ids) },
            clientFactory = HaClientFactory { _, _ -> fake },
            mapper = EntityCardMapper(),
        )
        val sync = h.handle("""{"v":2,"id":"sync-0123456789a","type":"SYNC_REQUEST"}""")!!
        assertEquals(CompanionSettings.MAX_FAVORITES, cards(parse(sync)).size)
        val ack = h.handle("""{"v":2,"id":"svc-0123456789ab","type":"CALL_SERVICE","k":9,"fr":${CardCodes.favoritesRevision(ids)}}""")!!
        for ((label, reply) in listOf("SYNC_RESPONSE" to sync, "ACK" to ack)) {
            val bytes = reply.toByteArray(Charsets.UTF_8).size
            println("handler worst case: $label = $bytes bytes")
            assertTrue("$label is $bytes bytes", bytes <= 900)
        }
    }
}

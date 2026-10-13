package io.github.theogallandeng.hawatch.companion.core.ha

import io.github.theogallandeng.hawatch.companion.core.TEST_TOKEN
import io.github.theogallandeng.hawatch.companion.core.stateJson
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.SocketPolicy
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test

class OkHttpHaClientTest {

    private lateinit var server: MockWebServer
    private lateinit var client: HaClient

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        val http = OkHttpClient.Builder()
            .callTimeout(500, TimeUnit.MILLISECONDS)
            .readTimeout(500, TimeUnit.MILLISECONDS)
            .build()
        client = OkHttpHaClient(server.url("/"), TEST_TOKEN, http)
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    private inline fun <reified E : HaException> assertThrows(block: () -> Unit): E {
        try {
            block()
        } catch (e: HaException) {
            if (e is E) return e
            fail("expected ${E::class.simpleName}, got ${e::class.simpleName}")
        }
        fail("expected ${E::class.simpleName}, nothing thrown")
        error("unreachable")
    }

    @Test
    fun `checkApi calls GET api with the bearer token`() = runBlocking {
        server.enqueue(MockResponse().setBody("""{"message":"API running."}"""))
        client.checkApi()
        val req = server.takeRequest()
        assertEquals("GET", req.method)
        assertEquals("/api/", req.path)
        assertEquals("Bearer $TEST_TOKEN", req.getHeader("Authorization"))
    }

    @Test
    fun `getState parses one entity and ignores unknown fields`() = runBlocking {
        server.enqueue(MockResponse().setBody(stateJson("light.kitchen", "on", "Kitchen")))
        val s = client.getState("light.kitchen")
        assertEquals("/api/states/light.kitchen", server.takeRequest().path)
        assertEquals("light.kitchen", s.entityId)
        assertEquals("on", s.state)
        assertEquals("Kitchen", s.friendlyName)
        assertEquals("light", s.domain)
    }

    @Test
    fun `getStates parses the full list`() = runBlocking {
        server.enqueue(
            MockResponse().setBody("[${stateJson("light.a", "on", "A")},${stateJson("sensor.t", "21", "T")}]"),
        )
        val all = client.getStates()
        assertEquals("/api/states", server.takeRequest().path)
        assertEquals(listOf("light.a", "sensor.t"), all.map { it.entityId })
    }

    @Test
    fun `base url with a sub path is preserved`() = runBlocking {
        val sub = OkHttpHaClient(server.url("/ha"), TEST_TOKEN, OkHttpClient())
        server.enqueue(MockResponse().setBody(stateJson("light.a", "on", "A")))
        sub.getState("light.a")
        assertEquals("/ha/api/states/light.a", server.takeRequest().path)
    }

    @Test
    fun `callService posts the entity id as JSON`() = runBlocking {
        server.enqueue(MockResponse().setBody("[]"))
        client.callService("light", "turn_on", mapOf("entity_id" to "light.kitchen"))
        val req = server.takeRequest()
        assertEquals("POST", req.method)
        assertEquals("/api/services/light/turn_on", req.path)
        assertEquals("""{"entity_id":"light.kitchen"}""", req.body.readUtf8())
        assertTrue(req.getHeader("Content-Type")!!.startsWith("application/json"))
        assertEquals("Bearer $TEST_TOKEN", req.getHeader("Authorization"))
    }

    @Test
    fun `401 and 403 map to Unauthorized`() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(401).setBody("401: Unauthorized"))
        val e401 = assertThrows<HaException.Unauthorized> { client.getState("light.a") }
        assertEquals("HA returned 401", e401.watchMessage)

        server.enqueue(MockResponse().setResponseCode(403))
        val e403 = assertThrows<HaException.Unauthorized> { client.checkApi() }
        assertEquals(403, e403.code)
    }

    @Test
    fun `404 maps to NotFound (entity absent)`() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(404).setBody("""{"message":"Entity not found."}"""))
        assertThrows<HaException.NotFound> { client.getState("light.gone") }
        Unit
    }

    @Test
    fun `other HTTP errors keep their code`() = runBlocking {
        server.enqueue(MockResponse().setResponseCode(500))
        val e = assertThrows<HaException.Http> { client.callService("light", "turn_on", mapOf()) }
        assertEquals(500, e.code)
        assertEquals("HA returned 500", e.watchMessage)
    }

    @Test
    fun `slow server maps to Timeout`() = runBlocking {
        server.enqueue(MockResponse().setBody("[]").setHeadersDelay(2, TimeUnit.SECONDS))
        assertThrows<HaException.Timeout> { client.getStates() }
        Unit
    }

    @Test
    fun `dropped connection maps to Unreachable`() = runBlocking {
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AT_START))
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AT_START))
        assertThrows<HaException.Unreachable> { client.checkApi() }
        Unit
    }

    @Test
    fun `invalid JSON maps to BadResponse`() = runBlocking {
        server.enqueue(MockResponse().setBody("<html>proxy error</html>"))
        assertThrows<HaException.BadResponse> { client.getState("light.a") }
        Unit
    }

    @Test
    fun `a token that cannot go in a header is a typed error, not a crash`() = runBlocking {
        val bad = OkHttpHaClient(server.url("/"), "abc\u200Bdef", OkHttpClient())
        val e = assertThrows<HaException.InvalidToken> { bad.checkApi() }
        assertEquals("invalid token", e.watchMessage)
        assertEquals(0, server.requestCount)
    }

    @Test
    fun `error messages never contain the token or the host`() = runBlocking {
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AT_START))
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AT_START))
        val e = assertThrows<HaException> { client.checkApi() }
        assertFalse(e.watchMessage.contains(TEST_TOKEN))
        assertFalse(e.watchMessage.contains(server.hostName))
    }
}

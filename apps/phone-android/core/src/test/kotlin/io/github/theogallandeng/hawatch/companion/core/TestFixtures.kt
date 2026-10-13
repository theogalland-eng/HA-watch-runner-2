package io.github.theogallandeng.hawatch.companion.core

import io.github.theogallandeng.hawatch.companion.core.bridge.IncomingMessage
import io.github.theogallandeng.hawatch.companion.core.bridge.WatchMessageListener
import io.github.theogallandeng.hawatch.companion.core.bridge.WatchPeer
import io.github.theogallandeng.hawatch.companion.core.bridge.WatchTransport
import io.github.theogallandeng.hawatch.companion.core.ha.HaClient
import io.github.theogallandeng.hawatch.companion.core.ha.HaException
import io.github.theogallandeng.hawatch.companion.core.ha.HaState
import java.util.concurrent.CopyOnWriteArrayList
import kotlinx.coroutines.delay
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** Obviously fake; tests assert it never leaks into a reply. */
const val TEST_TOKEN = "test-token-not-a-real-secret"

fun stateJson(entityId: String, state: String, name: String): String =
    """{"entity_id":"$entityId","state":"$state","attributes":{"friendly_name":"$name","icon":"mdi:x"},""" +
        """"last_changed":"2026-01-01T00:00:00+00:00","context":{"id":"01H"}}"""

fun haState(entityId: String, state: String, name: String? = null) =
    HaState(entityId, state, JsonObject(name?.let { mapOf("friendly_name" to JsonPrimitive(it)) } ?: emptyMap()))

/** In-memory watch: tests push requests in and read the replies the bridge sent back. */
class FakeWatchTransport : WatchTransport {
    data class Peer(val name: String) : WatchPeer

    private var listener: WatchMessageListener? = null
    val sent = CopyOnWriteArrayList<Pair<WatchPeer, String>>()
    var started = false
        private set

    override fun start(listener: WatchMessageListener) {
        this.listener = listener
        started = true
    }

    override suspend fun send(peer: WatchPeer, payload: String) {
        sent += peer to payload
    }

    override fun stop() {
        listener = null
        started = false
    }

    fun receive(payload: String, peer: WatchPeer = Peer("watch")) {
        checkNotNull(listener) { "transport not started" }.onMessage(IncomingMessage(peer, payload))
    }
}

/**
 * Scriptable HA, for tests that need precise timing without a socket. A service call applies its
 * obvious effect (turn_on → on, unlock → unlocked…) and reports the changed state, like HA does.
 */
class FakeHaClient(
    states: Map<String, HaState> = emptyMap(),
    private val delays: Map<String, Long> = emptyMap(),
) : HaClient {
    private val states = java.util.concurrent.ConcurrentHashMap(states)
    val calls = CopyOnWriteArrayList<Triple<String, String, Map<String, String>>>()

    override suspend fun checkApi() = Unit

    override suspend fun getStates(): List<HaState> = states.values.toList()

    override suspend fun getState(entityId: String): HaState {
        delays[entityId]?.let { delay(it) }
        return states[entityId] ?: throw HaException.NotFound()
    }

    override suspend fun callService(domain: String, service: String, data: Map<String, String>): List<HaState> {
        calls += Triple(domain, service, data)
        val id = data["entity_id"] ?: return emptyList()
        val old = states[id] ?: return emptyList()
        val new = EFFECTS[service] ?: return emptyList()
        return listOf(old.copy(state = new).also { states[id] = it })
    }

    private companion object {
        val EFFECTS = mapOf("turn_on" to "on", "turn_off" to "off", "lock" to "locked", "unlock" to "unlocked")
    }
}

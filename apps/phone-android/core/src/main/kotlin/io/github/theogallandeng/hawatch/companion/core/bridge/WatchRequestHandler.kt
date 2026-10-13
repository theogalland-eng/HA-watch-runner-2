package io.github.theogallandeng.hawatch.companion.core.bridge

import io.github.theogallandeng.hawatch.companion.core.config.CompanionConfig
import io.github.theogallandeng.hawatch.companion.core.config.CompanionSettings
import io.github.theogallandeng.hawatch.companion.core.ha.HaClient
import io.github.theogallandeng.hawatch.companion.core.ha.HaClientFactory
import io.github.theogallandeng.hawatch.companion.core.ha.HaException
import io.github.theogallandeng.hawatch.companion.core.mapping.EntityCardMapper
import io.github.theogallandeng.hawatch.companion.core.protocol.EntityCard
import io.github.theogallandeng.hawatch.companion.core.protocol.ProtocolCodec
import io.github.theogallandeng.hawatch.companion.core.protocol.WatchRequest
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.joinAll
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.withTimeoutOrNull

/**
 * The protocol core: one watch request (JSON) in → one reply (JSON) out, per `docs/p2p-protocol.md` v1.
 *
 * - Every reply echoes the request `id` and `v`.
 * - Home Assistant is called only here, i.e. only when the watch asks.
 * - Only the user's favorites are ever sent to (or controllable from) the watch.
 * - Replies are produced within [deadlineMillis] so they reach the watch before its 8 s timeout.
 */
class WatchRequestHandler(
    private val config: CompanionConfig,
    private val clientFactory: HaClientFactory,
    private val mapper: EntityCardMapper,
    private val deadlineMillis: Long = DEFAULT_DEADLINE_MILLIS,
    private val maxParallel: Int = DEFAULT_MAX_PARALLEL,
    private val logger: CompanionLogger = CompanionLogger.NONE,
) {

    /** Returns the reply to send, or null if the message is unreadable (no `id` to answer). */
    suspend fun handle(raw: String): String? {
        val request = ProtocolCodec.decodeRequest(raw)
        if (request == null) {
            logger.log("dropped unreadable message (${raw.length} chars)")
            return null
        }
        if (request is WatchRequest.Invalid) {
            logger.log("invalid request ${request.id}: ${request.reason}")
            return ProtocolCodec.encodeAck(request, ok = false, error = request.reason)
        }
        val settings = config.current()
            ?: return ProtocolCodec.encodeAck(request, ok = false, error = ERROR_NOT_CONFIGURED)

        val client = try {
            clientFactory.create(settings.baseUrl, settings.token)
        } catch (e: HaException) {
            return ProtocolCodec.encodeAck(request, ok = false, error = e.watchMessage)
        }

        return when (request) {
            is WatchRequest.Sync -> sync(request, settings, client)
            is WatchRequest.SyncEntity -> guarded(request) { syncEntity(request, settings, client) }
            is WatchRequest.CallService -> guarded(request) { callService(request, settings, client) }
            is WatchRequest.Invalid -> error("handled above")
        }
    }

    /** Runs [block] within the deadline and turns HA failures into `ACK { ok: false }`. */
    private suspend fun guarded(request: WatchRequest, block: suspend () -> String): String =
        try {
            withTimeout(deadlineMillis) { block() }
        } catch (e: TimeoutCancellationException) {
            ProtocolCodec.encodeAck(request, ok = false, error = ERROR_TIMEOUT)
        } catch (e: HaException) {
            ProtocolCodec.encodeAck(request, ok = false, error = e.watchMessage)
        }

    /**
     * Favorites only, in the user's order, one `GET /api/states/<id>` each (bounded parallelism).
     * Prefers fast partial data: entities not fetched before the deadline are left out; missing
     * entities (404) are skipped. Fails as a whole on auth errors, or when nothing could be fetched.
     */
    private suspend fun sync(request: WatchRequest.Sync, settings: CompanionSettings, client: HaClient): String {
        val ids = settings.favorites.filter(mapper::isSupported)
        if (ids.isEmpty()) return ProtocolCodec.encodeSync(request, emptyList())

        val outcomes = arrayOfNulls<Outcome>(ids.size)
        coroutineScope {
            val permits = Semaphore(maxParallel)
            val jobs = ids.mapIndexed { index, entityId ->
                async { outcomes[index] = permits.withPermit { fetch(client, entityId) } }
            }
            val finished = withTimeoutOrNull(deadlineMillis) { jobs.joinAll() }
            if (finished == null) jobs.forEach { it.cancel() } // cancels the in-flight HTTP calls
        }

        val results = outcomes.toList()
        results.firstNotNullOfOrNull { (it as? Outcome.Failed)?.error as? HaException.Unauthorized }?.let {
            return ProtocolCodec.encodeAck(request, ok = false, error = it.watchMessage)
        }
        val cards = results.mapNotNull { (it as? Outcome.Card)?.card }
        if (cards.isEmpty()) {
            val error = results.firstNotNullOfOrNull { (it as? Outcome.Failed)?.error?.watchMessage }
                ?: if (results.any { it == null }) ERROR_TIMEOUT else null
            if (error != null) return ProtocolCodec.encodeAck(request, ok = false, error = error)
        }
        logger.log("sync ${request.id}: ${cards.size}/${ids.size} cards")
        return ProtocolCodec.encodeSync(request, cards)
    }

    private suspend fun fetch(client: HaClient, entityId: String): Outcome =
        try {
            mapper.map(client.getState(entityId))?.let { Outcome.Card(it) } ?: Outcome.Missing
        } catch (e: HaException.NotFound) {
            Outcome.Missing
        } catch (e: HaException) {
            Outcome.Failed(e)
        }

    private suspend fun syncEntity(
        request: WatchRequest.SyncEntity,
        settings: CompanionSettings,
        client: HaClient,
    ): String {
        val entityId = request.entityId
        if (entityId !in settings.favorites || !mapper.isSupported(entityId)) {
            return ProtocolCodec.encodeSyncEntity(request, null)
        }
        val card = try {
            mapper.map(client.getState(entityId))
        } catch (e: HaException.NotFound) {
            null // "entity no longer exists": card omitted, the watch keeps its old card
        }
        return ProtocolCodec.encodeSyncEntity(request, card)
    }

    private suspend fun callService(
        request: WatchRequest.CallService,
        settings: CompanionSettings,
        client: HaClient,
    ): String {
        val entityId = request.data["entity_id"].orEmpty()
        val allowed = entityId in settings.favorites && mapper.isAllowed(request.domain, request.service, entityId)
        if (!allowed) {
            logger.log("refused ${request.id}: ${request.domain}.${request.service}")
            return ProtocolCodec.encodeAck(request, ok = false, error = ERROR_NOT_ALLOWED)
        }
        // Only entity_id is forwarded: the MVP domains need nothing else, and it keeps the watch from
        // smuggling extra service data (e.g. a lock code).
        client.callService(request.domain, request.service, mapOf("entity_id" to entityId))
        return ProtocolCodec.encodeAck(request, ok = true)
    }

    private sealed interface Outcome {
        data class Card(val card: EntityCard) : Outcome
        data object Missing : Outcome
        data class Failed(val error: HaException) : Outcome
    }

    companion object {
        /** The watch times out at 8 s; keep ~1.5 s for the Bluetooth round trip. */
        const val DEFAULT_DEADLINE_MILLIS = 6_500L
        const val DEFAULT_MAX_PARALLEL = 4

        const val ERROR_NOT_CONFIGURED = "companion not configured"
        const val ERROR_NOT_ALLOWED = "not allowed"
        const val ERROR_TIMEOUT = "timeout"
    }
}

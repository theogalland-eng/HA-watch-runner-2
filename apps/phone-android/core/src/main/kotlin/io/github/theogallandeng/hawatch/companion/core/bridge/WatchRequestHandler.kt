package io.github.theogallandeng.hawatch.companion.core.bridge

import io.github.theogallandeng.hawatch.companion.core.config.CompanionConfig
import io.github.theogallandeng.hawatch.companion.core.config.CompanionSettings
import io.github.theogallandeng.hawatch.companion.core.ha.HaClient
import io.github.theogallandeng.hawatch.companion.core.ha.HaClientFactory
import io.github.theogallandeng.hawatch.companion.core.ha.HaException
import io.github.theogallandeng.hawatch.companion.core.ha.HaState
import io.github.theogallandeng.hawatch.companion.core.mapping.EntityCardMapper
import io.github.theogallandeng.hawatch.companion.core.mapping.ServiceChoice
import io.github.theogallandeng.hawatch.companion.core.protocol.AckCode
import io.github.theogallandeng.hawatch.companion.core.protocol.Card
import io.github.theogallandeng.hawatch.companion.core.protocol.CardCodes
import io.github.theogallandeng.hawatch.companion.core.protocol.ProtocolCodec
import io.github.theogallandeng.hawatch.companion.core.protocol.WatchRequest
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.joinAll
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.withTimeoutOrNull

/**
 * The protocol core: one watch request (JSON) in → one reply (JSON) out, per `docs/p2p-protocol.md` v2.
 *
 * - Every reply echoes the request `id`.
 * - Home Assistant is called only here, i.e. only when the watch asks. During an action only, the
 *   entity is read again every [settleIntervalMillis] until it settles, for [settleWindowMillis] at
 *   most: the reply then carries HA's real new state (no second watch request, no polling otherwise).
 * - Only the user's favorites are ever sent to (or controllable from) the watch, by slot `k`.
 * - Replies are produced within [deadlineMillis] so they reach the watch before its 8 s timeout.
 */
class WatchRequestHandler(
    private val config: CompanionConfig,
    private val clientFactory: HaClientFactory,
    private val mapper: EntityCardMapper,
    private val deadlineMillis: Long = DEFAULT_DEADLINE_MILLIS,
    private val maxParallel: Int = DEFAULT_MAX_PARALLEL,
    private val settleIntervalMillis: Long = DEFAULT_SETTLE_INTERVAL_MILLIS,
    private val settleWindowMillis: Long = DEFAULT_SETTLE_WINDOW_MILLIS,
    private val logger: CompanionLogger = CompanionLogger.NONE,
) {

    /** Returns the reply to send, or null if the message is unreadable (no valid `id` to answer). */
    suspend fun handle(raw: String): String? {
        val started = now()
        val request = ProtocolCodec.decodeRequest(raw)
        if (request == null) {
            logger.log("dropped unreadable message (${raw.length} chars)")
            return null
        }
        if (request is WatchRequest.Invalid) {
            logger.log("invalid request ${request.id}: ${request.code}")
            return ProtocolCodec.encodeError(request, request.code)
        }
        val settings = config.current() ?: return ProtocolCodec.encodeError(request, AckCode.CONFIG)

        val client = try {
            clientFactory.create(settings.baseUrl, settings.token)
        } catch (e: HaException) {
            return ProtocolCodec.encodeError(request, codeOf(e))
        }

        return try {
            when (request) {
                is WatchRequest.Sync -> sync(request, settings, client)
                is WatchRequest.CallService -> guarded(request) { callService(request, settings, client, started) }
                is WatchRequest.Invalid -> error("handled above")
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            // Never let an unexpected failure kill the companion process: the watch gets an answer.
            logger.log("request ${request.id} failed: ${e.javaClass.simpleName}")
            ProtocolCodec.encodeError(request, AckCode.INTERNAL)
        }
    }

    /** Runs [block] within the deadline and turns HA failures into `ACK { ok: false, code }`. */
    private suspend fun guarded(request: WatchRequest, block: suspend () -> String): String =
        try {
            withTimeout(deadlineMillis) { block() }
        } catch (e: TimeoutCancellationException) {
            ProtocolCodec.encodeError(request, AckCode.TIMEOUT)
        } catch (e: HaException) {
            ProtocolCodec.encodeError(request, codeOf(e))
        }

    /**
     * Favorites only, slot `k` = index in the user's list, one `GET /api/states/<id>` each (bounded
     * parallelism). Prefers fast partial data: a favorite is left out when it no longer exists (404),
     * was not fetched before the deadline, or failed on its own while others succeeded. Fails as a
     * whole (ACK) on auth errors, or when no card at all could be fetched.
     */
    private suspend fun sync(request: WatchRequest.Sync, settings: CompanionSettings, client: HaClient): String {
        val fr = CardCodes.favoritesRevision(settings.favorites)
        val slots = settings.favorites.take(CompanionSettings.MAX_FAVORITES).withIndex().filter { mapper.isSupported(it.value) }
        if (slots.isEmpty()) return ProtocolCodec.encodeSync(request, fr, emptyList())

        val outcomes = arrayOfNulls<Outcome>(slots.size)
        coroutineScope {
            val permits = Semaphore(maxParallel)
            val jobs = slots.mapIndexed { i, slot ->
                async { outcomes[i] = permits.withPermit { fetch(client, slot.index, slot.value) } }
            }
            val finished = withTimeoutOrNull(deadlineMillis) { jobs.joinAll() }
            if (finished == null) jobs.forEach { it.cancel() } // cancels the in-flight HTTP calls
        }

        val results = outcomes.toList()
        results.firstNotNullOfOrNull { (it as? Outcome.Failed)?.error as? HaException.Unauthorized }?.let {
            return ProtocolCodec.encodeError(request, AckCode.AUTH)
        }
        val cards = results.mapNotNull { (it as? Outcome.Ok)?.card }
        if (cards.isEmpty()) {
            val failure = results.firstNotNullOfOrNull { (it as? Outcome.Failed)?.error }
            when {
                failure != null -> return ProtocolCodec.encodeError(request, codeOf(failure))
                results.any { it == null } -> return ProtocolCodec.encodeError(request, AckCode.TIMEOUT)
            }
        }
        logger.log("sync ${request.id}: ${cards.size}/${slots.size} cards")
        return ProtocolCodec.encodeSync(request, fr, cards)
    }

    private suspend fun fetch(client: HaClient, k: Int, entityId: String): Outcome =
        try {
            mapper.map(k, client.getState(entityId))?.let { Outcome.Ok(it) } ?: Outcome.Missing
        } catch (e: HaException.NotFound) {
            Outcome.Missing
        } catch (e: HaException) {
            Outcome.Failed(e)
        }

    /**
     * `CALL_SERVICE { k, fr, act? }`: the companion resolves slot `k` of revision `fr`, reads the
     * state, picks the service (unlocking only with `act: "confirm"`), calls it and answers with
     * the entity as Home Assistant reports it afterwards.
     */
    private suspend fun callService(
        request: WatchRequest.CallService,
        settings: CompanionSettings,
        client: HaClient,
        started: Long,
    ): String {
        if (request.fr != CardCodes.favoritesRevision(settings.favorites)) {
            return ProtocolCodec.encodeError(request, AckCode.STALE)
        }
        val entityId = settings.favorites.getOrNull(request.k)
            ?.takeIf { request.k < CompanionSettings.MAX_FAVORITES && mapper.isSupported(it) }
            ?: return refuse(request, "slot")
        val before = try {
            client.getState(entityId)
        } catch (e: HaException.NotFound) {
            return refuse(request, "missing entity")
        }
        return when (val choice = mapper.serviceFor(before, request.confirm)) {
            null -> refuse(request, "domain")
            ServiceChoice.NeedsConfirm -> ProtocolCodec.encodeError(request, AckCode.CONFIRM)
            ServiceChoice.AlreadyDone -> ProtocolCodec.encodeAck(request, mapper.map(request.k, before))
            is ServiceChoice.Call -> {
                val calledAt = now()
                // Only entity_id is forwarded: it keeps the watch from smuggling service data (e.g. a lock code).
                val changed = client.callService(before.domain, choice.service, mapOf("entity_id" to entityId))
                val after = settle(client, entityId, before, changed.firstOrNull { it.entityId == entityId }, calledAt, started)
                ProtocolCodec.encodeAck(request, after?.let { mapper.map(request.k, it) })
            }
        }
    }

    /**
     * The entity after the call: from HA's own response when it already shows the new final state,
     * otherwise read again every [settleIntervalMillis] for [settleWindowMillis] at most (and never
     * past the reply deadline). Returns the last state read, possibly still transient (the watch
     * shows it as "en cours"), or null when nothing could be read back.
     */
    private suspend fun settle(
        client: HaClient,
        entityId: String,
        before: HaState,
        reported: HaState?,
        calledAt: Long,
        started: Long,
    ): HaState? {
        var latest = reported ?: read(client, entityId, remaining(started)) ?: return null
        val end = minOf(calledAt + settleWindowMillis, started + deadlineMillis - REPLY_MARGIN_MILLIS)
        while (!settled(before, latest) && now() + settleIntervalMillis < end) {
            delay(settleIntervalMillis)
            latest = read(client, entityId, end - now()) ?: break
        }
        return latest
    }

    private fun settled(before: HaState, latest: HaState): Boolean =
        latest.state != before.state && latest.state !in EntityCardMapper.TRANSIENT_STATES

    /** A read that may fail without failing the action (the service call already succeeded). */
    private suspend fun read(client: HaClient, entityId: String, budgetMillis: Long): HaState? =
        if (budgetMillis <= 0) {
            null
        } else {
            try {
                withTimeoutOrNull(budgetMillis) { client.getState(entityId) }
            } catch (e: HaException) {
                null
            }
        }

    private fun remaining(started: Long): Long = started + deadlineMillis - REPLY_MARGIN_MILLIS - now()

    private fun refuse(request: WatchRequest, reason: String): String {
        logger.log("refused ${request.id}: $reason")
        return ProtocolCodec.encodeError(request, AckCode.DENIED)
    }

    private fun now(): Long = System.nanoTime() / 1_000_000

    private sealed interface Outcome {
        data class Ok(val card: Card) : Outcome
        data object Missing : Outcome
        data class Failed(val error: HaException) : Outcome
    }

    companion object {
        /** The watch times out at 8 s; keep ~1.5 s for the Bluetooth round trip. */
        const val DEFAULT_DEADLINE_MILLIS = 6_500L
        const val DEFAULT_MAX_PARALLEL = 4
        const val DEFAULT_SETTLE_INTERVAL_MILLIS = 500L
        const val DEFAULT_SETTLE_WINDOW_MILLIS = 5_000L

        /** Time kept after the last read to encode and send the reply before the deadline. */
        private const val REPLY_MARGIN_MILLIS = 200L

        /** `ACK.code` of a Home Assistant failure. */
        fun codeOf(e: HaException): String = when (e) {
            is HaException.Unauthorized, is HaException.InvalidToken -> AckCode.AUTH
            else -> AckCode.HA
        }
    }
}

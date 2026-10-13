package io.github.theogallandeng.hawatch.companion.core.ha

import java.io.IOException
import java.io.InterruptedIOException
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import okhttp3.Call
import okhttp3.Callback
import okhttp3.ConnectionPool
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response

/**
 * OkHttp implementation of [HaClient].
 *
 * - The token only ever goes into the `Authorization` header. There is deliberately **no logging
 *   interceptor**, and failures are mapped to [HaException] without the raw exception message
 *   (which could contain the host).
 * - Calls are cancellable: cancelling the coroutine cancels the HTTP call (used by the sync deadline).
 */
class OkHttpHaClient(
    private val baseUrl: HttpUrl,
    private val token: String,
    private val http: OkHttpClient,
) : HaClient {

    override suspend fun checkApi() {
        get(url("api/"))
    }

    override suspend fun getStates(): List<HaState> =
        decode { json.decodeFromString(ListSerializer(HaState.serializer()), get(url("api/states"))) }

    override suspend fun getState(entityId: String): HaState {
        val body = get(url("api/states").newBuilder().addPathSegment(entityId).build())
        return decode { json.decodeFromString(HaState.serializer(), body) }
    }

    override suspend fun callService(domain: String, service: String, data: Map<String, String>): List<HaState> {
        val url = url("api/services").newBuilder().addPathSegment(domain).addPathSegment(service).build()
        val body = JsonObject(data.mapValues { JsonPrimitive(it.value) }).toString()
        val reply = execute(request(url).post(body.toRequestBody(JSON_MEDIA_TYPE)).build())
        // The call succeeded: an unexpected body only means "no changed states to report".
        return try {
            json.decodeFromString(ListSerializer(HaState.serializer()), reply)
        } catch (e: IllegalArgumentException) {
            emptyList()
        }
    }

    private suspend fun get(url: HttpUrl): String = execute(request(url).get().build())

    private fun url(pathSegments: String): HttpUrl = baseUrl.newBuilder().addPathSegments(pathSegments).build()

    private fun request(url: HttpUrl): Request.Builder =
        try {
            Request.Builder()
                .url(url)
                .header("Authorization", "Bearer $token")
                .header("Accept", "application/json")
        } catch (e: IllegalArgumentException) { // OkHttp rejects non-ASCII header values (message is redacted)
            throw HaException.InvalidToken()
        }

    private inline fun <T> decode(block: () -> T): T =
        try {
            block()
        } catch (e: IllegalArgumentException) { // SerializationException extends it
            throw HaException.BadResponse()
        }

    /** Returns the body of a 2xx response, or throws the matching [HaException]. */
    private suspend fun execute(request: Request): String = suspendCancellableCoroutine { cont ->
        val call = http.newCall(request)
        cont.invokeOnCancellation { call.cancel() }
        call.enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                cont.resumeWithException(mapIoException(e))
            }

            override fun onResponse(call: Call, response: Response) {
                val outcome = try {
                    response.use { Result.success(readBody(it)) }
                } catch (e: HaException) {
                    Result.failure(e)
                } catch (e: IOException) {
                    Result.failure(mapIoException(e))
                }
                outcome.fold({ cont.resume(it) }, { cont.resumeWithException(it) })
            }
        })
    }

    private fun readBody(response: Response): String {
        val code = response.code
        return when {
            code in 200..299 -> response.body?.string().orEmpty()
            code == 401 || code == 403 -> throw HaException.Unauthorized(code)
            code == 404 -> throw HaException.NotFound()
            else -> throw HaException.Http(code)
        }
    }

    private fun mapIoException(e: IOException): HaException =
        if (e is InterruptedIOException) HaException.Timeout() else HaException.Unreachable()

    companion object {
        private val JSON_MEDIA_TYPE = "application/json".toMediaType()

        private val json = Json { ignoreUnknownKeys = true }

        /**
         * Shared client. Timeouts keep every HA call well inside the watch's 8 s budget. The pool keeps
         * at most 2 idle sockets for 60 s (enough to reuse a connection within one watch session, e.g.
         * action → refresh), then closes them so nothing stays open in the background.
         */
        fun defaultHttpClient(): OkHttpClient =
            OkHttpClient.Builder()
                .connectTimeout(3, TimeUnit.SECONDS)
                .readTimeout(4, TimeUnit.SECONDS)
                .writeTimeout(4, TimeUnit.SECONDS)
                .callTimeout(5, TimeUnit.SECONDS)
                .connectionPool(ConnectionPool(2, 60, TimeUnit.SECONDS))
                .retryOnConnectionFailure(true)
                .build()

        fun factory(http: OkHttpClient = defaultHttpClient()): HaClientFactory =
            HaClientFactory { baseUrl, token ->
                val url = baseUrl.toHttpUrlOrNull() ?: throw HaException.Unreachable()
                OkHttpHaClient(url, token, http)
            }
    }
}

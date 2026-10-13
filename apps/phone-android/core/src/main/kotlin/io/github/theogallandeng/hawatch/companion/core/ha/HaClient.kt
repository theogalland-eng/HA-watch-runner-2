package io.github.theogallandeng.hawatch.companion.core.ha

/**
 * Home Assistant REST API, called **only on demand** (never polled). All methods throw [HaException].
 */
interface HaClient {
    /** `GET /api/` — validates base URL + token ("Test connection"). */
    suspend fun checkApi()

    /** `GET /api/states` — full list, used only by the favorites picker. */
    suspend fun getStates(): List<HaState>

    /** `GET /api/states/<entity_id>` — throws [HaException.NotFound] when the entity does not exist. */
    suspend fun getState(entityId: String): HaState

    /**
     * `POST /api/services/<domain>/<service>` with [data] as the JSON body. Returns the states Home
     * Assistant reports as changed during the call (empty when it reports none or the body is not
     * the expected list).
     */
    suspend fun callService(domain: String, service: String, data: Map<String, String>): List<HaState>
}

fun interface HaClientFactory {
    fun create(baseUrl: String, token: String): HaClient
}

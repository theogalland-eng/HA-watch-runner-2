package io.github.theogallandeng.hawatch.companion.core.ha

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** Subset of a Home Assistant state object (`GET /api/states[/<entity_id>]`). */
@Serializable
data class HaState(
    @SerialName("entity_id") val entityId: String,
    val state: String,
    val attributes: JsonObject = JsonObject(emptyMap()),
) {
    val domain: String get() = entityId.substringBefore('.')

    val friendlyName: String?
        get() = (attributes["friendly_name"] as? JsonPrimitive)?.takeIf { it.isString }?.content?.takeIf { it.isNotBlank() }
}

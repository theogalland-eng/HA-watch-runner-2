package io.github.theogallandeng.hawatch.companion.core.mapping

import io.github.theogallandeng.hawatch.companion.core.protocol.EntityAction

/**
 * Per-domain HA semantics. **Extension point:** supporting a new domain (cover, fan, input_boolean,
 * scene…) means adding one implementation to [EntityCardMapper.DEFAULT_MAPPERS] (+ labels if needed).
 * The watch stays presentation-only and needs no change for that.
 */
interface DomainMapper {
    val domain: String

    /** Services the watch may call for this domain (guard for `CALL_SERVICE`). */
    val allowedServices: Set<String>

    /** The main tap action for an entity in [state]. */
    fun primaryAction(entityId: String, state: String, labels: ActionLabels): EntityAction
}

/** Binary on/off domains: `light`, `switch` (and later e.g. `fan`, `input_boolean`). */
class OnOffDomainMapper(override val domain: String) : DomainMapper {
    override val allowedServices: Set<String> = setOf("turn_on", "turn_off", "toggle")

    // Explicit turn_on/turn_off rather than toggle: idempotent if the watch shows a stale state.
    override fun primaryAction(entityId: String, state: String, labels: ActionLabels): EntityAction =
        when (state) {
            "on" -> serviceAction(domain, "turn_off", labels.turnOff(), entityId)
            "off" -> serviceAction(domain, "turn_on", labels.turnOn(), entityId)
            else -> serviceAction(domain, "toggle", labels.toggle(), entityId) // unavailable / unknown
        }
}

/**
 * `lock`. Home Assistant has **no `lock.toggle` service**, so the action depends on the state.
 * `lock.open` (unlatch) is deliberately not exposed to the watch.
 */
class LockDomainMapper : DomainMapper {
    override val domain: String = "lock"
    override val allowedServices: Set<String> = setOf("lock", "unlock")

    override fun primaryAction(entityId: String, state: String, labels: ActionLabels): EntityAction =
        if (state == "locked") serviceAction(domain, "unlock", labels.unlock(), entityId)
        else serviceAction(domain, "lock", labels.lock(), entityId) // unlocked, jammed, open, unknown…
}

internal fun serviceAction(domain: String, service: String, label: String, entityId: String): EntityAction =
    EntityAction(label = label, domain = domain, service = service, data = mapOf("entity_id" to entityId))

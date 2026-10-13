package io.github.theogallandeng.hawatch.companion.core.mapping

import io.github.theogallandeng.hawatch.companion.core.ha.HaState
import io.github.theogallandeng.hawatch.companion.core.protocol.EntityCard

/** Maps Home Assistant states to the watch's [EntityCard]s, keeping messages short. */
class EntityCardMapper(
    private val labels: ActionLabels = DefaultActionLabels,
    mappers: List<DomainMapper> = DEFAULT_MAPPERS,
) {
    private val byDomain: Map<String, DomainMapper> = mappers.associateBy { it.domain }

    val supportedDomains: Set<String> get() = byDomain.keys

    fun isSupported(entityId: String): Boolean = isValidEntityId(entityId) && domainOf(entityId) in byDomain

    /** Returns null for unsupported domains. */
    fun map(state: HaState): EntityCard? {
        val mapper = byDomain[state.domain] ?: return null
        return EntityCard(
            entityId = state.entityId,
            domain = state.domain,
            name = (state.friendlyName ?: state.entityId.substringAfter('.')).take(MAX_NAME_LENGTH),
            state = state.state,
            icon = null, // the watch picks a local icon per domain; mdi:* names are useless there
            primary = mapper.primaryAction(state.entityId, state.state, labels),
            secondary = emptyList(), // short messages: the state-dependent primary action is enough
        )
    }

    /** `CALL_SERVICE` guard: [service] must be allowed for the entity's own domain. */
    fun isAllowed(domain: String, service: String, entityId: String): Boolean {
        if (!isSupported(entityId) || domainOf(entityId) != domain) return false
        return service in (byDomain[domain]?.allowedServices ?: emptySet())
    }

    companion object {
        val DEFAULT_MAPPERS: List<DomainMapper> =
            listOf(OnOffDomainMapper("light"), OnOffDomainMapper("switch"), LockDomainMapper())

        const val MAX_NAME_LENGTH = 40

        private val ENTITY_ID = Regex("^[a-z0-9_]+\\.[a-z0-9_]+$")

        fun isValidEntityId(entityId: String): Boolean = ENTITY_ID.matches(entityId)

        fun domainOf(entityId: String): String = entityId.substringBefore('.')
    }
}

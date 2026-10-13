package io.github.theogallandeng.hawatch.companion.core.mapping

import io.github.theogallandeng.hawatch.companion.core.ha.HaState
import io.github.theogallandeng.hawatch.companion.core.protocol.Card
import io.github.theogallandeng.hawatch.companion.core.protocol.CardCodes

/** Maps Home Assistant states to the watch's compact v2 [Card]s and picks the service of an action. */
class EntityCardMapper(mappers: List<DomainMapper> = DEFAULT_MAPPERS) {
    private val byDomain: Map<String, DomainMapper> = mappers.associateBy { it.domain }

    val supportedDomains: Set<String> get() = byDomain.keys

    fun isSupported(entityId: String): Boolean = isValidEntityId(entityId) && domainOf(entityId) in byDomain

    /** Card for favorite slot [k]; null for unsupported domains. */
    fun map(k: Int, state: HaState): Card? {
        if (state.domain !in byDomain) return null
        return CardCodes.card(k, state.domain, state.friendlyName ?: state.entityId.substringAfter('.'), state.state)
    }

    fun serviceFor(state: HaState, confirmed: Boolean): ServiceChoice? =
        byDomain[state.domain]?.serviceFor(state.state, confirmed)

    companion object {
        val DEFAULT_MAPPERS: List<DomainMapper> =
            listOf(OnOffDomainMapper("light"), OnOffDomainMapper("switch"), LockDomainMapper())

        /** States where the device is still moving: an action keeps reading until they settle. */
        val TRANSIENT_STATES: Set<String> = setOf("locking", "unlocking", "opening", "closing")

        private val ENTITY_ID = Regex("^[a-z0-9_]+\\.[a-z0-9_]+$")

        fun isValidEntityId(entityId: String): Boolean = ENTITY_ID.matches(entityId)

        fun domainOf(entityId: String): String = entityId.substringBefore('.')
    }
}

package io.github.theogallandeng.hawatch.companion.core.mapping

/**
 * Per-domain HA semantics. In protocol v2 the watch only says "act on slot k" (plus
 * `act: "confirm"` to unlock); the companion picks the service from the entity's current state.
 * **Extension point:** a new domain (cover, fan, scene…) is one implementation added to
 * [EntityCardMapper.DEFAULT_MAPPERS], plus its code in `CardCodes` and in `docs/p2p-protocol.md`.
 */
interface DomainMapper {
    val domain: String

    /** What to do for an entity currently in [state]; [confirmed] = `act: "confirm"`. */
    fun serviceFor(state: String, confirmed: Boolean): ServiceChoice
}

sealed interface ServiceChoice {
    data class Call(val service: String) : ServiceChoice

    /** Unlocking without the watch's confirmation: refused with `ACK.code = "confirm"`. */
    data object NeedsConfirm : ServiceChoice

    /** Already in the confirmed target state: no call, the current card is returned. */
    data object AlreadyDone : ServiceChoice
}

/** Binary on/off domains: `light`, `switch` (and later e.g. `fan`, `input_boolean`). */
class OnOffDomainMapper(override val domain: String) : DomainMapper {
    // Explicit turn_on/turn_off from the state just read; toggle only when the state is unknown.
    override fun serviceFor(state: String, confirmed: Boolean): ServiceChoice = when (state) {
        "on" -> ServiceChoice.Call("turn_off")
        "off" -> ServiceChoice.Call("turn_on")
        else -> ServiceChoice.Call("toggle")
    }
}

/**
 * `lock`. Home Assistant has **no `lock.toggle` service**. Unlocking always needs the watch's
 * confirmation (`act: "confirm"`); locking never does. `lock.open` (unlatch) is never used.
 */
class LockDomainMapper : DomainMapper {
    override val domain: String = "lock"

    override fun serviceFor(state: String, confirmed: Boolean): ServiceChoice = when {
        confirmed && (state == "unlocked" || state == "open") -> ServiceChoice.AlreadyDone
        confirmed -> ServiceChoice.Call("unlock")
        state == "locked" -> ServiceChoice.NeedsConfirm
        else -> ServiceChoice.Call("lock")
    }
}

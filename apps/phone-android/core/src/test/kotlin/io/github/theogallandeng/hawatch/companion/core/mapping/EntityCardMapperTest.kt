package io.github.theogallandeng.hawatch.companion.core.mapping

import io.github.theogallandeng.hawatch.companion.core.haState
import io.github.theogallandeng.hawatch.companion.core.protocol.Card
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class EntityCardMapperTest {

    private val mapper = EntityCardMapper()

    private fun s(entityId: String, state: String) = mapper.map(4, haState(entityId, state, "X"))!!.s

    @Test
    fun `cards carry the slot, the domain code, the name and the state code`() {
        assertEquals(Card(4, "l", "Kitchen", "1"), mapper.map(4, haState("light.kitchen", "on", "Kitchen")))
        assertEquals(Card(0, "s", "Router", "0"), mapper.map(0, haState("switch.router", "off", "Router")))
        assertEquals("x", s("light.a", "unavailable"))
        assertEquals("?", s("switch.a", "unknown"))
    }

    @Test
    fun `lock states, including the transient and unusual ones`() {
        val expected = mapOf(
            "locked" to "L", "unlocked" to "U", "locking" to "g", "unlocking" to "h", "jammed" to "j",
            "open" to "U", "opening" to "h", "unavailable" to "x", "something" to "?",
        )
        for ((state, code) in expected) assertEquals(state, code, s("lock.door", state))
    }

    @Test
    fun `name falls back to the object id and unsupported domains are ignored`() {
        assertEquals("front_door", mapper.map(1, haState("lock.front_door", "locked"))!!.n)
        assertNull(mapper.map(1, haState("climate.house", "heat", "Clim")))
        assertFalse(mapper.isSupported("climate.house"))
        assertFalse(mapper.isSupported("light.Bad-Id"))
        assertTrue(mapper.isSupported("light.kitchen"))
    }

    @Test
    fun `the companion picks the service from the state and unlocking needs the confirmation`() {
        fun choice(id: String, state: String, confirmed: Boolean = false) = mapper.serviceFor(haState(id, state), confirmed)
        assertEquals(ServiceChoice.Call("turn_off"), choice("light.a", "on"))
        assertEquals(ServiceChoice.Call("turn_on"), choice("switch.a", "off"))
        assertEquals(ServiceChoice.Call("toggle"), choice("light.a", "unavailable"))
        assertEquals(ServiceChoice.NeedsConfirm, choice("lock.a", "locked"))
        assertEquals(ServiceChoice.Call("unlock"), choice("lock.a", "locked", confirmed = true))
        assertEquals(ServiceChoice.Call("lock"), choice("lock.a", "unlocked"))
        assertEquals(ServiceChoice.Call("lock"), choice("lock.a", "jammed"))
        assertEquals(ServiceChoice.AlreadyDone, choice("lock.a", "unlocked", confirmed = true))
        assertEquals(ServiceChoice.AlreadyDone, choice("lock.a", "open", confirmed = true))
        assertNull(choice("climate.a", "heat"))
    }

    @Test
    fun `new domains plug in through the mapper registry`() {
        val cover = object : DomainMapper {
            override val domain = "cover"
            override fun serviceFor(state: String, confirmed: Boolean) =
                ServiceChoice.Call(if (state == "open") "close_cover" else "open_cover")
        }
        val m = EntityCardMapper(EntityCardMapper.DEFAULT_MAPPERS + cover)
        assertEquals(Card(6, "c", "Volet", "o"), m.map(6, haState("cover.volet", "open", "Volet")))
        assertEquals(ServiceChoice.Call("close_cover"), m.serviceFor(haState("cover.volet", "open"), false))
    }
}

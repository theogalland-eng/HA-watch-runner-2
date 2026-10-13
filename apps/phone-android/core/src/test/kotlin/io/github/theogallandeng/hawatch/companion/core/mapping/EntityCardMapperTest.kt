package io.github.theogallandeng.hawatch.companion.core.mapping

import io.github.theogallandeng.hawatch.companion.core.ha.HaState
import io.github.theogallandeng.hawatch.companion.core.protocol.EntityAction
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class EntityCardMapperTest {

    private val mapper = EntityCardMapper(DefaultActionLabels)

    private fun state(entityId: String, state: String, friendlyName: String? = null) = HaState(
        entityId = entityId,
        state = state,
        attributes = JsonObject(friendlyName?.let { mapOf("friendly_name" to JsonPrimitive(it)) } ?: emptyMap()),
    )

    private fun action(domain: String, service: String, label: String, entityId: String) =
        EntityAction(label = label, domain = domain, service = service, data = mapOf("entity_id" to entityId))

    @Test
    fun `light on maps to a turn_off primary action`() {
        val card = mapper.map(state("light.kitchen", "on", "Kitchen"))!!
        assertEquals("light.kitchen", card.entityId)
        assertEquals("light", card.domain)
        assertEquals("Kitchen", card.name)
        assertEquals("on", card.state)
        assertNull(card.icon)
        assertEquals(action("light", "turn_off", "Turn off", "light.kitchen"), card.primary)
        assertTrue(card.secondary.isEmpty())
    }

    @Test
    fun `light off maps to turn_on, unavailable to toggle`() {
        assertEquals(action("light", "turn_on", "Turn on", "light.k"), mapper.map(state("light.k", "off"))!!.primary)
        assertEquals(action("light", "toggle", "Toggle", "light.k"), mapper.map(state("light.k", "unavailable"))!!.primary)
    }

    @Test
    fun `switch follows the same on-off rules`() {
        assertEquals(action("switch", "turn_off", "Turn off", "switch.router"), mapper.map(state("switch.router", "on"))!!.primary)
        assertEquals(action("switch", "turn_on", "Turn on", "switch.router"), mapper.map(state("switch.router", "off"))!!.primary)
        assertEquals(action("switch", "toggle", "Toggle", "switch.router"), mapper.map(state("switch.router", "unknown"))!!.primary)
    }

    @Test
    fun `lock never uses toggle, which does not exist in Home Assistant`() {
        assertEquals(action("lock", "unlock", "Unlock", "lock.front_door"), mapper.map(state("lock.front_door", "locked"))!!.primary)
        for (s in listOf("unlocked", "jammed", "open", "unavailable")) {
            assertEquals(s, action("lock", "lock", "Lock", "lock.front_door"), mapper.map(state("lock.front_door", s))!!.primary)
        }
    }

    @Test
    fun `name falls back to the object id and is length-capped`() {
        assertEquals("front_door", mapper.map(state("lock.front_door", "locked"))!!.name)
        assertEquals("front_door", mapper.map(state("lock.front_door", "locked", "   "))!!.name)
        val long = "x".repeat(100)
        assertEquals(EntityCardMapper.MAX_NAME_LENGTH, mapper.map(state("light.a", "on", long))!!.name.length)
    }

    @Test
    fun `unsupported domains are ignored`() {
        assertNull(mapper.map(state("sensor.temperature", "21.5")))
        assertNull(mapper.map(state("cover.garage", "open")))
        assertFalse(mapper.isSupported("sensor.temperature"))
        assertFalse(mapper.isSupported("not an id"))
        assertTrue(mapper.isSupported("light.kitchen"))
    }

    @Test
    fun `labels are injected (localization happens on the phone)`() {
        val french = object : ActionLabels {
            override fun turnOn() = "Allumer"
            override fun turnOff() = "Éteindre"
            override fun toggle() = "Basculer"
            override fun lock() = "Verrouiller"
            override fun unlock() = "Déverrouiller"
        }
        val card = EntityCardMapper(french).map(state("light.kitchen", "off"))!!
        assertEquals("Allumer", card.primary.label)
    }

    @Test
    fun `service guard allows only the entity's own domain and its known services`() {
        assertTrue(mapper.isAllowed("light", "turn_on", "light.kitchen"))
        assertTrue(mapper.isAllowed("switch", "toggle", "switch.router"))
        assertTrue(mapper.isAllowed("lock", "unlock", "lock.front_door"))
        assertFalse("no lock.toggle in HA", mapper.isAllowed("lock", "toggle", "lock.front_door"))
        assertFalse("unlatch not exposed", mapper.isAllowed("lock", "open", "lock.front_door"))
        assertFalse("domain mismatch", mapper.isAllowed("switch", "turn_on", "light.kitchen"))
        assertFalse("unsupported domain", mapper.isAllowed("script", "turn_on", "script.alarm"))
        assertFalse("arbitrary service", mapper.isAllowed("light", "delete_all", "light.kitchen"))
    }

    @Test
    fun `new domains plug in through the mapper registry`() {
        val withFan = EntityCardMapper(DefaultActionLabels, EntityCardMapper.DEFAULT_MAPPERS + OnOffDomainMapper("fan"))
        assertEquals(action("fan", "turn_on", "Turn on", "fan.bedroom"), withFan.map(state("fan.bedroom", "off"))!!.primary)
    }
}

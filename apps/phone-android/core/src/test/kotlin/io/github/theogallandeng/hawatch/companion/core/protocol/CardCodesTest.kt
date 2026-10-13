package io.github.theogallandeng.hawatch.companion.core.protocol

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CardCodesTest {

    /** `docs/p2p-protocol.md`, found from the module directory up to the repository root. */
    private val protocolDoc: String by lazy {
        var dir: File? = File(System.getProperty("user.dir")).absoluteFile
        while (dir != null && !File(dir, "docs/p2p-protocol.md").isFile) dir = dir.parentFile
        File(checkNotNull(dir) { "docs/p2p-protocol.md not found" }, "docs/p2p-protocol.md").readText()
    }

    /** Rows "| `code` | `ha value` | …" of the table under [heading], as ha value → code. */
    private fun docTable(heading: String): Map<String, String> {
        val section = protocolDoc.substringAfter(heading).substringBefore("\n#")
        val row = Regex("""^\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|""", RegexOption.MULTILINE)
        return row.findAll(section).associate { it.groupValues[2] to it.groupValues[1] }
    }

    @Test
    fun `the code tables are the ones of docs-p2p-protocol-md`() {
        assertEquals(CardCodes.DOMAINS, docTable("### Domain codes (`d`)"))
        assertEquals(CardCodes.STATES, docTable("### State codes (`s`)"))
    }

    @Test
    fun `state codes, lock specifics and unknown states`() {
        assertEquals("1", CardCodes.stateCode("light", "on"))
        assertEquals("U", CardCodes.stateCode("lock", "open"))
        assertEquals("h", CardCodes.stateCode("lock", "opening"))
        assertEquals("o", CardCodes.stateCode("cover", "open"))
        assertEquals("?", CardCodes.stateCode("light", "flickering"))
        assertNull(CardCodes.card(0, "climate", "Clim", "heat"))
    }

    @Test
    fun `names and sensor values are cut to their limits in JSON bytes, quotes made plain`() {
        assertEquals("Porte d'entrée", CardCodes.card(0, "lock", "Porte d’entrée", "locked")!!.n)
        assertEquals("Lampe de chevet pare", CardCodes.card(0, "light", "Lampe de chevet parents", "on")!!.n)
        assertEquals("🏠".repeat(10), CardCodes.card(0, "light", "🏠".repeat(20), "on")!!.n) // 40 bytes
        assertEquals("\"".repeat(20), CardCodes.limit("\"".repeat(30), 20, 40)) // 2 JSON bytes each
        assertEquals("\"".repeat(19), CardCodes.limit("\"".repeat(19) + "🏠", 20, 40))
        assertEquals("ab", CardCodes.limit("a\u0000\nb", 20, 40))
        assertEquals("-12345,6 °C", CardCodes.card(0, "sensor", "T", "-12345,6 °C°")!!.s) // 12 bytes; the last ° would be 14
        assertEquals("21,5 °C", CardCodes.card(0, "sensor", "T", "21,5 °C")!!.s)
    }

    @Test
    fun `favorites revision is stable, order-sensitive and fits in 31 bits`() {
        // Golden values, also used by the watch's protocol.js tests (PR 3c).
        assertEquals(55808668L, CardCodes.favoritesRevision(listOf("light.kitchen", "lock.front_door")))
        assertEquals(815892064L, CardCodes.favoritesRevision(listOf("lock.front_door", "light.kitchen")))
        assertEquals(18652613L, CardCodes.favoritesRevision(emptyList()))
        assertNotEquals(CardCodes.favoritesRevision(listOf("light.a")), CardCodes.favoritesRevision(listOf("light.a", "light.b")))
        val many = (0..500).map { CardCodes.favoritesRevision(listOf("light.l$it")) }
        assertTrue(many.all { it in 0..0x7FFFFFFFL })
        assertEquals(many.size, many.toSet().size)
    }
}

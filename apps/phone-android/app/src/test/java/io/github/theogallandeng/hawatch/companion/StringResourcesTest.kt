package io.github.theogallandeng.hawatch.companion

import java.io.File
import javax.xml.parsers.DocumentBuilderFactory
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Every user-facing string exists in EN (default), FR and RU with the same format arguments —
 * including the action labels that are sent to the watch.
 */
class StringResourcesTest {

    private val res = File("src/main/res")

    private fun strings(folder: String): Map<String, String> {
        val doc = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(File(res, "$folder/strings.xml"))
        val nodes = doc.getElementsByTagName("string")
        return (0 until nodes.length).associate { i ->
            val n = nodes.item(i)
            n.attributes.getNamedItem("name").nodeValue to n.textContent
        }
    }

    private fun placeholders(text: String): List<String> = Regex("%\\d+\\$[sd]").findAll(text).map { it.value }.sorted().toList()

    @Test
    fun `all locales define the same keys with the same placeholders`() {
        val base = strings("values")
        assertTrue(base.isNotEmpty())
        for (locale in listOf("values-fr", "values-ru")) {
            val translated = strings(locale)
            assertEquals("keys of $locale", base.keys.sorted(), translated.keys.sorted())
            for ((key, text) in base) {
                assertEquals("placeholders of $locale/$key", placeholders(text), placeholders(translated.getValue(key)))
            }
        }
    }

    @Test
    fun `action labels sent to the watch stay short`() {
        for (locale in listOf("values", "values-fr", "values-ru")) {
            strings(locale).filterKeys { it.startsWith("action_turn") || it == "action_toggle" || it.endsWith("lock") }
                .forEach { (key, label) -> assertTrue("$locale/$key too long: $label", label.length <= 14) }
        }
    }
}

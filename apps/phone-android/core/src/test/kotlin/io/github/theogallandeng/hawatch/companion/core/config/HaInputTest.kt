package io.github.theogallandeng.hawatch.companion.core.config

import io.github.theogallandeng.hawatch.companion.core.config.HaInput.UrlError
import io.github.theogallandeng.hawatch.companion.core.config.HaInput.UrlResult
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class HaInputTest {

    @Test
    fun `https urls are normalized without trailing slash`() {
        assertEquals(UrlResult.Valid("https://ha.example.org:8123"), HaInput.normalizeUrl(" https://ha.example.org:8123/ "))
        assertEquals(UrlResult.Valid("https://ha.example.org"), HaInput.normalizeUrl("https://ha.example.org:443"))
        assertEquals(UrlResult.Valid("https://ha.example.org/sub/path"), HaInput.normalizeUrl("https://HA.example.org/sub/path/"))
    }

    @Test
    fun `missing scheme defaults to https`() {
        assertEquals(UrlResult.Valid("https://ha.example.org:8123"), HaInput.normalizeUrl("ha.example.org:8123"))
    }

    @Test
    fun `clear-text and malformed urls are rejected`() {
        assertEquals(UrlResult.Invalid(UrlError.EMPTY), HaInput.normalizeUrl("  "))
        assertEquals(UrlResult.Invalid(UrlError.NOT_HTTPS), HaInput.normalizeUrl("http://192.168.1.10:8123"))
        assertEquals(UrlResult.Invalid(UrlError.MALFORMED), HaInput.normalizeUrl("ftp://ha.example.org"))
        assertEquals(UrlResult.Invalid(UrlError.MALFORMED), HaInput.normalizeUrl("https://ha.example.org/?x=1"))
        assertEquals(UrlResult.Invalid(UrlError.MALFORMED), HaInput.normalizeUrl("https://user:pw@ha.example.org"))
        assertEquals(UrlResult.Invalid(UrlError.MALFORMED), HaInput.normalizeUrl("https://"))
    }

    @Test
    fun `token is trimmed and a pasted Bearer prefix removed`() {
        assertEquals("abc.def", HaInput.normalizeToken("  Bearer abc.def \n"))
        assertEquals("abc.def", HaInput.normalizeToken("abc.def"))
        assertNull(HaInput.normalizeToken("   "))
        assertNull(HaInput.normalizeToken("abc def"))
    }

    @Test
    fun `settings never print the token`() {
        val s = CompanionSettings("https://ha.example.org", "test-token-value", listOf("light.a"))
        assertEquals(false, s.toString().contains("test-token-value"))
    }
}

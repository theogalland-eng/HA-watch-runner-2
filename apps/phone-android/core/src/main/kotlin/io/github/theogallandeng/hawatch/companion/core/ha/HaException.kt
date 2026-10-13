package io.github.theogallandeng.hawatch.companion.core.ha

/**
 * Typed Home Assistant failures. [watchMessage] is what may be sent to the watch in an `ACK.error`:
 * short, ASCII, and it never contains the token, the URL or a raw exception message.
 */
sealed class HaException(val watchMessage: String) : Exception(watchMessage) {
    /** 401 / 403: missing, revoked or wrong long-lived token. */
    class Unauthorized(val code: Int) : HaException("HA returned $code")

    class NotFound : HaException("HA returned 404")

    class Http(val code: Int) : HaException("HA returned $code")

    class Timeout : HaException("HA timeout")

    class Unreachable : HaException("HA unreachable")

    class BadResponse : HaException("HA bad response")
}

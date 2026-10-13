package io.github.theogallandeng.hawatch.companion.core.bridge

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

/**
 * Glue: watch message → [WatchRequestHandler] → reply on the same transport. Each request runs in its
 * own coroutine in [scope] (use a SupervisorJob), so replies may go out of order — the watch
 * correlates by `id`. Nothing runs between requests: no timer, no polling.
 */
class CompanionBridge(
    private val transport: WatchTransport,
    private val handler: WatchRequestHandler,
    private val scope: CoroutineScope,
    private val logger: CompanionLogger = CompanionLogger.NONE,
) {
    fun start() {
        transport.start { message ->
            scope.launch {
                val reply = handler.handle(message.payload) ?: return@launch
                try {
                    transport.send(message.peer, reply)
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    logger.log("reply failed: ${e.javaClass.simpleName}")
                }
            }
        }
    }

    fun stop() {
        transport.stop()
    }
}

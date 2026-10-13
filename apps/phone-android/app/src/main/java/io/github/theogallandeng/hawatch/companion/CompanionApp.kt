package io.github.theogallandeng.hawatch.companion

import android.app.Application
import android.content.Context
import android.util.Log
import io.github.theogallandeng.hawatch.companion.core.bridge.CompanionLogger
import io.github.theogallandeng.hawatch.companion.core.bridge.WatchRequestHandler
import io.github.theogallandeng.hawatch.companion.core.ha.HaClientFactory
import io.github.theogallandeng.hawatch.companion.core.ha.OkHttpHaClient
import io.github.theogallandeng.hawatch.companion.core.mapping.EntityCardMapper
import io.github.theogallandeng.hawatch.companion.data.AndroidCompanionConfig
import io.github.theogallandeng.hawatch.companion.data.ResourceActionLabels
import io.github.theogallandeng.hawatch.companion.data.SecureTokenStore
import io.github.theogallandeng.hawatch.companion.data.SettingsStore

class CompanionApp : Application() {
    lateinit var graph: AppGraph
        private set

    override fun onCreate() {
        super.onCreate()
        graph = AppGraph(this)
    }
}

/** Manual composition root (no DI framework): one instance per process. */
class AppGraph(context: Context) {
    val settings = SettingsStore(context)
    val tokens = SecureTokenStore(context)
    val config = AndroidCompanionConfig(settings, tokens)

    /** One shared OkHttp client: a single small connection pool for the whole app. */
    val haClientFactory: HaClientFactory = OkHttpHaClient.factory()

    val mapper = EntityCardMapper(ResourceActionLabels(context))

    /** Logs only message types, ids, sizes and error codes — never payload contents or secrets. */
    val logger = CompanionLogger { Log.i(LOG_TAG, it) }

    fun newRequestHandler() = WatchRequestHandler(config, haClientFactory, mapper, logger = logger)

    companion object {
        const val LOG_TAG = "HaCompanion"
    }
}

val Context.appGraph: AppGraph get() = (applicationContext as CompanionApp).graph

package io.github.theogallandeng.hawatch.companion.data

import android.content.Context
import io.github.theogallandeng.hawatch.companion.R
import io.github.theogallandeng.hawatch.companion.core.mapping.ActionLabels

/** Action labels shown on the watch, localized with the phone's language (EN/FR/RU). */
class ResourceActionLabels(context: Context) : ActionLabels {
    private val context = context.applicationContext

    override fun turnOn() = context.getString(R.string.action_turn_on)
    override fun turnOff() = context.getString(R.string.action_turn_off)
    override fun toggle() = context.getString(R.string.action_toggle)
    override fun lock() = context.getString(R.string.action_lock)
    override fun unlock() = context.getString(R.string.action_unlock)
}

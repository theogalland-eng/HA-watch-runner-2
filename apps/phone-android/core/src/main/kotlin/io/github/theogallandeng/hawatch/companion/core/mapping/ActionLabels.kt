package io.github.theogallandeng.hawatch.companion.core.mapping

/**
 * Localized action labels. The watch renders `EntityAction.label` as-is, so the phone localizes it:
 * the Android app implements this with string resources (EN/FR/RU, following the phone's locale).
 */
interface ActionLabels {
    fun turnOn(): String
    fun turnOff(): String
    fun toggle(): String
    fun lock(): String
    fun unlock(): String
}

/** English fallback, also used by tests. */
object DefaultActionLabels : ActionLabels {
    override fun turnOn() = "Turn on"
    override fun turnOff() = "Turn off"
    override fun toggle() = "Toggle"
    override fun lock() = "Lock"
    override fun unlock() = "Unlock"
}

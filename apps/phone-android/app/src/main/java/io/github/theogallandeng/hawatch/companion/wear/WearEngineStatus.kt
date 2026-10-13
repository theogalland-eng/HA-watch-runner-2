package io.github.theogallandeng.hawatch.companion.wear

import android.app.Activity
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import com.huawei.wearengine.HiWear
import com.huawei.wearengine.auth.AuthCallback
import com.huawei.wearengine.auth.Permission
import kotlinx.coroutines.CancellationException

/** One-shot Wear Engine checks for the settings screen (run when the screen opens, never polled). */
object WearEngineStatus {

    const val HEALTH_PACKAGE = "com.huawei.health"

    sealed interface Result<out T> {
        data class Ok<T>(val value: T) : Result<T>
        data class Failed(val code: Int?) : Result<Nothing>
    }

    fun isHealthInstalled(context: Context): Boolean = try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.packageManager.getPackageInfo(HEALTH_PACKAGE, PackageManager.PackageInfoFlags.of(0))
        } else {
            @Suppress("DEPRECATION")
            context.packageManager.getPackageInfo(HEALTH_PACKAGE, 0)
        }
        true
    } catch (e: PackageManager.NameNotFoundException) {
        false
    }

    suspend fun hasDevicePermission(context: Context): Result<Boolean> = attempt {
        HiWear.getAuthClient(context).checkPermission(Permission.DEVICE_MANAGER).await() == true
    }

    /** Name of the first connected watch, or null if none is connected. */
    suspend fun connectedWatchName(context: Context): Result<String?> = attempt {
        HiWear.getDeviceClient(context).bondedDevices.await().orEmpty().firstOrNull { it.isConnected }?.name
    }

    /** Shows Huawei's authorization UI. [onResult] is called with true if DEVICE_MANAGER was granted. */
    fun requestDevicePermission(activity: Activity, onResult: (Boolean) -> Unit) {
        try {
            HiWear.getAuthClient(activity)
                .requestPermission(object : AuthCallback {
                    override fun onOk(permissions: Array<out Permission>?) {
                        onResult(permissions.orEmpty().any { it.name == Permission.DEVICE_MANAGER.name })
                    }

                    override fun onCancel() = onResult(false)
                }, Permission.DEVICE_MANAGER)
                .addOnFailureListener { onResult(false) }
        } catch (e: RuntimeException) { // Wear Engine throws when Huawei Health is missing
            onResult(false)
        }
    }

    private suspend fun <T> attempt(block: suspend () -> T): Result<T> = try {
        Result.Ok(block())
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        Result.Failed(wearErrorCode(e))
    }
}

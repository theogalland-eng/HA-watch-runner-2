package io.github.theogallandeng.hawatch.companion.wear

import com.huawei.hmf.tasks.Task
import com.huawei.wearengine.WearEngineException
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.suspendCancellableCoroutine

/** Suspends until a Huawei `Task` completes. */
internal suspend fun <T> Task<T>.await(): T = suspendCancellableCoroutine { cont ->
    addOnSuccessListener { cont.resume(it) }
    addOnFailureListener { cont.resumeWithException(it) }
}

/** Wear Engine error code (see `WearEngineErrorCode`), or null if [e] is not a Wear Engine failure. */
internal fun wearErrorCode(e: Throwable): Int? = (e as? WearEngineException)?.errorCode

# Huawei Wear Engine SDK: AIDL/binder classes are looked up reflectively by the Huawei Health service.
-keep class com.huawei.wearengine.** { *; }
-keep class com.huawei.hmf.tasks.** { *; }
-dontwarn com.huawei.**

# kotlinx.serialization: keep generated serializers of our protocol models.
-keepattributes *Annotation*, InnerClasses
-keepclassmembers class io.github.theogallandeng.hawatch.companion.core.** {
    *** Companion;
}
-keepclasseswithmembers class io.github.theogallandeng.hawatch.companion.core.** {
    kotlinx.serialization.KSerializer serializer(...);
}

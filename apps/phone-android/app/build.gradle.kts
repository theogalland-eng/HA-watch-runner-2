import java.util.Properties
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

// Per-developer values (watch peer identity, signing) come from local.properties / keystore.properties,
// which are not committed. Gradle properties (-P or gradle.properties) are the fallback.
val localProps = Properties().apply {
    val f = rootProject.file("local.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
fun prop(name: String): String =
    (localProps.getProperty(name) ?: providers.gradleProperty(name).orNull ?: "").trim()

val keystoreProps = Properties().apply {
    val f = rootProject.file("keystore.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

android {
    namespace = "io.github.theogallandeng.hawatch.companion"
    compileSdk = 35
    buildToolsVersion = "35.0.0"

    defaultConfig {
        // The Android package registered with Huawei (AppGallery Connect + Wear Engine): it must match
        // exactly. The Kotlin namespace above stays io.github.theogallandeng.hawatch.companion.
        applicationId = "io.github.theogallandeng.hawatchcompanion"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"

        buildConfigField("String", "WATCH_PEER_PKG", "\"${prop("watchPeerPkg")}\"")
        buildConfigField("String", "WATCH_PEER_FINGERPRINT", "\"${prop("watchPeerFingerprint")}\"")
        // AppGallery Connect app ID: Huawei Health identifies the app with it (Wear Engine error 12 without it).
        manifestPlaceholders["hmsAppId"] = prop("hmsAppId")
    }

    signingConfigs {
        if (keystoreProps.getProperty("storeFile") != null) {
            create("release") {
                storeFile = rootProject.file(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.findByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    packaging {
        resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }
}

kotlin {
    compilerOptions { jvmTarget.set(JvmTarget.JVM_17) }
}

dependencies {
    implementation(project(":core"))

    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    debugImplementation(libs.androidx.compose.ui.tooling)

    implementation(libs.huawei.wearengine)

    testImplementation(libs.junit)
}

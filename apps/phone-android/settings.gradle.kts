pluginManagement {
    repositories {
        google {
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        // Huawei Wear Engine SDK (com.huawei.hms:wearengine) and its com.huawei.hmf:tasks dependency.
        // Filtered so that nothing else is ever resolved from this repository.
        maven("https://developer.huawei.com/repo/") {
            content { includeGroupByRegex("com\\.huawei\\..*") }
        }
    }
}

rootProject.name = "ha-watch-companion"
include(":core", ":app")

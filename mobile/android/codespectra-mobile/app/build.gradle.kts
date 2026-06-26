// app/build.gradle.kts
//
// Minimal Compose-only Android scaffold. Open in Android Studio Hedgehog+
// and let it download the wrapper.
plugins {
  id("com.android.application") version "8.5.0"
  id("org.jetbrains.kotlin.android") version "2.0.0"
  id("org.jetbrains.kotlin.plugin.serialization") version "2.0.0"
}

android {
  namespace = "dev.codespectra.mobile"
  compileSdk = 34

  defaultConfig {
    applicationId = "dev.codespectra.mobile"
    minSdk = 26
    targetSdk = 34
    versionCode = 1
    versionName = "0.1.0"
  }

  buildFeatures { compose = true }
  composeOptions { kotlinCompilerExtensionVersion = "1.5.14" }
  kotlinOptions { jvmTarget = "17" }
  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }
}

dependencies {
  implementation("androidx.activity:activity-compose:1.9.0")
  implementation(platform("androidx.compose:compose-bom:2024.06.00"))
  implementation("androidx.compose.material3:material3")
  implementation("androidx.compose.ui:ui")
  implementation("androidx.compose.ui:ui-tooling-preview")
  implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.2")
  implementation("com.squareup.okhttp3:okhttp:4.12.0")
  implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.3")
  implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.0")
}

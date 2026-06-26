# Android — CodeSpectra Mobile (Jetpack Compose)

Minimal Jetpack Compose scaffold (API 26+) that consumes the public
CodeSpectra certification APIs.

## Open in Android Studio

1. **File → Open** this `codespectra-mobile` directory.
2. Let Gradle sync (`8.5+`, Kotlin `2.0.0+`, AGP `8.5.0+`).
3. Update `ApiClient.API_BASE_URL` to your CodeSpectra deployment.
4. Run on a device or emulator (API 26+).

## What it demonstrates

- MVVM with `ViewModel` + `StateFlow` + `viewModelScope`.
- OkHttp client with an in-memory `CookieJar` (compatible with Better Auth).
- Kotlinx-serialization models matching `/api/certifications`.
- Compose `LazyColumn` list + Material3 `AlertDialog` detail view.

## Next steps (not implemented)

- Sign-in via `androidx.browser.customtabs.CustomTabsIntent` → `/auth/login?from=mobile`.
- QR scanning with `androidx.camera` + ML Kit barcode for certificate verify.
- Persistent cookie jar (`PersistentCookieJar` or DataStore).

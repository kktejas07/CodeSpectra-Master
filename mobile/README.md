# CodeSpectra Mobile Clients

Native mobile scaffolds for **iOS** (SwiftUI) and **Android** (Jetpack
Compose) that consume the chunked CodeSpectra public APIs:

- `GET /api/certifications`              — public catalog
- `GET /api/certifications/verify/{token}` — public certificate verify
- `GET /api/ai-inventory`                — admin AI catalog (requires session cookie)
- `GET /api/ai-inventory/audit`          — admin dependency audit

These are **starter scaffolds**, not full apps. They follow MVVM, render a
simple list and detail view, and demonstrate how to authenticate against
Better Auth from a native client (via the session cookie or a JWT bearer
token, depending on deployment).

## Layout

```
mobile/
├── ios/                  # Xcode/SwiftUI scaffold
│   └── CodeSpectraMobile/
│       ├── CodeSpectraMobileApp.swift
│       ├── Models.swift
│       ├── APIClient.swift
│       └── CertificationsView.swift
└── android/              # Jetpack Compose scaffold (Gradle/Kotlin)
    └── codespectra-mobile/
        ├── app/build.gradle.kts
        └── app/src/main/java/dev/codespectra/mobile/
            ├── MainActivity.kt
            ├── Models.kt
            ├── ApiClient.kt
            └── CertificationsScreen.kt
```

## Quick start

### iOS

1. Open `mobile/ios/CodeSpectraMobile/` in Xcode (use **File → New → Project
   from Existing Sources**, target iOS 16+).
2. Set `API_BASE_URL` in `APIClient.swift` to your CodeSpectra preview/prod URL.
3. Run on the iOS simulator — the app loads `/api/certifications` and
   displays the catalog.

### Android

1. Open `mobile/android/codespectra-mobile` in Android Studio Hedgehog+.
2. Update `API_BASE_URL` in `ApiClient.kt`.
3. Sync Gradle and run on a device or emulator (API 26+).

## Auth strategy

Both clients use cookie-based sessions identical to the web app. For first
launch users tap **Sign in with web** which opens a `SFSafariViewController`
/ `CustomTabsIntent` pointed at `/auth/login?from=mobile`. After successful
sign-in the embedded browser hands the cookie back to the app's
shared cookie jar — no client-secret handling required.

Token-based auth (Bearer header) is supported as a fallback: set
`BETTER_AUTH_BEARER_TOKEN` in the build config and uncomment the bearer
header line in `APIClient.swift` / `ApiClient.kt`.

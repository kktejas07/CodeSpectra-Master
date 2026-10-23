# CodeSpectra Android + iOS app (Capacitor)

A native Android shell around the live web app. The WebView loads the site
(`server.url`), so every web release ships to the app instantly; the shell adds
what a browser can't do. It sits next to the Expo app in `mobile/` (see
"Decisions" below).

| Capability | Native side | Web side |
| --- | --- | --- |
| Push (FCM) | `@capacitor/push-notifications`, channel `general`, small icon | `lib/native-bridge.ts` `registerNativePush()` → existing `POST /api/notifications/push-token {platform:'android'}`; server already sends FCM to native tokens (`lib/push-notifications.ts`) |
| Notification tap / App Links | `MainActivity` + `DeepLinks.java` open FCM `data.link` (site path) or `https://<host>/…` | `app/.well-known/assetlinks.json/route.ts` (built from settings, 404 until set) |
| Biometric unlock | `@aparajita/capacitor-biometric-auth` (STRONG only) + `@aparajita/capacitor-secure-storage` (Android Keystore) | `offerBiometricUnlock` / `biometricUnlock`; `POST /api/mobile/session` (enroll / unlock / revoke, rotating device-bound refresh token, hash-only storage) |
| Proctored lockdown | `CodeSpectraNativePlugin`: screen pinning (`startLockTask`), `FLAG_SECURE`, hide overlays (31+), screenshot (34+) / screen-recording (35+) callbacks, external displays, multi-window, app background, focus loss, obscured touches, back disabled | `components/integrity/IntegrityMonitor.tsx` starts it when the test's **Full screen** signal is on and stops it on submit/unmount; events → `/api/integrity/events` (mapped types) and `/api/proctor/events` (`native_*`) |
| Device integrity | Play Integrity (`com.google.android.play:integrity`), classic request with server nonce | `GET/POST /api/mobile/integrity` → Google `decodeIntegrityToken` → `mobile_device_trust` (24 h) + `device_integrity_<trust>` on the attempt's proctor timeline. A signal only. |
| Downloads | `DownloadHelper`: same-host files fetched with the WebView cookies → share sheet; `blob:` URLs read in-page | `saveOrShareBlob()` for files built in the page |
| Offline | `server.errorPath` → `www/offline.html` (en/hi/te, retry) on first launch without network; after that the PWA service worker serves offline pages | — |
| Splash, icons, bars | Android 12 splash API, adaptive + themed (monochrome) icons from `mobile/assets`, edge-to-edge with native insets; bar icons follow the site theme | `NativeAppMount` → `setSystemBarTheme` |

## Build

Requires Node 22, JDK 21, Android SDK (platform 36, build-tools 36).

```bash
cd mobile/capacitor
npm ci
npm test                         # flavour-config script tests (node --test)
npm run sync                     # cap sync android + per-flavour configs
cd android
./gradlew testProdDebugUnitTest  # DeepLinks JVM tests
./gradlew assembleDevDebug       # or assembleStagingDebug / assembleProdDebug
```

Flavours (`android/app/build.gradle` + `scripts/flavor-configs.mjs`):

| Flavour | applicationId | Site |
| --- | --- | --- |
| `dev` | `ai.codespectra.app.dev` | `CS_DEV_URL` (default `https://dev.codespectra.ai`) |
| `staging` | `ai.codespectra.app.staging` | `CS_STAGING_URL` (default `https://staging.codespectra.ai`) |
| `prod` | `ai.codespectra.app` | `https://codespectra.ai` |

Versioning: `versionName` = `package.json` version (or `CS_VERSION_NAME`),
`versionCode` = `CS_VERSION_CODE` (CI uses the run number). Bump
`package.json` for each store release.

Release signing comes only from the environment: `CS_KEYSTORE_PATH`,
`CS_KEYSTORE_PASSWORD`, `CS_KEY_ALIAS`, `CS_KEY_PASSWORD`. Keystores and
`google-services.json` are git-ignored. CI: `.github/workflows/android.yml`
(manual dispatch; debug APK always, signed release AAB when the secrets exist).

Pinned versions: Capacitor 8.5.3 and plugins are exact in `package.json` +
`package-lock.json`; Play Integrity `1.4.0` in `android/variables.gradle`.

## Owner setup (once)

1. **Firebase (push)** — in the Firebase project the web app already uses,
   add three Android apps (`ai.codespectra.app`, `.staging`, `.dev`), download
   one `google-services.json` (it lists all three) and save it base64-encoded
   as the GitHub secret `ANDROID_GOOGLE_SERVICES_JSON_B64`. The server side
   already sends FCM with the existing `FIREBASE_*` admin credentials.
2. **Signing key** — create an upload key
   (`keytool -genkeypair -v -keystore upload.jks -keyalg RSA -keysize 4096 -validity 10000 -alias upload`),
   keep it in your password manager, and add the secrets
   `ANDROID_KEYSTORE_B64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
   `ANDROID_KEY_PASSWORD`. Enrol in **Play App Signing** when creating the app.
3. **Play Console** — create the app (`ai.codespectra.app`), upload the first
   AAB to Internal testing, then fill the listing with
   [`docs/PLAY_STORE.md`](docs/PLAY_STORE.md).
4. **App Links** — from Play Console → *Test and release → App integrity →
   App signing*, copy the **App signing key** SHA-256 (`AA:BB:…`) into
   Admin → server secrets `android_sha256_cert_fingerprints` (env
   `ANDROID_SHA256_CERT_FINGERPRINTS`, comma-separated; add the upload key's
   too if you sideload release builds). `/.well-known/assetlinks.json` is built
   from it plus `android_package_names` and returns 404 until it is set. Verify with
   `adb shell pm get-app-links ai.codespectra.app`.
5. **Play Integrity** — Play Console → *App integrity → Play Integrity API*:
   link a Google Cloud project and enable the API there. In that project
   create a service account (no roles needed) and a JSON key, then in
   Admin → server secrets set:
   - `play_integrity_service_account_json` — the JSON key (secret, encrypted at rest)
   - `android_package_names` — `ai.codespectra.app,ai.codespectra.app.staging,ai.codespectra.app.dev`
   - `android_cert_sha256` — optional, the app-signing SHA-256 as base64url
     (as Play reports it in `certificateSha256Digest`)

   (env fallbacks: `PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON`, `ANDROID_PACKAGE_NAMES`,
   `ANDROID_CERT_SHA256`.) Optionally put the Cloud project number in the
   `ANDROID_PLAY_CLOUD_PROJECT_NUMBER` secret. Without these the endpoint answers
   503 and the app simply skips the check.

## Notes and limits

- **Lockdown strength.** Without a device-owner (MDM) policy Android only
  offers *screen pinning*: the candidate confirms it, and can leave it by
  holding Back + Overview — that is reported (`lock_task_exit`), not
  prevented. `FLAG_SECURE` blocks screenshots/recording of the app for real.
- **Biometric gate** is enforced by the app (the token is read only after a
  STRONG biometric check), not cryptographically bound to the biometric.
  Sign-out, password change and "sign out everywhere" revoke it; a replayed
  (rotated) token revokes the device. Follow-up if needed: a Keystore key with
  `setUserAuthenticationRequired(true)` wrapping the token.
- **Google / GitHub sign-in** pages open outside the WebView (Google blocks
  OAuth in WebViews). Email + password, email code and face sign-in work in the
  app; social sign-in needs a Custom Tabs + App Link return flow (follow-up).
- **Payment pages** of other hosts (PhonePe / Razorpay / Stripe) open in the
  browser. See the Play billing note in `docs/PLAY_STORE.md`.
- The shell identifies itself with `CodeSpectraAndroid/1` in the user agent.

## iOS

`ios/` was generated with `npx cap add ios --packagemanager SPM` (Capacitor
iOS **8.5.3**, same as Android; no CocoaPods). Plugins come in through
`ios/App/CapApp-SPM/Package.swift` (managed by `cap sync`, don't edit);
Firebase Messaging **11.15.0** is a Swift package on the App target. Needs
macOS + Xcode 16+; nothing here was compiled on Linux — the first Mac /
CI build is the compile check.

```bash
cd mobile/capacitor
npm ci && npx cap sync ios
npx cap open ios                       # Xcode: pick your team, run on a device
```

| Capability | Native side (`ios/App/App/`) | Web / server side |
| --- | --- | --- |
| Push (APNs via FCM) | `AppDelegate`: Firebase turns the APNs token into an FCM token → push plugin `registration` | `registerNativePush()` → `POST /api/notifications/push-token {platform:'ios'}`; server sends FCM as for Android (+ `apns` sound); tap → `data.link` opened by the bridge |
| Face ID / Touch ID unlock | `@aparajita/capacitor-biometric-auth` (LocalAuthentication) + `@aparajita/capacitor-secure-storage` (Keychain, *when unlocked, this device only*); `NSFaceIDUsageDescription` | same `/api/mobile/session` flow as Android |
| Universal Links | `App.entitlements` (`applinks:` / `webcredentials:codespectra.ai`), `SceneDelegate` → `CodeSpectraViewController.open` (same-host only, `DeepLinks.swift`) | `app/.well-known/apple-app-site-association/route.ts` (built from `apple_team_id` + `ios_bundle_ids`, 404 until set) |
| Proctored lockdown | `CodeSpectraNativePlugin`: Guided Access request / instructions + state (`lock_task_exit` / `lock_task_declined`), `UIScreen.isCaptured` (recording / mirroring → `screen_recording` + cover), `userDidTakeScreenshotNotification` (`screenshot`), external screens, background / focus loss, app-switcher cover | unchanged `IntegrityMonitor` → `/api/integrity/events` + `/api/proctor/events` (`meta.source: ios`) |
| Device integrity | App Attest (attest once, then assertions); DeviceCheck when App Attest is unsupported | `POST /api/mobile/integrity {platform:'ios'}` → `lib/mobile/app-attest.ts` (chain to Apple's App Attestation root, nonce, App ID, counter; DeviceCheck server API) → `mobile_device_trust` |
| Purchases | `CS_IAP_ENABLED` build setting (default `NO`) | purchase buttons hidden in the app — [`docs/IN_APP_PURCHASES.md`](docs/IN_APP_PURCHASES.md) |
| Files, status bar, offline | share sheet (`shareFile`), status bar follows theme, `www/offline.html` | — |

Limits: iOS can't block screenshots (they are reported) and can't force
single-app mode outside supervised (MDM) devices — Guided Access is requested
and its absence is reported, not enforced. Google sign-in opens in Safari as
on Android. There are no dev / staging flavours on iOS yet (prod URL only).

CI: `.github/workflows/ios.yml` (manual; simulator build always, TestFlight
via fastlane when secrets exist). Store listing: [`docs/APP_STORE.md`](docs/APP_STORE.md).

### iOS owner setup (once)

1. **Team id** — Apple Developer → Membership → Team ID: GitHub secret
   `APPLE_TEAM_ID`, and Admin → server secrets `apple_team_id` (or the
   `APPLE_TEAM_ID` env on the web server) — `/.well-known/apple-app-site-association`
   is generated from it.
2. **Identifier** `ai.codespectra.app` with Push Notifications, Associated
   Domains, App Attest.
3. **APNs key** (.p8) → upload in Firebase (Cloud Messaging → Apple app
   configuration); add the iOS app in Firebase and save
   `GoogleService-Info.plist` base64 as `IOS_GOOGLE_SERVICE_INFO_PLIST_B64`.
4. **App Store Connect API key** (Users and Access → Integrations, App
   Manager): `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8_B64`.
5. **Signing** — fastlane match (`MATCH_GIT_URL`, `MATCH_PASSWORD`,
   `MATCH_GIT_BASIC_AUTHORIZATION`; run `fastlane match appstore` once on a
   Mac) **or** manual: an *Apple Distribution* certificate (.p12) + an App Store
   provisioning profile → `IOS_DIST_CERT_P12_B64`, `IOS_DIST_CERT_PASSWORD`,
   `IOS_PROVISION_PROFILE_B64`, `IOS_PROVISION_PROFILE_NAME`.
6. **DeviceCheck** (optional fallback) — a key with DeviceCheck enabled →
   `apple_devicecheck_key_id` + `apple_devicecheck_private_key`. Set
   `ios_app_attest_allow_development=1` only while testing Xcode builds.

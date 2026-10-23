# CodeSpectra Android app (Capacitor)

A native Android shell around the live web app. The WebView loads the site
(`server.url`), so every web release ships to the app instantly; the shell adds
what a browser can't do. It sits next to the Expo app in `mobile/` (see
"Decisions" below).

| Capability | Native side | Web side |
| --- | --- | --- |
| Push (FCM) | `@capacitor/push-notifications`, channel `general`, small icon | `lib/native-bridge.ts` `registerNativePush()` → existing `POST /api/notifications/push-token {platform:'android'}`; server already sends FCM to native tokens (`lib/push-notifications.ts`) |
| Notification tap / App Links | `MainActivity` + `DeepLinks.java` open FCM `data.link` (site path) or `https://<host>/…` | `public/.well-known/assetlinks.json` |
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
   App signing*, copy the **App signing key** SHA-256 into
   `frontend/public/.well-known/assetlinks.json` (prod package; add the upload
   key's SHA-256 too if you sideload release builds; the debug keystore's for
   dev/staging). Verify with
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

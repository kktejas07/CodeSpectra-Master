# App Store checklist — CodeSpectra (iOS)

## Before the first upload

- [ ] Apple Developer Program (organisation account — needs the D-U-N-S number).
- [ ] Identifier `ai.codespectra.app` with capabilities: **Push Notifications**,
      **Associated Domains**, **App Attest** (shown as "App Attest" under
      DeviceCheck). Sign in with Apple is not used.
- [ ] APNs **key** (.p8, Keys → +, "Apple Push Notifications service") uploaded
      in Firebase → Project settings → Cloud Messaging → Apple app configuration.
- [ ] Firebase iOS app `ai.codespectra.app` → `GoogleService-Info.plist` →
      secret `IOS_GOOGLE_SERVICE_INFO_PLIST_B64`.
- [ ] `frontend/public/.well-known/apple-app-site-association`: replace
      `TEAMID` with the team id, deploy, check
      `curl -sI https://codespectra.ai/.well-known/apple-app-site-association`
      → `200`, `content-type: application/json`, no redirect.
- [ ] Admin → server secrets: `apple_team_id`, `ios_bundle_ids`
      (`ai.codespectra.app`), optional `apple_devicecheck_key_id` +
      `apple_devicecheck_private_key` (a DeviceCheck .p8 key), optional
      `apple_app_attest_root_ca_pem` (pin Apple's App Attestation Root CA;
      otherwise fetched from apple.com once per server start).
- [ ] App Store Connect app record (bundle id above, SKU `codespectra-ios`,
      primary language English (India)), API key for CI (role App Manager).
- [ ] Commit `ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved`
      after the first Mac build so CI resolves the same Swift package versions.

## Privacy nutrition labels (App Privacy)

Matches `PLAY_STORE.md → Data safety` (same app, same server). Nothing is used
for **tracking** (no ATT prompt; no ad SDKs; no data broker sharing).

| Apple data type | Collected | Linked to user | Used for |
| --- | --- | --- | --- |
| Contact info → Name, Email address | Yes | Yes | App functionality |
| Contact info → Phone number | Optional | Yes | App functionality (WhatsApp / SMS notices, with consent) |
| User content → Photos or videos | Optional (face sign-in, proctoring snapshots when a test enables them, video answers) | Yes | App functionality, fraud prevention / security |
| User content → Audio data | Optional (voice / video answers) | Yes | App functionality |
| User content → Other user content (code, answers, résumé, uploads) | Yes | Yes | App functionality |
| Purchases → Purchase history (bought on the web) | Yes | Yes | App functionality |
| Identifiers → User ID | Yes | Yes | App functionality |
| Identifiers → Device ID (push token, random biometric-unlock device id, App Attest key id) | Yes | Yes | App functionality, fraud prevention / security |
| Usage data → Product interaction | Yes | Yes | App functionality, analytics (first-party) |
| Diagnostics → Crash / performance data (server-side error logs) | Yes | No | App functionality |
| Sensitive info, Health, Financial info (card numbers), Location, Contacts, Browsing history, Search history (outside the app) | **Not collected** | — | — |

Biometrics: Face ID / Touch ID run on the device; CodeSpectra never receives
biometric data (only a device-bound refresh token is stored in the Keychain).
Card details are entered on the payment providers' web pages, never in the app.

Also provide: privacy policy URL `https://codespectra.ai/privacy`, account
deletion path (guideline 5.1.1(v): in-app — Settings → Account → Delete
account must exist and work in the app).

## Age rating

Questionnaire answers: no violence, sexual content, profanity, gambling,
drugs, horror; **Unrestricted web access: No** (the WebView only loads
codespectra.ai; other hosts open in Safari); **User-generated content: Yes**
(community posts / comments — moderation + report + block exist on the web
app); Medical: No; Contests: Yes (hackathons / leaderboards, no money prizes
inside the app). Expected rating **12+** (UGC). Not "Made for Kids".

## Export compliance

`ITSAppUsesNonExemptEncryption = false` is in Info.plist: the app uses only
HTTPS / Apple-provided cryptography (exempt). No annual self-classification
report needed for this exemption; answer "No" to proprietary encryption.

## App Review information

- Sign-in required: **Yes**. Demo account: `REVIEW_DEMO_EMAIL` /
  `REVIEW_DEMO_PASSWORD` (placeholder — create a learner account with a
  sample proctored practice test assigned; keep it free-plan, no 2FA).
- Notes (paste, then edit):

  > CodeSpectra is a coding assessment and learning platform. The app adds
  > native features to our web service: push notifications, Face ID sign-in
  > (Keychain-stored device token), a proctored test mode (Guided Access
  > prompt, screen-recording / mirroring cover, screenshot reporting),
  > App Attest device checks, Universal Links and native file sharing.
  > To see proctoring: sign in with the demo account → Dashboard → Tests →
  > "App Review practice test" → Start. Guided Access is optional; the test
  > records a note if it is off.
  > Purchases: the app does not sell anything. Plans are bought on our
  > website (guideline 3.1.3(b), multiplatform service); purchase buttons are
  > hidden in the app. Existing plans work in the app.
  > Camera / microphone are used only in tests that require them and for
  > optional face sign-in.

- Contact: a reachable phone number + email for the reviewer.

## Guideline 4.2 (minimum functionality)

Apple rejects apps that are only a website in a frame. Lead the review notes
with the native features above, and keep them working in each release
(push, Face ID, proctored lockdown, App Attest, sharing, offline screen).

## Release

TestFlight internal testing (CI uploads) → external testing (beta review, demo
account above) → App Store submission with phased release (7 days).
Bump `MARKETING_VERSION` (project) with `package.json` `version` for each store
release; the build number is the CI run number.

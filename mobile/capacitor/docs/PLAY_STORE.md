# Play Store listing checklist — CodeSpectra (Android)

Package `ai.codespectra.app` · target SDK 36 · min SDK 24 · AAB from
`.github/workflows/android.yml` (prod flavour, signed).

## Before the first upload

- [ ] Play App Signing enrolled; upload key stored outside the repo
- [ ] `google-services.json` secret set (push works on the internal track)
- [ ] App signing SHA-256 added to `frontend/public/.well-known/assetlinks.json` and deployed; `pm get-app-links` shows *verified*
- [ ] Play Integrity API linked to a Cloud project; service-account JSON in Admin → server secrets
- [ ] Decide the in-app purchase question (see **Billing** below) before production review
- [ ] Bump `version` in `mobile/capacitor/package.json`

## Store listing

- [ ] App name: **CodeSpectra** · short description (≤ 80 chars) · full description
- [ ] Category: **Education** · tags: coding practice, assessments
- [ ] Contact email + website `https://codespectra.ai`
- [ ] **Privacy policy URL: `https://codespectra.ai/privacy`** (must mention camera use in proctored tests, push tokens, device integrity checks, and account deletion)
- [ ] Account deletion URL / in-app path (Play requires a web link where users can request deletion of the account and data)
- [ ] Graphics: 512×512 icon (`mobile/assets/icon.png` at 512), 1024×500 feature graphic, ≥ 2 phone screenshots (dashboard, practice, a test), 7" / 10" tablet screenshots if tablets are targeted
- [ ] Translations of the listing: Hindi, Telugu (the app UI already ships en / hi / te)

## Content rating (IARC questionnaire)

- Category: **Reference, News, or Educational**
- Violence, sexual content, profanity, drugs, gambling: **No**
- Users can interact / communicate: **Yes** (hackathon teams, community, live interviews)
- Shares user's location with others: **No**
- Digital purchases: **Yes** (paid plans / courses — see Billing)
- Expected result: *Everyone* / *3+* (PEGI 3, ESRB E) with the "Users Interact" and "In-App Purchases" descriptors

## Target audience and content

- Target age: **18+** primarily; if 13–17 students are a target group, select it and complete the Families policy questions (no ads SDKs are included in the shell)
- Ads: **No ads**
- News app: **No** · COVID / government app: **No** · Financial features: **No**

## Data safety form

Answers match what the app and site actually do (shell + web app). Data is
**encrypted in transit** (HTTPS only; the shell refuses cleartext and
user-installed CAs in release builds). Users **can request deletion**.
Nothing is sold; nothing is shared with third parties for advertising.

| Data type (Play category) | Collected | Shared | Purpose | Optional? |
| --- | --- | --- | --- | --- |
| Personal info → Name, Email address | Yes | No | Account management, App functionality | Required |
| Personal info → Phone number | Yes | No | Account management, notifications (WhatsApp/SMS, with consent) | Optional |
| Personal info → Other (college, résumé details) | Yes | No | App functionality (profile, hiring) | Optional |
| Financial info → Purchase history | Yes | No¹ | App functionality (plans, invoices) | Optional |
| Photos and videos → Photos | Yes | No | App functionality, Fraud prevention & security (face sign-in; snapshots in proctored tests when the test author enables them; deleted on schedule) | Optional |
| Audio | Only if a test uses voice / video answers | No | App functionality | Optional |
| Files and docs | Yes (uploads: résumé, submissions) | No | App functionality | Optional |
| App activity → App interactions, In-app search, Other user-generated content | Yes | No | App functionality, Analytics | Required |
| App info and performance → Diagnostics | Yes (server-side error logs) | No | Analytics, App functionality | Required |
| Device or other IDs | Yes (FCM push token; random device id for biometric unlock; Play Integrity verdict) | No | App functionality (notifications), Fraud prevention & security | Required for push / optional for unlock |
| Location | **Not collected** (IP addresses are hashed for exam-integrity network changes only) | — | — | — |
| Contacts, Calendar, SMS, Health, Web history | **Not collected** | — | — | — |

¹ Payment card details are entered on the payment provider's pages
(PhonePe / Razorpay / Stripe) and never reach CodeSpectra; declare those
providers as *service providers*, which Play does not count as "sharing".

Security practices: encrypted in transit ✔ · deletion request ✔ ·
independent security review: only if done.

## Permissions declarations

| Permission | Why (for the declaration form, where asked) |
| --- | --- |
| `CAMERA` | Face sign-in and proctored tests (face-in-view checks run on the device) |
| `POST_NOTIFICATIONS` | Test reminders, results, event updates |
| `USE_BIOMETRIC` | Optional fingerprint / face unlock |
| `HIDE_OVERLAY_WINDOWS`, `DETECT_SCREEN_CAPTURE`, `DETECT_SCREEN_RECORDING` | Proctored test mode only: hide other apps' overlays and notice screenshots / recordings during a test |

No `QUERY_ALL_PACKAGES`, accessibility, location, SMS or call-log permissions.

## Billing (decide before production)

Selling digital content or subscriptions **inside** an Android app must use
Google Play Billing, or — for users in India — Play's *User Choice Billing*
programme (alternative billing next to Play Billing, reduced service fee).
The web checkout (PhonePe / Razorpay / Stripe) opening from the app does not
qualify on its own. Options:

1. Hide purchase / upgrade buttons in the app (the shell's user agent
   contains `CodeSpectraAndroid`) and sell only on the web — simplest.
2. Enrol in User Choice Billing (India) and add Play Billing next to the
   existing gateways.
3. Integrate Play Billing for subscriptions everywhere.

## WebView-app policy notes

Google rejects apps that are only a wrapper around a website. This one adds
native push, biometric unlock, proctored lockdown with screen pinning and
screenshot blocking, device integrity checks, file sharing, App Links and an
offline screen — mention these in the review notes. Give reviewers a demo
learner account and a short proctored practice test in **App access**.

## Release tracks

1. Internal testing (team) → 2. Closed testing (≥ 12 testers for 14 days is
required for new personal developer accounts; organisation accounts are
exempt) → 3. Production with a staged rollout (10 % → 50 % → 100 %).

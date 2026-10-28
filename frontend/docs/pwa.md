# CodeSpectra as an installable app (PWA)

What ships, how to set it up, and how to test it on real phones.

## Pieces

| Piece | Where |
| --- | --- |
| Manifest (name, icons any + maskable 192/512, colours, `start_url /dashboard?source=pwa`, shortcuts) | `app/manifest.ts` → `/manifest.webmanifest` |
| iOS meta (standalone, status bar, splash screens), theme colour per colour scheme, `viewport-fit=cover` | `app/layout.tsx`, `lib/pwa/config.ts`, `public/icons/splash-*.png` |
| Service worker | `public/sw.js` (+ shared rules in `public/pwa-core.js`) |
| Registration, "New version available — Refresh", online re-sync | `components/pwa/pwa-mount.tsx` (root layout) |
| Install card, bottom navigation, offline-store owner | `components/pwa/dashboard-pwa.tsx` (dashboard shell) |
| App push (VAPID) | `lib/pwa/web-push.ts`, `app/api/push/{subscriptions,preference,test}`, card on Notification preferences |
| Offline daily challenge | `app/api/offline/daily-challenge`, `lib/pwa/offline-*.ts`, `/offline`, "Save for offline" on the daily challenge widget |
| `/daily` shortcut → today's problem | `app/daily/route.ts` |

Icons were generated from `public/icon.svg` / `public/icons/icon-maskable-512.png` with sharp
(maskable 192, 96 px shortcut icon, monochrome badge, six iOS splash sizes). Regenerate them the same
way if the logo changes. No manifest screenshots yet — add real captures later, never mock-ups.

## Caching rules (service worker)

`chooseStrategy()` in `public/pwa-core.js`, covered by `tests/pwa-core.test.ts`:

- `/_next/static/**`, `/icons/**`, fonts, logo files → **cache-first** (`cs-static-v1`, trimmed to 300 entries).
- Public pages (`/`, `/learn/**`, `/events/**`, `/companies/**`, `/docs/**`, `/news/**`, pricing, FAQ, legal…) →
  **stale-while-revalidate** (`cs-pages-v1`, 40 entries). A test checks every one is a public marketing path.
- `/api/**`, RSC payloads, `?…token=` links, `/_next/image` → **not touched** (network only).
- Every other HTML page (dashboard, auth, tests, interviews, token pages) → **network only, never cached**;
  when the network fails the worker shows `/offline`.
- Responses are cached only when `200`, same-origin, and not `private` / `no-store`.
- `/offline` and its scripts are precached at install and refreshed once a day (they hold no user data).

Change the rules or the precache list → bump `CACHE_VERSION` in `public/pwa-core.js`; old caches are
deleted when the new worker activates. Users see "A new version of CodeSpectra is ready" and the new
worker takes over when they tap Refresh. Deploys that only change the app (hashed chunks) need no bump.

The worker registers only in production builds (`NODE_ENV=production`), or locally with
`NEXT_PUBLIC_PWA_DEV=1`. CSP already allows it: `worker-src 'self'` and `manifest-src 'self'`
(`lib/csp/policy.ts`, both variants). `proxy.ts` treats `/sw.js` and `/pwa-core.js` as static files
(no page gate, no CSP header).

## App push (VAPID)

1. Generate a key pair once (any machine with Node):

   ```bash
   cd frontend && npx web-push generate-vapid-keys
   ```

2. Admin → Settings → Firebase / push: paste **App push public key**, **App push private key** (stored
   encrypted as a server secret) and **App push contact** (`mailto:` address or https URL). Env fallback:
   `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. Never commit keys.
   Rotating the keys invalidates every existing subscription — users turn "This device" on again.
3. Users turn it on per device: Notifications → Preferences → **App notifications → This device**, then
   **Send a test notification**.

Delivery: `notify()` → `deliverOrDefer()` (quiet hours) → `sendPushToUser()`, which checks the push
channel switch (`notification_preferences { type: 'push' }`) and the per-type switch, sends to every
device in `web_push_subscriptions` via `web-push`, and deletes subscriptions that answer 404/410.
When a user has app subscriptions, FCM is sent only to native app tokens so a browser never shows the
same alert twice. Payloads carry title, short body, a same-origin link and ids only (`lib/pwa/push-payload.ts`).
Signing out removes this device's subscription.

## Offline daily challenge

"Save for offline" (dashboard daily challenge widget) stores today's question — statement, formats,
constraints, sample tests, starter code; never hidden tests or solutions — in IndexedDB
(`codespectra-offline`). At `/offline` the learner writes code (draft autosaved) and submits; the answer
is queued and sent to `/api/submissions` when the device is online (Background Sync where supported,
otherwise when the app reconnects or is opened). The server grades it exactly as a normal submission.
Each queued answer carries a UUID sent as `Idempotency-Key`; the server keeps it for 7 days
(`submission_idempotency`, unique + TTL index) and returns the first result on a repeat, so a resend
after a lost response is never graded twice.
Packs expire at the end of the next UTC day. Everything is wiped on sign-out or when another account
signs in on the device. The study-plan practice set is not offline yet (its questions are drawn and
graded per session on the server).

## Test it

Build and run a production server (`next build && next start`, or the staging URL). Push and install
need HTTPS (localhost is allowed on desktop Chrome).

**Desktop Chrome / Edge**: DevTools → Application → Manifest (no errors, icons shown), Service workers
(`/sw.js` activated), Cache storage. Install with the address-bar icon or the in-app card (shown from the
second day of use; to see it now, set `localStorage['cs-pwa-engagement'] = '{"days":["a","b"]}'` and reload).
Network → Offline, then reload a dashboard page → the offline page.

**Android (Chrome)**: open the site, use it on two different days (or set the key above via remote
debugging `chrome://inspect`), tap **Install** on the card or ⋮ → Install app. Long-press the icon for the
shortcuts. Turn on app notifications, send a test, lock the phone → the notification appears. Save the daily
challenge, turn on airplane mode, open the app → Offline practice → submit → turn airplane mode off → the
answer shows its result.

**iPhone / iPad (iOS 16.4+, Safari)**: Share → Add to Home Screen → open from the home screen (the splash
screen shows, no browser bars, bottom tab bar visible). Push works only from the Home Screen app: turn on
**This device** there and allow notifications. iOS has no Background Sync: queued answers send when the
app is opened online.

**Lighthouse**: DevTools → Lighthouse → "Progressive Web App" / installability checks should pass.

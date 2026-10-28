# CodeSpectra Mobile (Expo) — legacy, not published

> **Legacy prototype. Not published to any store.** The store app (Android and
> iOS) is the Capacitor shell in [`capacitor/`](capacitor/README.md), which owns
> the `ai.codespectra.app` package / bundle id. This Expo app uses
> `ai.codespectra.legacy` so the two can never collide on a device, in Firebase
> or in App Store Connect / Play Console. `eas.json` has no `submit` profile on
> purpose — do not submit this app. Kept for reference (server-driven shell,
> `GET /api/mobile/bootstrap`); it may be removed later.

Server-driven learner + judge + admin app. The shell renders from
`GET /api/mobile/bootstrap` — tabs, role gates, theme, and flags are
server data, never compiled-in policy.

## Run

```bash
npm install
npx expo start          # scan with Expo Go (dev only — SecureStore needs a dev-client build)
npx expo run:android    # dev-client build (login works here)
npx expo run:ios
```

Point at a backend: `extra.apiBase` in `app.json` (default
`https://codespectra.ai`; use your tunnel/LAN URL for local dev).

## Verify

```bash
npm run typecheck
```

## Stages

1. Shell (this): auth, manifest tabs, theme-from-data. ✅
2. Learner screens. 3. Judge queue. 4. Admin ops cards.
5. EAS production builds + store listings.

Spec: `docs/superpowers/specs/2026-09-21-mobile-app-design.md`.

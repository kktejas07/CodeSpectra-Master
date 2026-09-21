# Mobile App Design — CodeSpectra (Expo, server-driven)

- Date: 2026-09-21
- Status: proposed (awaiting user review)
- Approach: A — Expo Router + server-driven shell (approved)
- Scope: learner + judge/mentor + admin-ops (all three approved)

## 1. Goal

Ship iOS + Android apps from one TypeScript codebase that reuse the
production Next.js `/api/*` backend unchanged, render navigation,
permissions, and theme from server data (nothing hardcoded), and match
the web's emerald-on-dark-slate identity.

## 2. Non-goals (v1)

Timed proctored exam attempts with lockdown, course-generation queue
creation, in-app payments, native face-enrollment capture (all four
deep-link to web). No Detox/Maestro; no shared npm workspace.

## 3. Architecture

- `mobile/` in the monorepo (current stable Expo SDK — pin exact version at
  scaffold time, TypeScript, Expo Router,
  `expo-secure-store`, `lucide-react-native`). ADR-006 updated to
  re-list `mobile/`.
- App talks only to Next.js `/api/*` over HTTPS. All RBAC, rate limits,
  and validation stay server-side. No direct FastAPI calls.
- EAS Build for binaries; EAS Update OTA channel for JS-only changes.
- Offline: bootstrap + last-viewed lists cached in AsyncStorage.
  Mutations fail visibly; no background sync queue in v1.

## 4. Auth

- New `POST /api/auth/mobile-token`: email + password (same bcrypt
  check as web login) → `{ token, user, faceEnrollmentRequired }`.
- Token: `jose` JWT, 30-day expiry, SecureStore storage, sent as
  `Authorization: Bearer` (path `route-auth.ts` already supports).
- `faceEnrollmentRequired=true` → blocking screen deep-linking to web
  enrollment. Logout bumps session version (existing revocation) and
  wipes SecureStore.
- Implementation must live-test that Bearer requests bypass CSRF-cookie
  requirements end-to-end.

## 5. Bootstrap manifest (nothing hardcoded)

- New `GET /api/mobile/bootstrap` (any authenticated role) returns
  `{ user, tabs[], theme, flags, apiBase }`.
- `tabs` built server-side from `page-permissions.ts` role maps
  intersected with the DB `denied` list (same logic as
  `/api/user/my-permissions`). Permission toggles in
  `/dashboard/admin/permissions` reshape the app with no binary update.
- Badges (judge queue count, unread notifications) computed server-side.
- Icon strings resolve via a closed client registry (lookup, not policy).
- Screens re-check `user.role` before render (client mirror of
  `usePageGuard`); server remains the real gate.
- Bootstrap refreshes on Home pull-to-refresh and app foreground.

## 6. Theme as data

- `theme` block mapped server-side from `globals.css` dark/light tokens
  (emerald primary ~hsl(156), dark slate background). Web rebrands flow
  to mobile automatically.
- All styles constructed at runtime from tokens. Bundled fallback =
  snapshot of current dark theme (first launch / offline). Light/dark
  toggle re-fetches with `mode` param.
- Component polish via `ui-ux-pro-max` skill at implementation
  (spacing, ≥44px touch targets, dark contrast).

## 7. Screen map (all backed by existing APIs)

Learner (`user`+): Home (`/api/dashboard/*`, recent, daily challenge),
Problems list/detail/solve (`/api/problems*`, `/api/execute-code`,
`/api/submissions`), Courses (`/api/courses*`), Assessments
(`/api/user/assessments`, `/api/exams/*`), Leaderboard, Profile +
notifications.
Judge (`judge`+): event queue → submission detail → rubric scoring
(`/api/hackathons/[id]/submissions/*`, audit, compare). Card queue UI.
Admin (`superadmin`): ops cards — worker status, `llm-health` board,
user search, KYC/approvals (`/api/admin/*`, `/api/kyc/*`). No full CRUD
tables on phone; search + detail + approve/reject only.

## 8. Staging

1. Shell: scaffold, auth, manifest tabs, theme-from-data.
2. Learner screens. 3. Judge queue + scoring. 4. Admin ops cards.
5. EAS production builds + store listings + OTA channels.
Gate: each stage smoke-tested against production API read-only before
the next begins.

## 9. Testing

- `tsc` + ESLint in `mobile/`.
- Vitest contract tests: bootstrap tabs ⊆ existing routes, roles match
  `page-permissions.ts` (anti-rot, same pattern as provider-chain test).
- Manual smoke checklist per stage on real hardware (Expo Go for dev;
  dev-client build required for SecureStore).

## 10. Docs

ADR-006 update, `docs/api/*` entries for the two new endpoints,
version-history row, `AGENTS.md` claim before code. No new collections.

## 11. Open risks

- Bearer + CSRF interaction must be live-verified (assumed pass).
- SecureStore unavailable in Expo Go (dev-client needed early).
- Push notifications deferred (no scope yet — needs product decision).

# CodeSpectra — Product Requirements

## Original Problem Statement
A combined HackerRank + SonarQube platform with deep AI features: AI proctoring,
identity verification, AI grading, smart hints, code review, agent workspace,
skill analytics, question generator. Full migration off Supabase to MongoDB
Atlas + Better Auth. **Razorpay payments configured DYNAMICALLY via the
superadmin settings UI (no hardcoded keys).** Tech-stack tracks. Daily challenge
+ streaks. SonarQube-style scanner with quality gates / security hotspots.

## Architecture
- **Frontend**: Next.js 16 App Router + React 19 + Tailwind v4 + JetBrains Mono
- **Backend**: FastAPI (port 8001) — proxies `/api/*` → Next.js (3000),
  serves `/internal/ai/*` natively (LLM endpoints, NOT exposed via ingress)
- **DB**: **MongoDB Atlas** `codespectra.vjns9wr.mongodb.net` (primary, IP-allowlist `0.0.0.0/0`)
   with `mongodb://localhost:27017` as automatic fallback
- **Auth**: Better Auth + MongoDB adapter (`@better-auth/mongo-adapter`)
- **LLM**: emergentintegrations → Emergent Universal Key (Claude Sonnet 4.5 +
  Gemini 3 Flash)
- **Payments**: Razorpay — credentials stored in MongoDB `platform_settings`
  collection under key `secrets`; admin UI at `/dashboard/admin/settings?section=integrations`

## Implemented

### Phase 1 — Migration to MongoDB Atlas ✅
- Atlas now primary, local Mongo auto-fallback if Atlas blips
- Better Auth uses MongoDB adapter directly
- Deleted `lib/supabase-*.ts` shim files
- Refactored 8 admin/dashboard pages off the dead supabase imports
- `/api/admin/platform-settings` rewritten to use `platform_settings` Mongo collection
- `/api/admin/server-secrets` rewritten with new MongoDB-backed read/write helpers
  (`lib/server-secrets-cache.ts` — adds `readServerSecrets()` + `writeServerSecrets()`)

### Phase 2 — HackerRank-style ✅
- HackerRank-style auth pages, Monaco IDE w/ Piston execution
- `/dashboard/tracks` — 9 tech-stack tracks
- `/api/daily-challenge` + `<DailyChallengeWidget />` (streak counter)

### Phase 3 — SonarQube-style ✅
- Quality Gates, Security Hotspots, Quality Ratings, Activity Timeline,
  Architecture Visualization, AI Fixes panels at `/dashboard/scanner`

### Phase 4 — AI Features ✅
1. Ask CodeSpectra chatbot (SSE streaming + RAG)
2. Smart Hints (4-tier)
3. AI Code Review widget
4. Auto Code Analysis tab on submission
5. Smart Grading API
6. AI Question Generator (admin)
7. Skill Analytics dashboard
8. AI Proctoring monitor
9. Identity Verification (webcam + ID, Gemini vision)
10. Agentic AI workspace (Emergent-style)
11. `/assessment` public landing

### Phase 5 — Razorpay Billing with DYNAMIC config ✅
- `lib/razorpay-server.ts` — async helpers read credentials from MongoDB FIRST,
  fall back to env. Admin can rotate keys without redeploy.
- `lib/db/billing.ts` — orders/payments/subscriptions repositories + plan catalog
- POST `/api/billing/create-order` — creates Razorpay order
- POST `/api/billing/verify` — HMAC SHA-256 payment signature verification
- POST `/api/billing/webhook` — webhook signature verification +
  payment.captured / failed / refund.created / subscription.cancelled handling
- GET `/api/billing/me` — active subscription + plan catalog + readiness flag
- `/dashboard/pricing` UI with 3 plans (₹499/mo, ₹4990/yr, ₹199 problem pack)
- **`/dashboard/admin/settings?section=integrations`** — superadmin UI to
  paste Razorpay Key ID / Key Secret / Webhook Secret (data-testid=rzp-section,
  rzp-key-id-input, rzp-key-secret-input, rzp-webhook-input). Shows "✓ Active"
  badge once configured.

### Phase 6 — Role gate + cleanup ✅
- `useRoleGate({ require: 'superadmin' })` enforces both inside useEffect and
  blocks JSX render via `if (!gate.ready) return null` pattern.
- Settings page: explicit `if (!gate.ready) return <Authorising/>` guard
- Sidebar label: "Stripe & billing" → "Payments & integrations"

## Key file map (recently changed)
```
/app/frontend/
├── lib/
│   ├── razorpay-server.ts            [REWRITTEN — async, DB-first credentials]
│   ├── server-secrets-cache.ts       [REWRITTEN — MongoDB-backed read/write]
│   └── mongodb.ts                    [auto-fallback chain]
├── app/api/admin/
│   ├── platform-settings/route.ts    [MongoDB rewrite]
│   └── server-secrets/route.ts       [MongoDB rewrite + Razorpay fields]
├── app/api/billing/                  [4 endpoints — all async creds]
└── app/dashboard/admin/settings/page.tsx  [Added Razorpay UI block in 'integrations' section]
```

## Test
- 29/29 backend pytest in `/app/backend/tests/backend_test.py` (iteration 2)
- Razorpay dynamic config verified by curl (PATCH save → GET masked read → billing/me toggles to configured=true)
- Atlas confirmed connecting (problems endpoint 200, sign-up creates users on Atlas)

## Pending action items
- Admin UI test screenshot needs deeper playwright login flow (interim screenshot got
  caught on auth redirect). All APIs verified working via curl.
- Some legacy `/api/billing/subscription`, `/api/webhooks/stripe`, `/api/github/webhook`
  still reference `getServiceSupabase` stub — return 503 on call. To be ported.
- Code review bot on PR webhooks
- XP system + real leaderboard from submissions
- User profile pages `/users/:slug`
- MCP endpoint `/mcp`

## Test Credentials
See `/app/memory/test_credentials.md`

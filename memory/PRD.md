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
- 21/21 backend pytest in `/app/backend/tests/test_iteration7_features.py` (iter 7)
- 29/29 backend pytest in `/app/backend/tests/backend_test.py` (iteration 2)
- Razorpay dynamic config verified by curl (PATCH save → GET masked read → billing/me toggles to configured=true)
- Atlas confirmed connecting (problems endpoint 200, sign-up creates users on Atlas)

### Phase 7 — XP / Webhooks / MCP / Workflows (2026-06-26) ✅
- **XP system** — new `xp_events` Mongo collection + `lib/db/leaderboard.ts` helper
  (`awardXp`, `getUserXp`, `DIFFICULTY_XP`, `FIRST_BLOOD_BONUS=25`)
- **Submissions** auto-award XP on first accepted solve + first-blood bonus
- **Leaderboard** `/api/leaderboard?scope=global|monthly|team` — pure MongoDB
  aggregation, ObjectId-aware user lookup
- **Public profile** `/users/:slug` (slug = email-localpart or hex `_id`) +
  `/api/users/:slug` endpoint (name, role, XP, recent submissions)
- **GitHub webhooks** `/api/github/webhook` rewritten to MongoDB — verifies
  HMAC, persists to `github_webhook_events`, enqueues `push` events into
  `github_webhook_scan_queue`
- **Queue worker** `lib/github-queue-worker.ts` — atomic
  `findOneAndUpdate` claim, AI code-review via emergent backend, posts to
  `ai_code_reviews`. Triggered by `POST /api/github/queue/run` (superadmin).
- **MCP** JSON-RPC 2.0 endpoint at `/api/mcp` (+ root alias `/mcp`) exposing
  5 tools: `list_problems`, `get_problem`, `run_code`, `get_user_xp`,
  `get_leaderboard`. Compatible with Claude Desktop / Cursor.
- **Workflows v1** — `workflows` + `workflow_runs` collections,
  `/api/workflows` CRUD, `/api/workflows/:id/run` engine, admin UI at
  `/dashboard/admin/workflows`. Node types: `trigger.manual`,
  `http.request`, `ai.complete`, `mongo.find`, `log`, `delay`.
- **Cleanup** — deleted dead `components/auth/face-recognition.tsx` +
  `lib/face-auth-service.ts`; `/problems` page hydration fix
  (useCallback instead of eslint-disable).

### Phase 8 — Judge / PR comments / Visual builder / Cron / Dev login (2026-06-26) ✅
- **Local code executor** `lib/local-executor.ts` — in-process subprocess runner
  (python3, node, npx tsx, bash, sh). 5s default timeout, 256 KiB output cap,
  isolated temp dir per run.
- **Dynamic Piston** `lib/piston.ts` — resolves `piston_url` from
  `platform_settings` first, then `PISTON_URL` env, then falls back to the
  local executor. Gracefully degrades on 401 / 403 / 429 / network errors.
- **Settings UI** — added `Code execution backend (Piston)` + `GitHub App / PAT
  token` sections at `/dashboard/admin/settings`.
- **GitHub PR comments** — `/api/github/webhook` now enqueues
  `pull_request` events with `pull_request_number`. Queue worker posts an AI
  review comment back to the PR when a token is configured (per-owner via
  `integrations` collection OR a global `github_app_token` admin setting).
- **React Flow workflow builder** —
  `components/workflows/workflow-builder.tsx` (Visual tab). Drag from a node
  edge to another to wire, click a node to inspect/edit its config JSON, +
  buttons for all 6 node types.
- **Cron picker** — `components/workflows/cron-picker.tsx`. 7 presets + 5
  per-field selects + live description. Shown when workflow trigger is
  `schedule`. Persisted via `cron_expression` on `WorkflowDoc`.
- **Dev quick-login** — `/auth/login` shows a role picker (Superadmin,
  Tenant admin, User, Recruiter) outside production builds, gated by
  `process.env.NODE_ENV !== 'production' || ?dev=1`.

### Phase 10 — QR ID cards + Hackathon events (2026-06-26) ✅
- **`lib/db/qr-events.ts`** — new collections `id_card_tokens`,
  `hackathons`, `hackathon_teams`. Helpers: `newToken()` (32-char
  base64url), `getOrCreateIdCardToken()`, `xpToLevel()` (1 / 100 XP).
- **`lib/qr.ts`** — wraps `qrcode` package, returns SVG strings sized for
  inline usage (no PNG round-trip).
- **API**
  - `GET /api/id-card[?variant=...]` — lazy-creates a permanent token per
    `(user_id, role_variant)`; returns SVG + payload (XP, level, solved,
    achievements derived live from `submissions` + `xp_events`).
  - `GET /api/qr/[token]` — public scan resolver. Tries `id_card_tokens`,
    then `hackathon_teams.qr_token`. Returns role-themed `dashboard_url`.
  - `GET|POST /api/hackathons`, `GET|PATCH|DELETE /api/hackathons/[id]`
    (accepts id OR slug via `?by=slug`).
  - `GET|POST /api/hackathons/[id]/teams` — registration enforces
    `num_teams` cap + no double-membership.
  - `GET|PATCH|DELETE /api/hackathons/[id]/teams/[teamId]` — admin grants
    `xp_delta`, `achievement`, `submission` counter. Level auto-recomputed.
- **UI**
  - `/dashboard/id-card` — 4 role-variant tabs (Builder / Superadmin /
    Tenant admin / Recruiter) + inline QR + SVG download + copy URL.
  - `/qr/[token]` — public scan landing with role-tinted gradients.
  - `/dashboard/admin/hackathons` — superadmin event CRUD UI.
  - `/hackathons/[slug]` — public registration + live leaderboard
    (auto-refreshing every 15 s).

### Phase 11 — Finish trio + AI Inventory (2026-06-26) ✅

**Trio finished**
- `/dashboard/admin/hackathons/[id]` — detail page with per-team XP/achievement/submission grant forms + downloadable QR.
- Sidebar wires: **My ID Card** (under Challenges), **Hackathons** (admin), **AI Inventory** (admin).
- QR revoke flow: `POST /api/id-card?action=revoke` marks the row revoked (old token still resolves to 410 Gone) and `getOrCreateIdCardToken` issues a fresh token on next GET.

**AI Inventory (`lib/ai-inventory.ts`)**
- 13 categories auto-discovered: automations, mcp_servers, llm_models, rag_docs, agents, bot_replies, plugins, connectors, ai_skills, mcp_tools, genai_runs, web_scraping_tools, os_agent_frameworks.
- Live counts on this deploy: **48 components, 34 active.**
- Chunked API at `/api/ai-inventory` (summary) + `?category=...&cursor=N&limit=M` (paginated, ≤ 50 items/page).
- Vulnerability scanner at `/api/ai-inventory/audit` — scans `/app/backend/requirements.txt` + `/app/frontend/package.json` against an embedded advisory list. Currently flags `requests 2.31.0 → CVE-2024-47081`.
- Admin UI at `/dashboard/admin/ai-inventory` with **Inventory** + **Vulnerability audit** tabs. 401 anon, 403 non-admin, 200 admin.

**Catalog recommendations** (scraping + agent frameworks built into category 12-13):
- Firecrawl, ScrapeGraphAI, Crawl4AI, Crawlee, Jina AI Reader (web_scraping)
- LangGraph, CrewAI, AutoGen, smolagents, OpenAI Swarm, Pydantic AI (os_agents)

**Scheduler boot hook**
- ~~`instrumentation.ts` auto-starts the in-process tick loop on Node.js runtime~~ — Next 16 turbopack
  static-traced the dynamic mongodb import out of `instrumentation.ts` into the Edge bundle and broke
  `net`/`tls` resolution. Now the scheduler is lazy-booted from `lib/boot-scheduler.ts` on the first
  call to `getAPIUser()` (any authenticated route). Same UX — runs in-process, no external cron
  required for single-instance deploys.

### Phase 12 — Real dependency audit + Open-source Certifications + Mobile scaffolds (2026-06-26) ✅

**P1 — Sidebar admin gating**
- `/app/frontend/app/dashboard/layout.tsx`: Hackathons + AI Inventory added to the superadmin
  `platformItems` block; the regular user sidebar no longer shows them. Certifications added as
  a base nav item for everyone. data-testids `sidebar-nav-<slug>` added on every link for QA.

**P2 — Real `pip-audit` + `npm audit`**
- `/app/frontend/app/api/ai-inventory/audit/route.ts` rewritten:
  - In production (or `AI_INVENTORY_REAL_AUDIT=1`): spawns `pip-audit --strict --format json -r requirements.txt`
    and `npm audit --json --omit=dev` in `/app/frontend`.
  - Returns `{mode: 'real'|'embedded', python:{findings,count,source}, npm:{findings,count,source}, errors?}`.
  - Auto-falls-back to embedded advisory list if either CLI is missing or fails.
- Dev preview always returns `mode: 'embedded'` (pip-audit not installed in sandbox).

**P3 — Native mobile scaffolds**
- `/app/mobile/ios/CodeSpectraMobile/` — SwiftUI iOS 16+ scaffold (4 files: App, Models, APIClient, CertificationsView).
  MVVM + async/await `URLSession` + cookie-based Better Auth.
- `/app/mobile/android/codespectra-mobile/` — Jetpack Compose API 26+ scaffold (Kotlin 2.0, AGP 8.5).
  MVVM with ViewModel + StateFlow + OkHttp CookieJar + kotlinx-serialization.
- Both consume `GET /api/certifications` (chunked) and `GET /api/certifications/verify/{token}` (public).
- Each platform README documents the next steps (sign-in via SFSafariViewController / CustomTabsIntent, QR scanning).

**P4 — Open-source Certification modules**
- New MongoDB collections: `certifications` (catalog) and `certification_attempts`.
- Seeded 6 modules sourced from MDN (CC-BY-SA), exercism (MIT), FreeCodeCamp (BSD-3), web.dev (CC-BY-4.0),
  React Docs (CC-BY-4.0), OSSU (MIT). Each module has 5 questions, source URL + license attribution.
- API:
  - `GET /api/certifications` — public chunked catalog with `category=skill|role` + cursor pagination.
  - `POST /api/certifications/[id]/start` — auth-only, idempotent within 24h, returns questions with answers stripped.
  - `POST /api/certifications/[id]/submit` — scores `Record<questionId, choiceIndex>`, sets `verify_token` if passed.
  - `GET /api/certifications/me` — user's attempt history with earned count.
  - `GET /api/certifications/verify/[token]` — public verify endpoint (no auth).
- UI:
  - `/dashboard/certifications` — catalog (API-driven, replaces previous static page).
  - `/dashboard/certifications/[slug]` — assessment runner with radio-button question UI.
  - `/cert/verify/[token]` — public shareable certificate page with candidate name, score, license attribution.
- Snapshot pattern: candidate name resolved from `user._id` (ObjectId) at start time and stored on the attempt,
  so verify URLs keep working even if the user is later deleted/renamed.

## Test Credentials
See `/app/memory/test_credentials.md`

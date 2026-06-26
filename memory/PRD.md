# CodeSpectra — Product Requirements

## Original Problem Statement
A combined HackerRank + SonarQube platform with deep AI: AI proctoring, identity
verification, AI grading, smart hints, code review, agent workspace, skill
analytics, question generator. Full migration off Supabase to MongoDB + Better
Auth. Razorpay payments. Tech-stack tracks (Python, JS, Java, C++, SQL, React,
Node, DSA, System Design). Daily challenge + streaks. SonarQube-style scanner
with quality gates / security hotspots / quality ratings.

## Architecture
- **Frontend**: Next.js 16 App Router + React 19 + Tailwind v4 + JetBrains Mono
- **Backend**: FastAPI (port 8001) — proxies `/api/*` → Next.js (3000),
  serves `/internal/ai/*` natively (LLM endpoints, NOT exposed via ingress)
- **DB**: MongoDB Atlas (`codespectra.vjns9wr.mongodb.net`) — currently using
  local MongoDB as primary because Atlas IP allowlist is not yet open
- **Auth**: Better Auth + MongoDB adapter
- **LLM**: emergentintegrations → Emergent Universal Key
  - Claude Sonnet 4.5 (reasoning)
  - Gemini 3 Flash (fast tasks, vision)
- **Payments**: Razorpay (pending API keys from user)

## Implemented (Feb 2026)

### Phase 1 — Migration ✅
- Full Supabase → MongoDB + Better Auth (80+ routes)
- Deleted `lib/supabase-*.ts` shims
- Refactored admin/system, admin/analytics, admin/cdn, admin/settings,
  admin/speed-insights, leaderboard, dashboard/page, protected-page to use
  `useSession` + `/api/*` fetch (no more Supabase imports)
- Deleted dead Face-MFA components

### Phase 2 — HackerRank-style ✅
- HackerRank-style auth pages `/auth/login` + `/auth/signup`
- `/problems` catalog + `/problems/[slug]` Monaco IDE w/ Piston code execution
- `/dashboard/tracks` — 9 tech-stack tracks (Python, JS/TS, DSA, React, Node,
  SQL, Java, C++, System Design) wired to problem catalog
- `/api/daily-challenge` — deterministic problem-of-the-day + user streak
- `<DailyChallengeWidget />` mounted on `/dashboard`

### Phase 3 — SonarQube-style ✅
- `/dashboard/scanner` with QualityGatesLivePanel, SecurityHotspots,
  QualityRatings, ActivityTimeline, ArchitectureVisualization, AIFixesPanel
- Tech-debt score, severity-tagged issue browser (Blocker/Critical/Major/Minor)

### Phase 4 — AI Features Mega-Batch ✅
1. Ask CodeSpectra chatbot (SSE streaming, RAG over user scans)
2. Smart Hints (4-tier progressive) on `/problems/[slug]`
3. AI Code Review widget (Claude Sonnet 4.5)
4. Auto Code Analysis (after each submission)
5. Smart Grading (`/api/ai/grade`) with custom rubric
6. AI Question Generator at `/dashboard/admin/question-generator`
7. Skill Analytics at `/dashboard/skill-analytics`
8. AI Proctoring (`<ProctorMonitor />` on `/problems`)
9. Identity Verification at `/dashboard/identity-verify`
10. Agentic AI workspace at `/dashboard/agent` (Emergent-style)
11. `/assessment` public landing (hackforge.ai-style ecosystem)

### Phase 5 — Razorpay Billing ✅ (waiting for keys)
- `lib/razorpay-server.ts` — order creation + payment signature verification + webhook HMAC verification
- `lib/db/billing.ts` — orders/payments/subscriptions repositories + plan catalog
- POST `/api/billing/create-order` — creates Razorpay order
- POST `/api/billing/verify` — verifies signature, marks paid, issues subscription
- POST `/api/billing/webhook` — handles payment.captured/failed, refund.created, subscription.cancelled
- GET `/api/billing/me` — returns active subscription + plan catalog
- `/dashboard/pricing` UI with 3 plans (₹499/mo, ₹4990/yr, ₹199 problem pack) + Razorpay Checkout integration

## File Map (incremental)
```
/app/frontend/
├── lib/
│   ├── razorpay-server.ts      [NEW]
│   ├── db/billing.ts            [NEW]
│   ├── db/ai.ts                 [NEW Phase 4]
│   ├── ai/backend.ts            [NEW Phase 4]
│   ├── mongodb.ts               [UPDATED — auto-fallback to local mongo]
│   ├── auth.ts                  [tweaked timeouts]
│   └── use-role-gate.ts         [NEW — replaces supabase role checks]
├── app/api/
│   ├── billing/{create-order,verify,webhook,me}/route.ts  [NEW]
│   ├── daily-challenge/route.ts                            [NEW]
│   └── ai/{chat,hints,code-review,code-analysis,grade,
│            generate-problem,agent}/route.ts               [Phase 4]
├── app/dashboard/
│   ├── pricing/page.tsx         [NEW — Razorpay checkout]
│   ├── tracks/page.tsx          [NEW]
│   ├── agent/page.tsx           [Phase 4]
│   ├── skill-analytics/page.tsx [Phase 4]
│   ├── identity-verify/page.tsx [Phase 4]
│   └── admin/question-generator/page.tsx  [Phase 4]
└── components/
    ├── ai/{ask-codespectra,smart-hints-panel,proctor-monitor,ai-code-review-widget}.tsx
    └── dashboard/daily-challenge-widget.tsx [NEW]
```

## Pending Actions From User
- 🟡 **Razorpay keys**: add `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`,
  `RAZORPAY_WEBHOOK_SECRET`, `NEXT_PUBLIC_RAZORPAY_KEY_ID` to
  `/app/frontend/.env.local` to activate checkout
- 🟡 **Atlas IP allowlist**: add `0.0.0.0/0` to the cluster's Network Access
  list so the production app uses Atlas instead of the local Mongo fallback

## Backlog (P2/P3)
- Code review bot on PR webhooks
- XP system + real leaderboard from submissions
- First-blood bonus + user profile pages
- MCP endpoint `/mcp`
- Workflow automation graph builder
- Split `backend/ai_router.py` (525 lines) into per-feature files

## Test Credentials
See `/app/memory/test_credentials.md`

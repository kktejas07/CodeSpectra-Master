# CodeSpectra — Product Requirements

## Original Problem Statement
Migrate CodeSpectra (Next.js 16 + React 19) from Supabase to MongoDB + Better Auth,
then layer a massive list of AI-centric features inspired by HackerRank/HackForge:
- AI Proctoring, Identity Verification, AI Code Review, AI Grading
- Smart Hints, Skill Analytics, Question Generator
- "Ask CodeSpectra" Chatbot with RAG over user's scans
- Emergent-style Agent Workspace (multi-step coding agent)
- /assessment landing page mirroring hackforge.ai/assessment
- Revert UI font to JetBrains Mono ("coding theme pattern style")

## Architecture
- **Frontend**: Next.js 16 App Router + React 19 + Tailwind v4
- **Backend**: FastAPI (port 8001) — proxies /api/* to Next.js (port 3000),
  natively serves /internal/ai/* (LLM endpoints, NOT exposed via ingress)
- **DB**: MongoDB Atlas-compatible (local: mongodb://localhost:27017, db `codespectra`)
- **Auth**: Better Auth + MongoDB adapter
- **LLM**: emergentintegrations Python lib → Emergent Universal Key
  - Claude Sonnet 4.5 → chatbot, code review, grading, agent loop, generate-problem
  - Gemini 3 Flash → hints, code analysis, skill insights, identity verify (vision)

## What's Implemented (Feb 2026)

### Phase 1 — Supabase → MongoDB Migration (complete)
- 80+ API routes ported to MongoDB
- Better Auth replaces Supabase Auth
- MIGRATION.md documents full transition

### Phase 2 — Core UI (complete)
- HackerRank-style split login/signup at /auth/login + /auth/signup
- /problems coding sandbox (Monaco + Piston exec)
- SonarQube-style scanner at /dashboard/scanner
- Emerald Green theme, JetBrains Mono coding font

### Phase 3 — AI Features Mega-Batch (Feb 2026)
All endpoints live and tested (22/22 backend tests pass):
1. **Ask CodeSpectra Chatbot** — floating sidebar on /dashboard/*, SSE streaming
   via /api/ai/chat, RAG over user's recent scans, history persisted in
   ai_chat_sessions + ai_chat_messages
2. **Smart Hints** — 4-tier progressive hints on /problems/[slug] via /api/ai/hints
3. **AI Code Review** — /api/ai/code-review returns concerns/strengths/rating;
   reusable <AiCodeReviewWidget /> component
4. **Auto Code Analysis** — runs after submission on /problems/[slug],
   shows complexity + efficiency + edge-cases tab
5. **Smart Grading** — /api/ai/grade scores against custom rubric
6. **Question Generator** — admin tool /dashboard/admin/question-generator,
   can publish straight to /problems collection
7. **Skill Analytics** — /dashboard/skill-analytics with KPIs + AI growth plan
8. **AI Proctoring** — silent <ProctorMonitor /> on /problems/[slug] tracks
   tab blur / copy / paste / right-click / idleness / fullscreen exit
9. **Identity Verification** — /dashboard/identity-verify webcam + ID upload
   + Gemini Vision comparison (returns approved / rejected / manual_review)
10. **Agentic AI** — /dashboard/agent Emergent-style workspace, multi-step
    code-editing loop via /api/ai/agent
11. **/assessment landing page** mirroring hackforge.ai/assessment with 9
    ecosystem cards, 4-step "How it works", FAQ accordion

### Phase 4 — Activity Heartbeat Fix
- Replaced dead supabase-client call in
  components/dashboard/activity-heartbeat.tsx with /api/auth/get-session ping

## File Map
```
/app
├── backend/
│   ├── server.py           # FastAPI proxy + mounts ai_router
│   ├── ai_router.py        # /internal/ai/* — 9 LLM endpoints
│   └── .env                # EMERGENT_LLM_KEY
└── frontend/
    ├── app/
    │   ├── assessment/page.tsx           # Public landing
    │   ├── dashboard/
    │   │   ├── agent/page.tsx            # Emergent-style agent
    │   │   ├── skill-analytics/page.tsx
    │   │   ├── identity-verify/page.tsx
    │   │   └── admin/question-generator/page.tsx
    │   └── api/
    │       ├── ai/{chat,hints,code-review,code-analysis,grade,
    │       │     generate-problem,agent}/route.ts
    │       ├── analytics/skills/route.ts
    │       ├── proctor/events/route.ts
    │       └── identity/verify/route.ts
    ├── components/ai/
    │   ├── ask-codespectra.tsx           # Floating chat sidebar
    │   ├── smart-hints-panel.tsx
    │   ├── proctor-monitor.tsx
    │   └── ai-code-review-widget.tsx
    └── lib/
        ├── ai/backend.ts                 # Talks to /internal/ai/*
        └── db/ai.ts                      # Mongo repositories
```

## Known Open Issues (P1 — defer to next session)
- Several dashboard pages still import dead supabase-client shim and crash:
  - /dashboard/admin/{analytics,system,users,cdn,settings,speed-insights}
  - /dashboard/leaderboard, /dashboard/page.tsx
  - components/auth/protected-page.tsx
- Stripe + GitHub webhooks are stubs (lib/stripe-webhook-sync.ts, lib/github-queue-worker.ts)
- Billing endpoints under /api/billing/* are stubbed
- Face-MFA dead components (security-mfa-face.tsx, face-enrollment-reminder.tsx)

## Backlog (P2)
- Code review bot posting AI comments on PR webhooks
- XP system + real leaderboard wired to submissions
- Difficulty stars + topic chips on /problems index
- First-blood bonus + user profile pages /users/:slug
- MCP endpoint /mcp exposing CodeSpectra tools
- Workflow automation visual graph builder

## Test Credentials
See /app/memory/test_credentials.md

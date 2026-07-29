# Version History — CodeSpectra

> **Auto-Generated**: This document is maintained by the CodeSpectra Documentation Agent.  
> **Last Updated**: 2026-07-17  
> **Update Trigger**: Any code change that modifies API endpoints, database schemas, architecture, or features.

---

## Changelog

| Date | Version | Description | Author |
| 2026-07-29 | v0.19.1 | Candidate answer review + proctoring log + score release on results page: Added `GET /api/admin/exams/[id]/submissions/[userId]` (submission + proctoring events), `PATCH .../release` (individual release), `POST /api/admin/exams/[id]/release` (bulk release). Updated results page with per-question answer review, color-coded proctoring timeline, identity photo display, and Release All / Release Individual buttons. | CodeSpectra-Master |
| 2026-07-29 | v0.19.0 | Invite-only one-time use links + open/public exam toggle + real results page + assessment invite email: Added `PATCH /api/assessment/invite/[token]` to mark invites as used (409 on replay, email mismatch check), updated invite landing page to call PATCH before redirecting, added `access_type: 'invite_only' | 'open'` to exam schema (`ExamDoc` + `POST /api/exams`), added access-type radio toggle in admin exam create form, updated exam page (`/assessment/[id]`) to verify invite token before showing invite-only exams (blocks direct URL access for invite-only, allows open exams), fixed results page (`/dashboard/admin/exams/[id]/results`) to query real data from `candidate_invites` + `exam_submissions` + `user` collections via new `GET /api/admin/exams/[id]/results`, created `assessmentInviteEmail` template in `email-templates.ts` with branded layout, updated invite API (`POST /api/admin/users`) to use `sendEmail()` fallback chain (Resend → SendGrid → Postal → SMTP → log), removed duplicate `sendEmail` stub from `email-templates.ts`. | CodeSpectra-Master |
| 2026-07-24 | v0.18.2 | Implemented Multi-Assessment Candidate Pipelines, Language Restrictions, and Event (Codeathon/Hackathon) Invite Support: Added `AssessmentStep` schema and `assigned_assessments[]` / `allowed_languages[]` to `CandidateInviteDoc` (`frontend/lib/db/admin.ts`), updated `POST /api/admin/users` to store multi-step pipelines and language limits, upgraded `AddUserDialog` (`frontend/components/admin/add-user-dialog.tsx`) with multi-pipeline selector and programming language restrictions, updated `GET /api/assessment/invite/[token]` to return full step arrays, and upgraded candidate landing page (`frontend/app/assessment/invite/[token]/page.tsx`) into an interactive Candidate Assessment Portal with step-by-step stage execution. | CodeSpectra-Master |
| 2026-07-24 | v0.18.1 | Fixed User Login Failure for provisioned users (ensured bcrypt passwordHash is stored in MongoDB user collection during POST /api/admin/users) and enhanced Candidate Invite Link Modal in Admin Users page to display candidate email, assigned assessment pipeline, and candidate invite URL with clipboard copy. | CodeSpectra-Master |
| 2026-07-22 | v0.18.0 | Expanded CAD & Engineering Assessment Module (Addendum Requirements FR-41 to FR-92): Added 9 assessment modalities (`T1` Part Modelling to `T9` Design Rationale Viva), Delivery Modes A-D (Cloud CAD, Native Upload, VDI, Hybrid), 4-Layer Scoring Architecture (`backend/services/scoring_service.py` & `backend/models/cad_assessment.py`), Add-ons A-J (Parametric Brief Generator, Session Replay, CAD-Free Pre-Screen, Cost Estimator, Domain Packs, AI Review Assistant), candidate dual file submission (Native CAD + STEP AP242 paired export per FR-43), candidate task type selector (`frontend/components/cad/cad-task-type-selector.tsx`), upgraded candidate CAD assessment runner (`frontend/app/assessment/[id]/cad/page.tsx`), upgraded Layer 4 SME Review workstation (`frontend/app/dashboard/admin/sme-review/page.tsx`) with blind review mode (FR-88), 3D heat map viewer, feature tree diff, and AI draft review assistant (FR-91). Documented architecture in `docs/architecture/05-CAD-Engineering-Assessment-Module.md`. | AXISS / Platform |
| 2026-07-22 | v0.17.1 | Critical Security Patch: Enforced 32+ char `SESSION_SECRET` check and hard failure in production mode (`frontend/lib/session.ts`), eliminated Gemini API key query parameter leakage by adopting `x-goog-api-key` HTTP headers across backend/frontend (`backend/ai_client.py`, `backend/rag.py`, `frontend/app/api/admin/llm-config/*`), and implemented sliding-window rate limiting dependency on backend AI endpoints (`backend/routers/ai.py`). | Security Team |
| 2026-07-22 | v0.17.0 | Engineering & Manufacturing Technical Assessment Platform (Phases 1-3 & Advanced AI Security Suite): Added Workday Recruiting ISU integration (`backend/services/workday_service.py`, `backend/routers/assessment_platform.py`), Question Bank & Item Tagging engine (`frontend/app/dashboard/admin/question-bank/page.tsx`, `backend/models/question_bank.py`) with difficulty weights (Easy:3, Med:4, Hard:5) and experience bands (0-1, 2-3, 4-6 yrs), Workday Requisitions management (`frontend/app/dashboard/admin/requisitions/page.tsx`, `backend/models/requisition.py`), Automated CAD scoring engine (`backend/services/scoring_service.py`) with ISO vs. ASME Y14.5 GD&T standards and Metric/Imperial conversions, EEOC 4/5ths Rule Adverse Impact Calculator, Predictive Validity Study & Adverse Impact Analytics dashboard (`frontend/app/dashboard/admin/predictive-validity/page.tsx`), Candidate Regional Consent & Psychometric Advisory Modal (`frontend/components/proctoring/ConsentModal.tsx`), Hardware & Port Auditor (`frontend/lib/proctoring/hardware-detector.ts`) for multi-monitor, USB, and HDMI capture detection, Eye Gaze, Blink Counter & Head Pose Tracker (`frontend/lib/proctoring/eye-gaze-tracker.ts`), Aadhaar Mudra KYC & Live Face Match Router (`backend/routers/identity_verify.py`), Aadhaar ID & 3.5s Video Liveness Verification Modal (`frontend/components/proctoring/AadhaarIDVerificationModal.tsx`), upgraded Proctoring Wrapper (`frontend/components/proctoring/ProctoringWrapper.tsx`), Candidate Assessment CAD Runner (`frontend/app/assessment/[id]/cad/page.tsx`), and Hiring Manager Report & Shortlist dashboard (`frontend/app/dashboard/admin/hiring-manager-report/page.tsx`). Registered all new routes in `frontend/lib/page-permissions.ts`. | AXISS / Platform |
| 2026-07-29 | v0.19.1 | Candidate answer review modal + proctoring event log + score release workflow on results page: Added `GET /api/admin/exams/[id]/submissions/[userId]` (submission details + proctoring events), `PATCH /api/admin/exams/[id]/submissions/[userId]/release` (individual release), `POST /api/admin/exams/[id]/release` (bulk release). Updated results page with per-question answer review (MCQ options highlighted selected/correct/wrong, text answers shown), proctoring timeline with color-coded event severity, identity photo display, and Release All / Release Individual buttons. Updated results API to return `userId` and `released` fields. | CodeSpectra-Master |
| 2026-07-29 | v0.19.0 | Invite-only one-time use links + open/public exam toggle + real results page + assessment invite email: Added `requireAuth` to `POST /api/execute-code` (was fully public code execution), `GET/POST /api/scanner/activities`, `GET /api/scanner/issues`, `GET /api/scanner/quality-ratings`, `GET /api/jobs/[id]`, `GET /api/code-review-comments`, and `GET /api/admin/proctor`. Changed `admin/proctor` from `requireAuth` to `requireAdmin`. Fixed `admin/metrics` N+1: replaced `find().toArray()` + JS filter with `countDocuments` per role + `Promise.all` parallel day queries. Fixed `admin/teams/activity` N+1: replaced per-user 5-query loop with 4 parallel aggregation pipelines + batch user lookup. Fixed `quality-gates/import` sequential inserts → `insertMany`. Fixed `generate-fixes` sequential double-inserts → `insertMany` for issues and fixes. Fixed `submissions` silent data loss: `insertOne` failure now returns 500 instead of swallowing error. Fixed `resumes` returning `200 []` on error → `500`. Fixed `web-vitals` returning `{ok:true}` on auth fail → returns actual error. Fixed `setup-demo` exposing plaintext passwords in response. Deleted 6 ghost lib files (`auth-service`, `db-init`, `admin-service-client`, `admin-provision-user`, `billing-server`, `persist-code-scan-for-user`). Added `projection: {_id:0}` to `admin/teams` list. Added `GET /api/submissions` (list user submissions, filterable by `problem_slug` + `language`) and `GET /api/problems/[slug]/stats` (acceptance rate + total submission count). Problems page now shows acceptance-rate badge in header and per-user submission history in a new "Submissions" tab. Unified Learning page as curriculum hub. Added `topics` filter to `GET /api/problems` for track-based filtering. Made `GET /api/tracks` public. | Platform |
| 2026-07-11 | v0.15.0 | AI Inventory Control Plane (`/dashboard/admin/ai-inventory`): upgraded with search, status filtering (`Active`, `Inactive`, `Recommended`), custom component registration (`POST /api/ai-inventory`), per-item status toggling & overrides (`PATCH/DELETE /api/ai-inventory/[id]`), and direct configuration navigation links. RAG index (`POST /api/admin/rag/reindex`) and search (`POST /api/admin/rag/search`) now dynamically resolve AI provider keys across OpenAI, OpenRouter, OpenCode, and platform settings. Middleware (`middleware.ts`) updated with CSP whitelist for Monaco Editor CDNs (`cdn.jsdelivr.net`, `cdnjs.cloudflare.com`). | AI Engine |
| 2026-07-08 | v0.2.0 | Comprehensive security audit & hardening: 10 CVEs fixed (JWT, credentials, API keys, rate limiting, 2FA, webhooks, CRON, regex injection). Added CSP/HSTS middleware, auth audit logging, AI endpoint rate limiting, consolidated auth libs. | AI Audit Agent |
| 2026-07-08 | v0.2.0 | Restructured documentation by audience classification: public/ (13 files), user/ (15 files), developer/ (6 files), architecture/ (6), api/ (7), database/ (5), security/ (5), ai/ (5), devops/ (5), testing/ (2), compliance/ (4), decisions/ (2), diagrams/ (6), flowcharts/ (2), uml/ (6), roadmap/ (7), reports/ (5). Total: 102 files, 17,032 lines. | AI Doc Agent |
| 2026-07-08 | v0.2.0 | Replaced hardcoded docs page with dynamic markdown rendering engine. `/docs/*` routes render from `docs/public/` and `docs/user/` .md files via `react-markdown` + `rehype-highlight` + `rehype-slug`. Auto-discovery: adding a .md file creates a new page. | AI Doc Agent |
| 2026-07-08 | v0.2.0 | Created auto-update documentation system: `.kilo/agent/doc-agent.md` (triggered on file changes), `.kilo/command/doc-update.md` (manual sync), `.github/workflows/doc-sync.yml` (CI drift check), `AGENTS.md` (auto-update protocol). | AI Doc Agent |
| 2026-07-08 | v0.2.0 | Created MongoDB index creation script (`frontend/scripts/create-indexes.ts`) with 40+ collection index specs from the database audit. | AI Doc Agent |
| 2026-07-08 | v0.1.0 | Initial codebase audit: 3,500+ files, 60+ MongoDB collections, 165 API routes, 44 pages, 100+ components. Feature matrix: 104✅, 30🟡, 20❌ out of 154 features. Security: 3 CRITICAL, 21 HIGH, 27 MEDIUM, 11 LOW findings. | AI Audit Agent |
| 2026-07-08 | v0.1.0 | Generated enterprise documentation package: Executive docs, Architecture (C4 diagrams), UML (5 diagrams), Flowcharts (10 workflows), OpenAPI-style API reference, Database ERD/data dictionary, Security threat model/OWASP, AI architecture/prompts, DevOps/CI-CD, Compliance/standards, Roadmap/competitor comparison. | AI Doc Agent |
| 2026-07-08 | v0.1.0 | Legacy cleanup: removed 113 stale files from docs/archive/ and root docs/. Removed tracked .env files from git. Created .env.example with 40+ documented variables. | AI Doc Agent |
| 2026-07-08 | v0.14.0 | User-facing AI model selector: per-user model preferences stored in `user_ai_settings` collection. 5 model options (Gemini Flash free, Claude Sonnet, Claude Haiku, GPT-4o Mini, GPT-4o). Settings page at `/dashboard/settings/ai`. Model selector integrated into agent workspace header. Model resolver passes user preference through to backend. | AI Engine | Platform uses only direct per-provider API keys (gemini, anthropic, openai). | AI Engine | (anthropic + gemini + openai + emergent) in admin settings. Gemini free tier supported (Google AI Studio - 60 req/min free). Backend resolves per-provider keys via headers. Admin billing dashboard with MRR, churn, revenue charts, plan breakdown. Competitor comparison matrix updated to reflect current state. | AI Engine |: `emergent_llm_key` added to ServerSecretsRecord, server-secrets API, and settings page (Integrations section). Chatbot fix: backend `ai_router.py` now reads `x-emergent-llm-key` header as key fallback, frontend `backend.ts` injects the key from env or DB secrets. All 10 AI endpoints pass request headers for key resolution. | AI Engine |: `collab_documents` + `collab_presences` DB collections, polling-based sync API (GET/PATCH/DELETE), presence heartbeat with active user tracking, Monaco-style textarea editor with language switcher, reset capability, 3-sec poll for remote changes, 2-sec debounced push, integrated into interview sessions. | AI Engine |: fullscreen enforcement with 3-strike violation warning, camera capture at configurable intervals, real-time event logging for tab blur/copy/paste/right-click/idle, admin proctor review dashboard with violation aggregation, flagged session identification, event detail expand. All events persisted to proctor_events collection. Integrated into page-permissions. | AI Engine |: `interviews` DB collection, CRUD API (list/create/get/update/delete), scheduled → in_progress → completed lifecycle, Q&A submission with answer tracking, skip capability, AI feedback storage, scheduling page with user lookup, interview detail/take page with live question flow and progress tracking. | AI Engine | across 4 files covering secret scanner, dependency scanner, PaymentService, billing plans, hackathon models, API auth patterns, rate limiting, and scanner modes. All passing. Fixed Slack token regex bug. | AI Engine |: email notifications on release (Resend/SendGrid/SMTP/Postal), results page with per-problem score breakdown, SVG certificate generation with download, LinkedIn social sharing, Canvas-based certificate creator, final leaderboard with medal styling. | AI Engine |: multi-step admin creation form (basics → problem selection → rules/scoring), team invite links + QR codes, team member join via invite endpoint, assigned problems visible to teams, rules & regulations config, "Under Review" scoring state with admin-controlled bulk release, certificate generation, full public-facing event page with tasks, rules, invite sharing, and leaderboard. | AI Engine | (`PaymentService` → `RazorpayAdapter`/`StripeAdapter`). Country-based gateway routing (IN→Razorpay, US→Stripe). All 12 billing endpoints unified through the adapter pattern. Payment methods management (list/add/delete). | AI Engine | `POST /api/billing/checkout` creates Stripe checkout or Razorpay orders. `PUT /api/billing/subscription` updates billing interval. `POST /api/billing/cancel` cancels subscriptions. `GET /api/billing/invoices` returns billing history. Stripe webhook sync writes to billing_* collections. Dependency scanning (10 manifest formats via OSV API) and secret detection (30+ pattern types) added as new scanner modes. | AI Engine |

### 2026-07-08 — Codebase Audit & Documentation Baseline

#### Architecture Snapshot (Verified)

| Component | Technology | Status |
|---|---|---|
| Frontend Framework | Next.js 16.2.4 + React 19.2.7 | ✅ Active |
| Backend Proxy | FastAPI 0.110.1 (Python) | ✅ Active |
| AI Router | FastAPI mounted at `/internal/ai/*` | ✅ Active |
| Database | MongoDB 7.x (native driver) | ✅ Active |
| Auth | Better Auth (primary) + Firebase Admin SDK (fallback) | ⚠️ Dual Path |
| Code Execution | Piston (self-hosted Docker, `ghcr.io/engineer-man/piston`) | ✅ Active |
| Payment Processor | Razorpay (active), Stripe (stubs — `billing-server.ts` throws errors) | ⚠️ Incomplete |
| Deployment | Docker Compose → Docker Swarm + Dokploy | ✅ Active |
| Styling | Tailwind CSS 4 + Radix UI primitives | ✅ Active |

#### Database Collections (MongoDB — 38 verified collections)

| Collection | Purpose | Phase |
|---|---|---|
| `user` | Better Auth user records | Stable |
| `session` | Better Auth session records | Stable |
| `account` | Better Auth account linkages | Stable |
| `verification` | Better Auth verification tokens | Stable |
| `roles` | RBAC role definitions with permissions | Active |
| `plans` | Subscription plan definitions | Active |
| `problems` | Coding problem catalog | Active |
| `submissions` | User solution attempts | Active |
| `code_scans` | Code scan runs | Active |
| `code_metrics` | Scan quality metrics | Active |
| `code_issues` | Individual findings (bugs, smells, vulns) | Active |
| `suggested_fixes` | AI-generated fix suggestions | Active |
| `quality_gates` | Per-project quality thresholds | Active |
| `scan_activities` | Audit feed for scanner | Active |
| `ai_chat_sessions` | AI chat session history | Active |
| `ai_chat_messages` | Individual chat messages | Active |
| `ai_code_reviews` | AI review results | Active |
| `ai_grades` | AI grading results | Active |
| `ai_generated_problems` | AI-generated problem payloads | Active |
| `proctor_events` | Exam proctoring events | Active |
| `identity_verifications` | Selfie/ID verification records | Active |
| `skill_insights_cache` | Cached skill analysis results | Active |
| `certifications` | Certification catalog (open-source modules) | Active |
| `certification_attempts` | User certification attempts | Active |
| `xp_events` | XP award log | Active |
| `billing_orders` | Razorpay/Stripe orders | Active |
| `billing_payments` | Payment records | Active |
| `billing_subscriptions` | Subscription lifecycle | Active |
| `github_webhook_events` | Raw GitHub webhook audit trail | Active |
| `github_webhook_scan_queue` | Pending push/PR scan jobs | Active |
| `integrations` | Connected third-party accounts | Active |
| `workflows` | Admin-authored automation workflows | Active |
| `workflow_runs` | Workflow execution history | Active |
| `notifications` | User notifications | Active |
| `notification_preferences` | Notification settings | Active |
| `admin_audit_logs` | Admin action audit trail | Active |
| `platform_settings` | Configurable platform settings | Active |

#### API Route Inventory (150+ routes)

**Pattern**: `frontend/app/api/<resource>/route.ts`

```
/api/admin/*           → 20 routes (users, roles, teams, pricing, audits, security, etc.)
/api/ai/*              → 11 routes (chat, hints, code-review, grade, agent, etc.)
/api/billing/*         → 4 routes (orders, payment-methods, plans)
/api/certifications/*  → 5 routes (CRUD, verify, submit)
/api/challenges/*      → 3 routes
/api/exams/*           → 4 routes
/api/github/*          → 6 routes (oauth, repos, file-content, scan-queue)
/api/hackathons/*      → 6 routes
/api/integrations/*    → 6 routes (Slack, SonarQube, GitHub)
/api/problems/*        → 2 routes
/api/submissions/*     → 1 route
/api/user/*            → 6 routes
+ 35+ other route groups
```

#### Dashboard Pages (75+ pages)

All under `frontend/app/dashboard/` with RBAC gating:

| Category | Routes |
|---|---|
| **Admin** (`/dashboard/admin/*`) | system, users, roles, analytics, audit-logs, integrations, pricing, security, settings, teams, jobs, resumes, codeathons, exams, speed-insights, cdn, workflows, question-generator, hackathons, ai-inventory, permissions, plans |
| **User** (`/dashboard/*`) | arena, problems, tracks, scanner, agent, learning, skill-analytics, identity-verify, leaderboard, achievements, certifications, pricing, challenges, interviews, prepare, profile, settings, billing, notifications, support, search, id-card, analytics, codeathons, jobs, exams, resumes |

#### AI Model Registry

| Role | Provider | Model | Used For |
|---|---|---|---|
| `reasoning` | Anthropic | `claude-sonnet-4-5-20250929` | Chat, code review, grading, agent, problem generation |
| `fast` | Google | `gemini-3-flash-preview` | Hints, code analysis, skill insights, completions |
| `vision` | Google | `gemini-3-flash-preview` | Identity verification (selfie vs ID) |
| (chat) | OpenAI | `gpt-4-turbo` | Interview service (adaptive questions) |
| (chat) | OpenAI | `gpt-4o-mini` | AI chat via Vercel AI SDK |

---

### 2026-07-08 — Migration: Supabase → MongoDB

**Completed Migration**:
- All Supabase client imports removed from production code
- MongoDB collections mirroring Supabase schema with string UUIDs
- `db-init.ts` converted to no-op (was running Supabase migrations)
- `billing-server.ts` stubbed out as pending re-implementation

**Known Migration Debt**:
- `billing-server.ts`: 5 functions throw "Billing helpers were temporarily removed"
- `firebase-admin.ts` + `firebase.ts`: Dual auth path still active
- TypeScript build errors: `ignoreBuildErrors: true` in next.config.mjs

---

### 2026-07-08 — AI Inventory System

**Added**:
- `frontend/lib/ai-inventory.ts`: Full AI inventory discovery across 13 categories
- Categories: automations, mcp_servers, llm_models, rag_docs, agents, bot_replies, plugins, connectors, ai_skills, mcp_tools, genai_runs, web_scraping_tools, os_agent_frameworks
- `/api/ai-inventory/*`: Chunked API endpoint for inventory browsing

---

### 2026-07-08 — Workflow Engine v1

**Added**:
- `frontend/lib/workflow-engine.ts`: Linear DAG execution engine
- Node types: `trigger.manual`, `http.request`, `ai.complete`, `mongo.find`, `log`, `delay`
- Scheduler with cron evaluation (`frontend/lib/scheduler.ts`)

---

### 2026-07-08 — GitHub Integration

**Added**:
- OAuth flow for GitHub integration (`/api/github/oauth/*`)
- Webhook queue worker with atomic claim (`frontend/lib/github-queue-worker.ts`)
- PR comment posting via GitHub App token or user OAuth token
- Automatic AI code review on push/PR events

---

### 2026-07-08 — MCP Server

**Added**:
- MCP server at `/api/mcp` with 5 tools:
  - `list_problems` — filter by difficulty/topics
  - `get_problem` — full problem by slug
  - `run_code` — execute via Piston or local fallback
  - `get_user_xp` — total XP + level + solved counts
  - `get_leaderboard` — top-N earners

---

### 2026-07-08 — Scanner & Quality Gates

**Added**:
- `frontend/lib/scanner-modes.ts`: 20 scanner modes (manual, github, quality-gates, trends, review, etc.)
- `frontend/lib/quality-rater.ts`: A–E rating system (SonarQube-compatible)
- `frontend/lib/quality-gate-calculator.ts`: Pass/fail evaluation
- `frontend/lib/compliance-templates.ts`: OWASP, NIST, PR quick gate presets
- `frontend/lib/scanner-analysis-mapper.ts`: Issue type mapping (bug/vulnerability/code_smell → critical/major/minor)

---

### 2026-07-08 — RBAC & Permissions System

**Added**:
- `frontend/lib/page-permissions.ts`: Route-to-role registry (25 admin routes, 2 tenant_admin, 27 user routes)
- `frontend/lib/permissions-db.ts`: Granular DB permissions with 22 entity resources
- `frontend/lib/rbac.ts`: Role hierarchy (superadmin > tenant_admin > user)
- Auto-generated permission lists from route registry
- Permission check endpoint at `/dashboard/admin/permissions`

---

### Legacy

| Date | Event |
|---|---|
| Pre-2026 | Project initialized with Next.js + Supabase |
| Pre-2026 | Initial problem catalog and submission engine |
| Pre-2026 | Firebase Auth integration |
| 2026-07-08 | v0.15.0 | Universal notification system: 30+ notification types across 9 categories (account, billing, hackathon, interview, code quality, reviews, team, learning, system). `notify()` utility for one-call notification creation with email delivery. Enhanced NotificationDoc (link, icon, category, metadata). Integrated into hackathon release-results. Notification center with category filtering, read/unread toggle, icons, and deep links. Unread count badge API. Mark-all-read support. | AI Engine |
| Pre-2026 | Piston code execution setup |
| Pre-2026 | Docker Compose infrastructure |
| Early 2026 | Supabase → MongoDB migration began |
| Mid 2026 | FastAPI proxy backend added for AI router |
| Mid 2026 | Better Auth replaced Supabase Auth |

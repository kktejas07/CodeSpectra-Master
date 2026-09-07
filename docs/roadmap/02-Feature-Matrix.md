# CodeSpectra Feature Matrix

> **Auto-Generated**: Internal Engineering documentation.

> **Auto-generated:** Based on codebase audit. Last updated: 2026-09-06 (rows touched since 2026-07-08 carry a ✓26 note; category rollups recounted 2026-09-06 from current row symbols: ✅=1, 🟡=0.5, ❌=0).
> **Legend:** ✅ Complete | 🟡 Partial | ❌ Missing

---

## Authentication

| Feature | Status | Priority | Notes |
|---------|--------|----------|-------|
| Email/password login | ✅ | P0 | `app/api/auth/login/route.ts` — bcrypt + session cookie |
| Email/password signup | ✅ | P0 | `app/api/auth/signup/route.ts` — inserts into `user` collection |
| Google OAuth | 🟡 | P1 | `auth-context.tsx:168` — client-side popup, no server-side sync |
| GitHub OAuth | 🟡 | P1 | `auth-context.tsx:176` — same Google OAuth pattern |
| Session management (JWT) | ✅ | P0 | `lib/session.ts` — prod hard-fail when unset, Mongo-backed fallback secret ✓26 |
| Session cookie | ✅ | P0 | `httpOnly`, `secure`, `sameSite: lax`, 7-day expiry |
| 2FA (TOTP) | 🟡 | P2 | Setup/verify/disable/status routes + login `totpToken` exist; admin enforcement policy pending ✓26 |
| Email verification | 🟡 | P2 | `verify-email` route enforces token + expiry; signup issues tokens ✓26 (needs email provider configured) |
| Password reset | ✅ | P2 | Self-contained hashed-token email flow (`forgot-password` + `reset-password`) ✓26 |
| Session revocation | ✅ | P2 | `session_version` bumped on signup/reset/change-password; logout clears cookie ✓26 |
| Rate limiting (login) | ✅ | P0 | `rateLimitRedis` per-IP + per-email ✓26 |
| Rate limiting (signup) | ✅ | P0 | `rateLimitRedis` per-IP ✓26 |
| Account deletion | 🟡 | P3 | `admin.ts:150` — `deleteUserById` exists but no user-facing flow |
| Firebase Auth integration | ✅ | P0 | `firebase.ts` + `firebase-admin.ts` — client + admin SDK |
| Firebase config (dynamic) | ✅ | P2 | `api/firebase-config` route serves config from DB |

## Organizations / Multi-Tenant

| Feature | Status | Priority | Notes |
|---------|--------|----------|-------|
| Organization model | ✅ | P2 | `TenantDoc` in `lib/db/admin.ts`, `tenants` collection |
| Team management | ✅ | P2 | `/dashboard/admin/team` real tenant-scoped members + add-member |
| Organization invitations | ✅ | P2 | `organization_invitations` collection + invite + accept API + landing page + branded email |
| User role assignments | ✅ | P2 | Roles page + org picker + `normalizeUserRole()` |
| Tenant CRUD | ✅ | P2 | `/dashboard/admin/organizations` page, CRUD API, edit dialog, active toggle |
| Tenant member list + impersonation | ✅ | P2 | Per-member dialog, `POST /api/admin/impersonate` (superadmin) + exit banner |
| Tenant membership on users | ✅ | P2 | `tenantId` field on `user` collection, `route-auth` resolution |
| Tenant isolation | 🟡 | P3 | Query-level filtering in progress (team members scoped; platform-wide pending) |

## Content (Problems, Challenges, Courses)

| Feature | Status | Priority | Notes |
|---------|--------|----------|-------|
| Problem CRUD | ✅ | P0 | `db/problems.ts`, API routes |
| Problem listing with filters | ✅ | P0 | Multiple list/filter endpoints |
| Challenge system | ✅ | P1 | `db/content.ts` — `CodeathonDoc` |
| Course/track system | 🟡 | P2 | Track routes exist, content varies |
| Learning paths | 🟡 | P2 | `LEARNING_HUB_DEFAULT = '/dashboard/learning'` |
| Problem statements (MD) | ✅ | P0 | Markdown rendering in problem views |
| Test cases | ✅ | P0 | Input/expected output pairs |
| Starter code templates | ✅ | P0 | 30+ languages with boilerplate |
| Submission storage | ✅ | P0 | `submissions` collection |
| Private/public problems | 🟡 | P2 | Visibility flag exists but enforcement unclear |

## Code Execution

| Feature | Status | Priority | Notes |
|---------|--------|----------|-------|
| Piston sandbox integration | ✅ | P0 | `lib/piston.ts` — full API client |
| Piston self-hosted Docker | ✅ | P0 | `docker-compose.yml` — `ghcr.io/engineer-man/piston` |
| Local fallback executor | ✅ | P1 | `lib/local-executor.ts` — Python, JS, TS, Bash |
| 40+ languages catalog | ✅ | P0 | `lib/languages.ts` — 30+ defined + Piston runtimes |
| Concurrent execution limit | ✅ | P1 | `piston.ts:56-78` — slot-based semaphore |
| Execution timeout config | ✅ | P1 | Configurable via env/DB |
| Runtime caching | ✅ | P1 | 5-minute in-memory cache |
| Graceful degradation | ✅ | P1 | Falls back to local when Piston is unreachable |

## AI Features

| Feature | Status | Priority | Notes |
|---------|--------|----------|-------|
| AI Chat (Ask CodeSpectra) | ✅ | P0 | `backend/ai_router.py:/chat` — SSE streaming |
| Smart Hints (progressive) | ✅ | P1 | `/hints` — 4 levels (nudge → solution) |
| AI Code Review | ✅ | P1 | `/code-review` — structured JSON with concerns |
| AI Code Analysis | ✅ | P2 | `/code-analysis` — complexity, scores |
| AI Grading (rubric) | ✅ | P2 | `/grade` — per-criterion scoring + letter grade |
| Multi-step Agent | ✅ | P2 | `/agent` — analyze → fix → re-analyze loop |
| Problem Generator | ✅ | P2 | `/generate-problem` — creates full problem with test cases |
| Skill Insights | ✅ | P2 | `/skill-insights` — strengths, gaps, growth plan |
| Identity Verification (AI) | 🟡 | P2 | `/identity-verify` — Gemini vision comparison |
| Claude Sonnet 4.5 integration | ✅ | P1 | Primary reasoning model |
| Gemini 3 Flash integration | ✅ | P2 | Fast/cheap model for hints/analysis |
| GPT-4o-mini integration | 🟡 | P2 | Via Vercel AI SDK, not FastAPI |
| Rate limiting (AI endpoints) | ✅ | P0 | Upstash Redis + edge + per-route limits ✓26 |
| Cost tracking | ❌ | P1 | No per-user/per-request cost tracking |
| Output schema validation | ❌ | P2 | Manual JSON parsing, no Zod/Pydantic validation |
| Prompt injection detection | ❌ | P2 | No injection scanning |
| RAG pipeline | ✅ | P3 | `backend/rag.py` (Gemini embeddings + cosine search) wired into AI service ✓26 (in-memory search, not Atlas Vector Search) |
| Semantic caching | ❌ | P3 | No AI response caching |
| Model fallback chain | ✅ | P3 | `provider-fallback.ts` — failover + backoff + rotation across 10+ providers ✓26 |

## Scanner (Static Analysis)

| Feature | Status | Priority | Notes |
|---------|--------|----------|-------|
| Manual code scan | ✅ | P0 | `scanner/page.tsx` — 689-line god component |
| GitHub repository scan | ✅ | P1 | GitHub integration |
| Quality Gate evaluation | ✅ | P1 | `quality-gate-calculator.ts` — pass/fail logic |
| Security hotspot detection | ✅ | P1 | `security-hotspots` component |
| Code duplication detection | ✅ | P2 | Metrics include duplicate percentage |
| Complexity analysis | ✅ | P2 | Complexity score, maintainability index |
| Test coverage estimation | 🟡 | P2 | Tracked in metrics, source not verified |
| AI-generated fixes | ✅ | P2 | `ai-fixes-panel` + `generate-fixes` API |
| Fix application | 🟡 | P2 | `appliedDbFixIds` state tracking |
| Architecture visualization | ✅ | P3 | `architecture-visualization` component |
| Branch analytics | ✅ | P3 | `branch-analytics` component |
| PR integration | ✅ | P2 | `pr-integration` component |
| Codebase chat (Q&A) | ✅ | P2 | `codebase-chat-sidebar` component |
| Report generation | ✅ | P2 | `report-generator` component |
| Insights dashboard | ✅ | P3 | `insights-dashboard` component |
| Team leaderboard | ✅ | P3 | `team-leaderboard` component |
| Scanner modes | ✅ | P1 | 19 modes via `scanner-modes.ts` |
| 16 sub-components | ✅ | P1 | Modular scanner component ecosystem |

## Assessments (Exams, Certifications)

| Feature | Status | Priority | Notes |
|---------|--------|----------|-------|
| Exam CRUD | ✅ | P2 | `db/content.ts` — `ExamDoc`, `ExamSubmissionDoc` |
| Exam degree/branch/screening metadata | ✅ | P2 | `degree_type`/`branch`/`screening_type` on exams + create/editor UI |
| Exam auto-pick from question bank | ✅ | P2 | `POST /api/exams` samples from `question_bank` before AI top-up |
| Question bank CRUD (filters, pagination, edit) | ✅ | P2 | `/dashboard/admin/question-bank` + `/api/question-bank` |
| Question bank AI bulk generation | ✅ | P2 | `/api/question-bank/generate` — backend `/internal/ai/complete` |
| Question bank import/export | ✅ | P2 | `/api/question-bank/import` (JSON/CSV) + client-side JSON export |
| Question bank seed | ✅ | P2 | `scripts/seed-question-bank.ts` + `seed-question-bank-large.ts` — 253 curated questions in prod |
| eSkill-style catalog (industries, levels, categories) | ✅ | P2 | `LEVELS`/`INDUSTRIES`/`ASSESSMENT_CATEGORIES` in `engineering-catalog.ts`; filters + form fields on `/dashboard/admin/question-bank` |
| Exam taking flow | 🟡 | P2 | Routes exist, full flow not verified |
| Certification management | 🟡 | P2 | `/dashboard/certifications` route exists |
| Certificate generation | 🟡 | P3 | Next verify flow + QR lib exist; legacy FastAPI cert router removed (had fake QR/PDF) — PDF issuance pending ✓26 |
| Proctoring | 🟡 | P3 | `/api/proctor` route exists |
| Identity verification flow | ✅ | P2 | `identity-verify` AI endpoint |
| Coding tests (live) | 🟡 | P2 | Interview coding test flow |

## Billing / Payments

| Feature | Status | Priority | Notes |
|---------|--------|----------|-------|
| Razorpay order creation | ✅ | P1 | `create-order/route.ts` — full implementation |
| Razorpay payment verification | ✅ | P1 | `razorpay-server.ts:64` — HMAC verification |
| Razorpay webhook verification | ✅ | P1 | `razorpay-server.ts:79` — HMAC verification |
| Billing order persistence | ✅ | P1 | `db/billing.ts` — `billing_orders`, `billing_payments` |
| Billing subscription persistence | ✅ | P1 | `billing_subscriptions` collection |
| Plan catalog (Pro, Yearly, Packs) | ✅ | P1 | `db/billing.ts:64` — 3 plans defined |
| Stripe checkout | ✅ | P2 | `PaymentService` — real checkout, 503 only when no provider configured ✓26 |
| Stripe subscription | ✅ | P2 | Real subscription sync into shared billing collections ✓26 |
| Stripe webhook sync | ✅ | P2 | `stripe-webhook-sync.ts` fully implemented (was DEAD stubs) ✓26 |
| Payment method management | 🟡 | P2 | Provider adapters exist; UI flow partial ✓26 |
| Invoice history | 🟡 | P3 | Persisted in `billing_payments`; history UI partial ✓26 |
| Subscription cancellation | 🟡 | P2 | Cancel route exists behind provider config ✓26 |
| Subscription management UI | 🟡 | P2 | `/dashboard/billing` route exists |
| Pricing page | ✅ | P2 | `/dashboard/pricing` — display only |

## Admin

| Feature | Status | Priority | Notes |
|---------|--------|----------|-------|
| User management (CRUD) | ✅ | P1 | `admin.ts` — list, get, update, delete |
| Role management | ✅ | P1 | `roles` collection + `/api/admin/permissions/roles` |
| Permission management | ✅ | P1 | `permissions` collection + `permissions-db.ts` |
| Audit logs | 🟡 | P2 | Admin audit logs exist, auth event audit missing |
| Platform settings | ✅ | P1 | DB-driven settings via `platform_settings` collection |
| System overview dashboard | ✅ | P2 | `/dashboard/admin/system` |
| Speed Insights | ✅ | P3 | `/dashboard/admin/speed-insights` |
| CDN management | 🟡 | P3 | `/dashboard/admin/cdn` |
| Workflow management | ✅ | P2 | `/dashboard/admin/workflows` |
| AI Inventory | ✅ | P2 | `/dashboard/admin/ai-inventory` |
| Job management | ✅ | P2 | `/dashboard/admin/jobs` |
| Resume management | ✅ | P2 | `/dashboard/admin/resumes` |
| Hackathon management | ✅ | P2 | `/dashboard/admin/hackathons` |
| Exam management | ✅ | P2 | `/dashboard/admin/assessments` |
| Question generator | ✅ | P2 | `/dashboard/admin/question-generator` |
| Subscription plan config | ✅ | P2 | `/dashboard/admin/plans` |
| Pricing config | ✅ | P2 | `/dashboard/admin/pricing` |

## Integrations

| Feature | Status | Priority | Notes |
|---------|--------|----------|-------|
| GitHub OAuth | ✅ | P1 | `github-api-auth.ts` — OAuth flow |
| GitHub webhooks | ✅ | P1 | `github-queue-worker.ts` — PR webhook processing |
| GitHub token encryption | ✅ | P1 | `github-token-crypto.ts` — AES-256-GCM |
| GitHub code review bot | ✅ | P2 | AI review on incoming PRs |
| Razorpay payments | ✅ | P1 | Full implementation |
| Stripe payments | ✅ | P2 | Full implementation behind credentials config ✓26 |
| Resend email | ✅ | P2 | `transactional-mail.ts` — production-ready |
| SendGrid email | ✅ | P2 | `transactional-mail.ts` — production-ready |
| Postal email | ✅ | P2 | `transactional-mail.ts` — production-ready |
| SMTP email | ✅ | P2 | `transactional-mail.ts` — production-ready |
| Webhook system | ✅ | P2 | `workflow-engine.ts` supports webhooks |
| Firebase Auth | ✅ | P0 | Client SDK v11, Admin SDK v13 |
| MongoDB Atlas | ✅ | P0 | Driver v7.3.0 |
| Piston code execution | ✅ | P0 | Docker container |
| MCP server | ✅ | P2 | `app/api/mcp/route.ts` — 5 tools |

## DevOps

| Feature | Status | Priority | Notes |
|---------|--------|----------|-------|
| Docker Compose setup | ✅ | P0 | `docker-compose.yml` — piston, frontend, backend |
| Dockerfile (frontend) | ✅ | P0 | `frontend/Dockerfile` |
| Dockerfile (backend) | ✅ | P0 | `backend/Dockerfile` |
| Health checks | ✅ | P1 | Piston health check in compose |
| GitHub Actions CI | ✅ | P2 | `ci.yml` (lint + typecheck + tests on main) + doc-sync ✓26 |
| Test runner | ✅ | P1 | Vitest configured + suites (grading, lesson-video, captions, quiz, syllabus) ✓26 |
| ESLint | ✅ | P1 | `next lint` configured |
| TypeScript strict mode | 🟡 | P1 | NOSONAR/nolint annotations suggest suppression |
| Environment validation | 🟡 | P2 | Runtime checks for required env vars |
| Deployment guide | ✅ | P2 | `docs/DEPLOYMENT_GUIDE.md` |

## Hiring

| Feature | Status | Priority | Notes |
|---------|--------|----------|-------|
| Job listings | ✅ | P2 | `job_postings` collection + admin management |
| Job applications | 🟡 | P2 | `job_applications` collection |
| Resume upload | 🟡 | P2 | `resumes` collection + validation |
| Resume AI analysis | ❌ | P3 | `resume.analysis` field exists, no implementation |
| Interview scheduling | 🟡 | P2 | `interview-service.ts` — basic stubs |
| Live coding interviews | ❌ | P3 | Collaborative editor not verified |
| Interview feedback | 🟡 | P2 | `/dashboard/interviews/feedback` route exists |
| Candidate management | 🟡 | P2 | Partial through applicant tracking |

## User Features

| Feature | Status | Priority | Notes |
|---------|--------|----------|-------|
| User profile | ✅ | P1 | `/dashboard/profile` |
| Settings | ✅ | P1 | `/dashboard/settings` |
| Notifications | ✅ | P1 | `/dashboard/notifications` |
| Notification preferences | ✅ | P2 | `/dashboard/notifications/preferences` |
| Real-time push notifications | ✅ | P2 | FCM web push + in-app XP/level-up toasts |
| Newsletter subscription | ✅ | P2 | Landing page signup + `/dashboard/admin/newsletter` |
| Leaderboard | ✅ | P1 | `/dashboard/leaderboard` |
| Achievements | ✅ | P2 | `/dashboard/achievements` |
| XP tracking | ✅ | P1 | `xp_events` collection |
| Skill analytics | ✅ | P2 | `/dashboard/skill-analytics` + AI insights |
| Arena (competitive) | ✅ | P1 | `/dashboard/arena` |
| Identity verification (ID card) | ✅ | P2 | `/dashboard/id-card` + QR generation |
| Search | 🟡 | P2 | `/dashboard/search` route exists |
| Billing portal | 🟡 | P2 | `/dashboard/billing` — partial |
| Support | ✅ | P2 | `/dashboard/support` |

## Overall Completion Summary

| Category | Total Features | ✅ Complete | 🟡 Partial | ❌ Missing | Completion % |
|----------|---------------|-------------|------------|------------|--------------|
| Authentication | 15 | 10 | 5 | 0 | 83% |
| Organizations | 8 | 7 | 1 | 0 | 94% |
| Content | 10 | 7 | 3 | 0 | 85% |
| Code Execution | 8 | 8 | 0 | 0 | 100% |
| AI Features | 19 | 13 | 2 | 4 | 74% |
| Scanner | 18 | 16 | 2 | 0 | 94% |
| Assessments | 14 | 9 | 5 | 0 | 82% |
| Billing | 14 | 10 | 4 | 0 | 86% |
| Admin | 17 | 15 | 2 | 0 | 94% |
| Integrations | 15 | 15 | 0 | 0 | 100% |
| DevOps | 10 | 8 | 2 | 0 | 90% |
| Hiring | 8 | 1 | 5 | 2 | 44% |
| User Features | 15 | 13 | 2 | 0 | 93% |
| **Total** | **171** | **132** | **33** | **6** | **87%** |

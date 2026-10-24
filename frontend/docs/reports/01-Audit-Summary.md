> **Auto-Generated Documentation**
> **Last Updated**: 2026-07-08
> **Auto-Update Rule**: Regenerate when codebase architecture or schema changes.

# CodeSpectra — Executive Audit Summary

**Audit Date**: 2026-07-08
**Audit Scope**: Full codebase — `frontend/`, `backend/`, `docs/`, `docker-compose.yml`
**Audit Method**: Static code analysis + manual file inspection

---

## Project Statistics

| Metric | Value |
|--------|-------|
| Total project files | 634 (excluding `node_modules`, `.git`, `.next`) |
| Frontend TypeScript/JS files | 40,896 (incl. `node_modules`) |
| Frontend directories | 8,430 (incl. `node_modules`) |
| Dashboard pages (`page.tsx`) | 64 |
| Total public + dashboard pages | 96 |
| API route files (`route.ts`) | 165 |
| API route groups | 55+ |
| Python backend files | 9 |
| Scanner sub-components | 23 |
| Library modules (`lib/`) | 77 |

---

## Database (MongoDB)

| Metric | Value |
|--------|-------|
| Verified collections | 38 (in `lib/db/*.ts`) |
| Additional projected collections | ~15 (Better Auth internal: `session`, `account`, `verification`; platform: `roles`, `plans`, `feature_flags`, `pricing_tiers`, `pricing_features`, `quality_ratings`, `code_review_comments`, `scan_comments`, `support_tickets`, `web_vitals_events`, `admin_audit_logs`, `github_tokens`, `github_scan_queue`) |
| Estimated total collections | 50–60 |
| Naming conflicts | 5 (`quality_gates` in 2 files, `suggested_fixes` in 2 files, `github_scan_queue` duplicates, `github_tokens` in `lib/db/misc.ts` overlaps, `quality_ratings` mismatch) |
| Schema validation | **NONE** — no `validator` on any collection |
| Indexes | **NONE** — no `createIndex()` calls found |
| Transactions | **NOT USED** — no `startSession()` or `withTransaction()` calls |
| TTL indexes | **NONE** — no `expireAfterSeconds` on any collection |
| Connection URI fallback | ✅ Implemented (primary + fallback) |
| Connection pool size | 20 (default) |

---

## API Surface

| Category | Routes | Notes |
|----------|--------|-------|
| Admin | 20 | Users, roles, teams, pricing, security, settings |
| AI | 11 | Chat, hints, code-review, grade, agent, code-analysis, generate-problem |
| Billing | 10 | Orders, verify, webhook, plans, subscriptions, invoices, payment-methods |
| Scanner | 9 | Init, metrics, issues, quality-gates, activities, bulk operations |
| Auth | 5 | Login, signup, session, me, seed-dev |
| GitHub | 7 | OAuth, webhook, queue, repos, file-content |
| Certifications | 5 | CRUD, start, submit, verify |
| Notifications | 4 | List, mark-read, preferences |
| Problems / Submissions | 3 | List, detail, submit |
| User | 4 | Stats, activity, heatmap, insights |
| Other | 82+ | Jobs, resumes, codeathons, hackathons, exams, interviews, workflows, integrations, quality-gates, etc. |

### Auth Gaps (CRITICAL)

| Route | Issue |
|-------|-------|
| `/api/auth/seed-dev` | No auth guard — creates dev users without authentication |
| `/api/setup-demo` | No auth guard — seeds demo data without authentication |
| `/api/cron/tick` | No auth guard — scheduled task endpoint without verification |

---

## Frontend Architecture

| Component | Lines | Assessment |
|-----------|-------|------------|
| `dashboard/layout.tsx` | 685 | **God component** — sidebar, header, mobile nav, theme, notifications, search, all-in-one |
| `dashboard/scanner/page.tsx` | 689 | **God component** — 19 scanner modes, file browser, metrics, chat sidebar, all-in-one |
| `lib/auth-context.tsx` | 231 | Complex — Firebase + Better Auth dual path |
| `components/providers.tsx` | ~50 | Wraps AuthProvider, ThemeProvider, ToastProvider |

### Component Inventory

| Directory | Components |
|-----------|------------|
| `components/scanner/` | 23 (activity-timeline, advanced-metrics, ai-fixes-panel, architecture-visualization, branch-analytics, code-diff-viewer, code-review-panel, codebase-chat-sidebar, github-integration, insights-dashboard, metrics-file-browser, metrics-trend-chart, pr-integration, quality-gate-dashboard, quality-gates-live-panel, quality-ratings, report-generator, repository-browser, scan-history, scanner-config-panel, security-hotspots, suggested-fixes, team-leaderboard) |
| `components/ui/` | Radix UI primitives (button, card, dialog, input, select, table, tabs, toast, tooltip, etc.) |
| `components/dashboard/` | Dashboard-specific widgets |
| `components/admin/` | Admin panel components |
| `components/landing/` | Public landing page components |

---

## Security Findings Summary

| Severity | Count | Key Issues |
|----------|-------|------------|
| **CRITICAL** | 3 | JWT fallback hardcoded secret (`session.ts:6`), Gemini API key in URL query (`ai_client.py:55`), committed MongoDB credentials (`backend/.env`) |
| **HIGH** | 21 | No rate limiting on AI/auth endpoints, Stripe webhook stub, no auth audit logging, GitHub OAuth tokens optionally encrypted, permission cache 60s stale, no DB-level access control, TOTP disable without re-auth |
| **MEDIUM** | 27 | Piston privileged mode, no TLS between containers, procedural password reset, no prompt injection defense, no output schema validation, Google OAuth client-side only, no session revocation |
| **LOW** | 11 | Dev-only NODE_ENV checks, console.error logging only, MD in JSDoc style inconsistency |

---

## Feature Completion

| Category | Total | ✅ Complete | 🟡 Partial | ❌ Missing | Completion % |
|----------|-------|-------------|------------|------------|--------------|
| Authentication | 14 | 5 | 5 | 4 | 54% |
| Organizations | 5 | 1 | 3 | 1 | 30% |
| Content | 10 | 7 | 3 | 0 | 85% |
| Code Execution | 8 | 8 | 0 | 0 | 100% |
| AI Features | 17 | 10 | 2 | 5 | 65% |
| Scanner | 18 | 16 | 2 | 0 | 94% |
| Assessments | 6 | 2 | 3 | 1 | 50% |
| Billing | 12 | 6 | 1 | 5 | 54% |
| Admin | 17 | 16 | 1 | 0 | 97% |
| Integrations | 17 | 15 | 0 | 2 | 88% |
| DevOps | 9 | 6 | 2 | 1 | 78% |
| Hiring | 7 | 1 | 5 | 1 | 43% |
| User Features | 14 | 11 | 3 | 0 | 89% |
| **Total** | **154** | **104** | **30** | **20** | **78%** |

---

## AI Infrastructure

| Provider | Model | Use Case | Cost Tracking | Rate Limiting |
|----------|-------|----------|---------------|---------------|
| Anthropic | Claude Sonnet 4.5 | Reasoning, chat, code review, grading, agent, problem generation | ❌ None | ❌ None |
| Google | Gemini 3 Flash | Fast completions, hints, vision, code analysis, skill insights | ❌ None | ❌ None |
| OpenAI | GPT-4o | Interview service (adaptive questions) | ❌ None | ❌ None |
| OpenAI | GPT-4o-mini | AI chat via Vercel AI SDK | ❌ None | ❌ None |

**AI Security Gaps**:
- No prompt injection defense on any endpoint
- No output schema validation (manual `_parse_json_response()`)
- No semantic caching
- No model fallback chain
- No per-user cost tracking or quotas
- API key in URL query (Gemini — CRITICAL)

---

## Top 5 Immediate Actions

1. **Fix CRITICAL security issues** — Rotate committed MongoDB credentials, move Gemini key to header, harden JWT secret enforcement
2. **Add rate limiting** — AI endpoints, auth endpoints, API in general
3. **Add database indexes** — No indexes on any collection = full collection scans on every query
4. **Split god components** — `dashboard/layout.tsx` (685 lines) and `scanner/page.tsx` (689 lines)
5. **Implement prompt injection defense + cost tracking** — AI endpoints are unprotected and uncosted

# CodeSpectra Technical Debt Register

> **Auto-Generated**: Internal Engineering documentation.

> **Auto-generated:** Based on codebase audit. Last updated: 2026-09-06.
> **Priority:** CRITICAL > HIGH > MEDIUM > LOW

---

## Resolved 2026-09-06 (verified in code — rows below kept for history)

| ID | Resolution |
|---|---|
| C01 (JWT fallback secret) | `session.ts` prod hard-fail + Mongo-backed fallback secret |
| C03/C04 (login/signup rate limits) | `rateLimitRedis` per-IP (+per-email on login) |
| C05 (AI rate limits) | Upstash Redis + edge + per-route AI limits |
| H07/H08 (Stripe stubs) | Full `PaymentService` + real webhook sync; 503 only when unconfigured |
| H09 (email verification) | Partial — verify route + signup tokens; needs email provider |
| H10 (session revocation) | `session_version` enforced + bumped on password change; logout route |
| M03 (indexes) | `scripts/create-indexes.ts` with `createIndex` calls |
| L02 (tests) | Vitest suites (grading, lesson-video, captions, quiz, syllabus) green |
| L03 (CI/CD) | `.github/workflows/ci.yml` + doc-sync |
| L08 (model fallback) | `provider-fallback.ts` wired into AI backend |

---

## CRITICAL Items (Immediate Action Required)

| # | Category | Description | File:Line | Effort | Business Impact |
|---|----------|-------------|-----------|--------|-----------------|
| **C01** | **Security** | Hardcoded JWT fallback secret — `'fallback-dev-secret-do-not-use-in-production-32chars'` used when `SESSION_SECRET` env var is unset. Anyone with this known string can forge session tokens and impersonate any user. | `frontend/lib/session.ts:6` | 1h | Account takeover of all users |
| **C02** | **Security** | Gemini API key exposed in URL query string — `?key={key}` in `ai_client.py:55`. URLs are logged by proxies, CDNs, and browser history. | `backend/ai_client.py:55` | 2h | API key theft, $10k+/day AI billing fraud |
| **C03** | **Security** | No rate limiting on login endpoint — `/api/auth/login` can be brute-forced with unlimited attempts. | `frontend/app/api/auth/login/route.ts` | 4h | Credential stuffing attacks |
| **C04** | **Security** | No rate limiting on signup endpoint — `/api/auth/signup` can be spammed to create thousands of accounts. | `frontend/app/api/auth/signup/route.ts` | 4h | DB flood, email provider blacklisting |
| **C05** | **Security** | No rate limiting on AI endpoints — all 10 AI endpoints (`/api/ai/*`, `/internal/ai/*`) have no per-user or per-IP limits. | `backend/ai_router.py`, all `frontend/app/api/ai/*/route.ts` | 1d | Unbounded AI costs, potential bankruptcy |
| **C06** | **Security** | TOTP/2FA secrets stored without encryption — if 2FA is implemented, secrets must use AES-256-GCM (like GitHub tokens). | `frontend/lib/db/` (TOTP field) | 1d | 2FA bypass, account takeover |

---

## HIGH Items (Address in Phase 0–1)

| # | Category | Description | File:Line | Effort | Business Impact |
|---|----------|-------------|-----------|--------|-----------------|
| **H01** | **Architecture** | Dual auth library pattern — `route-auth.ts` has the real implementation; `api-auth.ts` is a thin re-export. This confuses Turbopack and creates maintenance overhead. | `frontend/lib/route-auth.ts`, `frontend/lib/api-auth.ts` | 2d | Developer confusion, import bugs |
| **H02** | **Data** | Collection name inconsistency — `users()` function returns `user` collection. `jobs()` function returns `job_postings`. Plural/singular mismatch across codebase. | `frontend/lib/db/admin.ts:96`, `frontend/lib/db/content.ts:130` | 1d | Runtime errors, data loss |
| **H03** | **Security** | No CSP/security headers — XSS, clickjacking, MIME-sniffing protections absent. | `frontend/next.config.mjs` | 4h | XSS attacks, clickjacking |
| **H04** | **Security** | No auth event audit logging — login, signup, 2FA, password changes not logged. | `frontend/app/api/auth/*/route.ts` | 1d | Cannot investigate security incidents |
| **H05** | **Code Quality** | Monolithic dashboard layout — 685-line god component mixing sidebar, nav, auth, notifications, theme, fetch interception. | `frontend/app/dashboard/layout.tsx` | 2d | Maintenance nightmare, poor DX |
| **H06** | **Code Quality** | Monolithic scanner page — 689-line god component with 16 sub-components, inline state for all scanner modes. | `frontend/app/dashboard/scanner/page.tsx` | 3d | Slow renders, merge conflicts, poor testability |
| **H07** | **Missing** | Billing checkout/subscription routes return 503 — `"Billing is not configured"`. Stripe integration is completely stubbed. | `frontend/app/api/billing/checkout/route.ts`, `frontend/app/api/billing/subscription/route.ts` | 5d | Zero revenue from billing |
| **H08** | **Missing** | Stripe webhook sync throws errors — all 3 sync functions (`syncCheckoutSessionCompleted`, `syncSubscriptionFromStripe`, `syncInvoiceFromStripe`) throw `new Error(DEAD)`. | `frontend/lib/stripe-webhook-sync.ts` | 3d | Cannot process Stripe payments |
| **H09** | **Missing** | No email verification flow — users can sign up with unverified emails. | `frontend/app/api/auth/signup/route.ts` | 2d | Fake accounts, email deliverability issues |
| **H10** | **Missing** | No session revocation — no token blacklist. Changing password doesn't invalidate existing sessions. | `frontend/lib/session.ts` | 1d | Stolen tokens remain valid until expiry |

---

## MEDIUM Items (Address in Phase 2–3)

| # | Category | Description | File:Line | Effort | Business Impact |
|---|----------|-------------|-----------|--------|-----------------|
| **M01** | **Security** | OAuth sign-in uses client-side popup only — no server-side session sync for Google/GitHub OAuth. | `frontend/lib/auth-context.tsx:168-182` | 2d | OAuth sessions unsynchronized across devices |
| **M02** | **Code Quality** | Manual `as any` type casts throughout DB layer — `db.collection('user').insertOne({...} as any)`. | Multiple `frontend/lib/db/*.ts` | 3d | Runtime type errors, poor DX |
| **M03** | **Missing** | No MongoDB indexes defined — no `ensureIndex` calls for email, slug, user_id+created_at. | `frontend/lib/mongodb.ts` | 1d | Slow queries as data grows |
| **M04** | **Missing** | No MongoDB transactions — multi-collection writes (billing + subscription, user + profile) not atomic. | `frontend/app/api/billing/*/route.ts` | 3d | Data inconsistency on partial failures |
| **M05** | **Missing** | No TTL indexes — audit logs, webhook events, session data never auto-expire. | `frontend/lib/db/admin.ts` | 1d | Unbounded collection growth |
| **M06** | **Code Quality** | Dead code — `auth-service.ts` is a stub that throws `"Supabase auth-service was removed"`. | `frontend/lib/auth-service.ts` | 1d | Dead code paths confuse developers |
| **M07** | **Code Quality** | `NOSONAR` / lint suppressions scattered — suggests suppressed warnings that should be fixed. | Multiple files | 2d | Hidden bugs |
| **M08** | **Architecture** | No caching layer — only AI response caching is missing (semantic caching). No Redis for session/rate-limit state. | `frontend/lib/` | 5d | Duplicate AI calls, poor latency |
| **M09** | **Security** | Scanner endpoints may lack auth — some scanner API routes need audit for session checks. | `frontend/app/api/scanner/*/route.ts` | 1d | Unauthenticated access to scan data |
| **M10** | **Architecture** | AI router lacks cost tracking — no per-user or per-request cost attribution. | `backend/ai_router.py` | 3d | Cannot bill or cap AI usage |

---

## LOW Items (Address in Phase 3–4)

| # | Category | Description | File:Line | Effort | Business Impact |
|---|----------|-------------|-----------|--------|-----------------|
| **L01** | **Code Quality** | `validateJob()`, `validateExam()`, `validateResume()` in `validation-schemas.ts` are hand-written — not using Zod schemas. | `frontend/lib/validation-schemas.ts` | 1d | Manual validation inconsistent |
| **L02** | **Missing** | No test coverage — Vitest configured but no meaningful tests found. | `/tests/` | 5d | Regressions undetected |
| **L03** | **Missing** | No CI/CD pipeline — no GitHub Actions for lint/test/build. | Root | 2d | Manual deployment, quality regressions |
| **L04** | **Architecture** | No OpenTelemetry — no traces, metrics, or distributed tracing. | Root | 3d | Poor observability in production |
| **L05** | **Architecture** | No connection pooling optimization — MongoDB `maxPoolSize: 20` is hardcoded. | `frontend/lib/mongodb.ts:31` | 1d | Connection exhaustion under load |
| **L06** | **Security** | AI output parsing is fragile — `_parse_json_response()` is a best-effort regex-based parser with no Zod/Pydantic validation. | `backend/ai_router.py:155-180` | 2d | Malformed AI output crashes routes |
| **L07** | **Architecture** | No prompt injection detection — user input is sent directly to LLM. | `backend/ai_client.py` | 3d | Prompt injection attacks |
| **L08** | **Architecture** | No model fallback chain — each endpoint uses a single model. No failover if provider is down. | `backend/ai_router.py:37-41` | 2d | AI features unavailable during provider outage |
| **L09** | **Code Quality** | `local-executor.ts` runs untrusted code in-process — documented as "NOT a sandbox" but relies only on auth gating. | `frontend/lib/local-executor.ts:20` | 2d | RCE if auth is bypassed |
| **L11** | **Missing** | No bundle analysis — large scanner component tree not code-split. | `frontend/app/dashboard/scanner/page.tsx` | 1d | Slow page loads |
| **L12** | **Code Quality** | `pricing-catalog.ts` and `billing-catalog.ts` likely duplicate — two plan catalogs. | `frontend/lib/` | 1d | Pricing drift between files |

---

## Debt Summary

| Priority | Count | Estimated Total Effort |
|----------|-------|----------------------|
| CRITICAL | 6 | ~3 days |
| HIGH | 10 | ~18 days |
| MEDIUM | 10 | ~22 days |
| LOW | 12 | ~26 days |
| **TOTAL** | **38** | **~69 days** |

## Priority-Impact Matrix

```
                  HIGH IMPACT
                      │
    C01 (JWT secret)  │  H03 (No CSP)
    C02 (API key URL) │  H04 (No auth audit)
    C03 (No login RL) │  H09 (No email verify)
    C04 (No signup RL)│  H10 (No session revoke)
    C05 (No AI RL)    │
    C06 (TOTP plain)  │
                      │
──────────────────────┼──────────────────────
   QUICK WIN          │  STRATEGIC
                      │
    M02 (as any)      │  H05 (God layout)
    M03 (Indexes)     │  H06 (God scanner)
    M06 (Dead code)   │  M04 (Transactions)
    L01 (Validation)  │  M08 (Caching)
    L05 (Pool size)   │  L02 (Tests)
                      │
                      │
                  LOW IMPACT
```

**Quick Wins (high impact, low effort):** C01 (1h), C02 (2h), C03 (4h), C04 (4h), C06 (1d), M02 (3d), M03 (1d)
**Strategic (high impact, high effort):** H01 (2d), H05 (2d), H06 (3d), H07 (5d), M04 (3d), M08 (5d)

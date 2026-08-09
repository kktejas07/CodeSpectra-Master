# OWASP Top 10 (2021) Compliance Checklist — CodeSpectra

> **Auto-Generated**: Internal Engineering documentation.

> **Last Updated:** 2026-07-08  
> **Assessment:** Manual codebase audit — not penetration tested  

---

## A01:2021 — Broken Access Control

**Status:** ⚠️ **PARTIALLY COMPLIANT**

| Finding | File:Line | Priority | Status |
|---------|-----------|----------|--------|
| RBAC enforced at middleware + route handler + component level | `middleware.ts`, `route-auth.ts`, `use-page-guard.ts` | — | ✅ |
| Role hierarchy properly implemented (superadmin > tenant_admin > user) | `frontend/lib/rbac.ts:99-103` | — | ✅ |
| API routes rely on developer discipline (no automatic API route protection) | `route-auth.ts` | **HIGH** | ❌ |
| Permission cache stale for 60s after role change | `route-auth.ts:22-27` | **MEDIUM** | ❌ |
| TOTP disable requires auth but not re-auth | `app/api/user/2fa/disable/route.ts:5-22` | **HIGH** | ❌ |
| No DB-level access control (MongoDB has no RLS) | All collections | **HIGH** | ❌ |

**Remediation:**
- Add catch-all API route middleware that checks route patterns against required roles
- Reduce permission cache TTL to 10s or use MongoDB change streams
- Require current password/TOTP code to disable 2FA
- Consider per-collection MongoDB access controls or use a proxy

---

## A02:2021 — Cryptographic Failures

**Status:** ⚠️ **PARTIALLY COMPLIANT**

| Finding | File:Line | Priority | Status |
|---------|-----------|----------|--------|
| JWT session tokens signed with HS256 (symmetric) — falls back to hardcoded secret | `frontend/lib/session.ts:6` | **CRITICAL** | ❌ |
| Session cookie set `secure: true` only in production | `frontend/lib/session.ts:37` | **LOW** | ✅ |
| GitHub tokens optionally encrypted with AES-256-GCM | `frontend/lib/github-token-crypto.ts` | **MEDIUM** | ⚠️ |
| Passwords hashed with bcrypt via Better Auth | Better Auth lib | — | ✅ |
| MongoDB credentials in plaintext in committed `.env` | `backend/.env:1` | **CRITICAL** | ❌ |
| Gemini API key in URL query parameter | `backend/ai_client.py:55` | **CRITICAL** | ❌ |

**Remediation:**
- Switch JWT signing to RS256 (asymmetric) or enforce `SESSION_SECRET` in production
- Remove `.env` from git history; rotate MongoDB credentials
- Send Gemini API key as `x-goog-api-key` header instead of query param
- Make GitHub token encryption mandatory in production

---

## A03:2021 — Injection

**Status:** ✅ **COMPLIANT**

| Finding | File:Line | Priority | Status |
|---------|-----------|----------|--------|
| MongoDB queries use parameterized filters (no raw query strings) | All `findOne`, `updateOne` calls | — | ✅ |
| API inputs validated via Zod schemas (where implemented) | `frontend/lib/validation-schemas.ts` | — | ✅ |
| No eval() or similar dangerous functions found | — | — | ✅ |
| Piston code execution uses sandboxed environment | Docker `privileged: true` but Piston isolates | **MEDIUM** | ⚠️ |

**Remediation:**
- Add input validation to all API routes without Zod schemas
- Review Piston's sandbox escape surface

---

## A04:2021 — Insecure Design

**Status:** ⚠️ **PARTIALLY COMPLIANT**

| Finding | File:Line | Priority | Status |
|---------|-----------|----------|--------|
| Missing rate limiting on AI endpoints (LLM cost exposure) | `backend/ai_router.py` | **CRITICAL** | ❌ |
| No rate limiting on login/signup (brute force) | Auth routes | **HIGH** | ❌ |
| Upstash rate limiter falls back to in-memory (per instance) | `frontend/lib/upstash-rate-limit.ts:45-47` | **HIGH** | ❌ |
| Piston code execution has no per-user quota | — | **MEDIUM** | ❌ |
| Webhook signature verification present for Razorpay | `frontend/lib/razorpay-server.ts:79-90` | — | ✅ |
| Stripe webhook sync is a stub (throws error) | `frontend/lib/stripe-webhook-sync.ts` | **HIGH** | ❌ |

**Remediation:**
- Add per-user + per-IP rate limiting to all AI backend endpoints
- Make Upstash/Redis rate limiter mandatory in production (fail closed)
- Implement per-user daily quota for code execution
- Implement Stripe webhook handler with signature verification

---

## A05:2021 — Security Misconfiguration

**Status:** ⚠️ **PARTIALLY COMPLIANT**

| Finding | File:Line | Priority | Status |
|---------|-----------|----------|--------|
| CORS configured (origin list) | `.env.docker:5` | — | ✅ |
| `httpOnly` + `sameSite` session cookies | `frontend/lib/session.ts:35-41` | — | ✅ |
| Firebase Admin falls back silently when unconfigured | `frontend/lib/firebase-admin.ts:13` | **MEDIUM** | ❌ |
| `auth-service.ts` is dead stub with orphaned imports | `frontend/lib/auth-service.ts` | **LOW** | ❌ |
| Three independent auth providers (complex failure chain) | `route-auth.ts:56-89` | **MEDIUM** | ❌ |

**Remediation:**
- Fail hard at startup if required auth providers are misconfigured
- Remove dead `auth-service.ts` and all its imports
- Simplify auth provider chain

---

## A06:2021 — Vulnerable and Outdated Components

**Status:** ⚠️ **PARTIALLY COMPLIANT**

| Finding | File:Line | Priority | Status |
|---------|-----------|----------|--------|
| Node 22 (Alpine) — current LTS | `frontend/Dockerfile:1` | — | ✅ |
| Python 3.12-slim — recent | `backend/Dockerfile:1` | — | ✅ |
| Package versions not audited for CVEs | — | **HIGH** | ❌ |

**Remediation:**
- Run `yarn audit` / `npm audit` before deployment
- Add Dependabot / Renovate for automated dependency updates
- Regularly scan Docker images for known vulnerabilities

---

## A07:2021 — Identification and Authentication Failures

**Status:** ⚠️ **PARTIALLY COMPLIANT**

| Finding | File:Line | Priority | Status |
|---------|-----------|----------|--------|
| JWT fallback secret when `SESSION_SECRET` unset | `frontend/lib/session.ts:6` | **CRITICAL** | ❌ |
| TOTP 2FA implemented (setup + verify + disable) | `app/api/user/2fa/*` | — | ✅ |
| Audit logging for auth events (login/signup/2FA/rate-limit) | `lib/db/misc.ts:89` `writeAuditLog` | — | ✅ |
| Session cookie 7-day lifetime (long) | `frontend/lib/session.ts:20` | **MEDIUM** | ❌ |
| Per-IP + per-email rate limiting on login (10/5 per min) | `app/api/auth/login/route.ts` | — | ✅ |
| Rate limiting on signup (3/hr/IP), forgot/reset password, verify email | `app/api/auth/*` | — | ✅ |
| Global API rate limiter (240 req/min/IP) + Retry-After | `middleware.ts`, `lib/edge-rate-limit.ts` | — | ✅ |
| Brute-force lockout: 3 failed logins/IP in 10 min → auto-block IP | `app/api/auth/login/route.ts`, `lib/db/security.ts:blockIp` | — | ✅ |
| Device fingerprint tracking (FingerprintJS v5) for multi-account abuse | `lib/fingerprint.ts`, `lib/db/security.ts:trackDeviceFingerprint` | — | ✅ |
| Impossible-travel detection (country change <2h) | `lib/db/security.ts:detectImpossibleTravel` | — | ✅ |
| IP Whitelist (IPv4 CIDR) enforcement when enabled | `lib/db/security.ts:isIpOutsideWhitelist` | — | ✅ |
| Blocked-IP blocklist enforced on login/signup/session | `lib/db/security.ts:isIpBlocked` | — | ✅ |
| Concurrent session limit (prune oldest) | `app/api/auth/login/route.ts` | — | ✅ |

**Remediation:**
- Enforce `SESSION_SECRET` in production; use RS256 for session tokens
- Reduce session lifetime or implement refresh token rotation
- Add per-user + per-IP rate limiting to all AI backend endpoints (`backend/ai_router.py`)

---

## A08:2021 — Software and Data Integrity Failures

**Status:** ⚠️ **PARTIALLY COMPLIANT**

| Finding | File:Line | Priority | Status |
|---------|-----------|----------|--------|
| Razorpay webhook signature verification (HMAC-SHA256) | `frontend/lib/razorpay-server.ts:79-90` | — | ✅ |
| Stripe webhook handler is a stub (no verification) | `frontend/lib/stripe-webhook-sync.ts` | **HIGH** | ❌ |
| No CI/CD pipeline with automated security checks | — | **HIGH** | ❌ |
| `yarn.lock` / `package.json` present but no integrity verification in Docker build | `frontend/Dockerfile:21` | **LOW** | ❌ |

**Remediation:**
- Implement Stripe webhook handler with `stripe.webhooks.constructEvent()`
- Add GitHub Actions CI with SAST, dependency scanning, and secrets detection
- Use `--frozen-lockfile` strictly in Docker builds

---

## A09:2021 — Security Logging and Monitoring Failures

**Status:** ❌ **NON-COMPLIANT**

| Finding | File:Line | Priority | Status |
|---------|-----------|----------|--------|
| All logging uses `console.error()` / `console.warn()` | Throughout codebase | **HIGH** | ❌ |
| No structured logging (JSON, correlation IDs) | — | **MEDIUM** | ❌ |
| No centralized log aggregation | — | **HIGH** | ❌ |
| `admin_audit_logs` collection exists but is NEVER written to | `frontend/lib/db/misc.ts:70` | **HIGH** | ❌ |
| No APM or performance monitoring | — | **MEDIUM** | ❌ |
| WebVitalsReporter exists (client-side only) | — | **LOW** | ✅ |

**Remediation:**
- Implement structured logging with pino or winston (request IDs, severity, timestamp)
- Write auth events to `admin_audit_logs` collection
- Integrate Sentry or similar for error tracking
- Set up log aggregation (ELK, Grafana Loki, or Datadog)

---

## A10:2021 — Server-Side Request Forgery (SSRF)

**Status:** ✅ **COMPLIANT**

| Finding | File:Line | Priority | Status |
|---------|-----------|----------|--------|
| Outbound HTTP calls limited to known services (Firebase, Gemini, Anthropic, Upstash) | — | — | ✅ |
| Piston URL configurable but expected to be internal (Docker network) | `docker-compose.yml:36` | — | ✅ |
| Backend proxy only forwards to `NEXTJS_INTERNAL_URL` | `backend/server.py:22` | — | ✅ |
| No user-supplied URLs fetched server-side | — | — | ✅ |

**Remediation:**
- Continue to validate any new outbound HTTP targets
- Consider network policies restricting egress

---

## Overall Compliance Summary

| Category | Status | Critical | High | Medium | Low |
|----------|--------|----------|------|-------|-----|
| A01 — Broken Access Control | ⚠️ Partial | 0 | 3 | 1 | 0 |
| A02 — Cryptographic Failures | ⚠️ Partial | 3 | 0 | 1 | 1 |
| A03 — Injection | ✅ Good | 0 | 0 | 1 | 0 |
| A04 — Insecure Design | ⚠️ Partial | 1 | 3 | 1 | 0 |
| A05 — Security Misconfiguration | ⚠️ Partial | 0 | 0 | 2 | 1 |
| A06 — Vulnerable Components | ⚠️ Partial | 0 | 1 | 0 | 0 |
| A07 — Auth Failures | ⚠️ Partial | 1 | 3 | 1 | 0 |
| A08 — Data Integrity | ⚠️ Partial | 0 | 2 | 0 | 1 |
| A09 — Logging & Monitoring | ❌ Non-compliant | 0 | 3 | 1 | 1 |
| A10 — SSRF | ✅ Good | 0 | 0 | 0 | 0 |

**Totals: CRITICAL=5, HIGH=15, MEDIUM=7, LOW=4**

# STRIDE Threat Model — CodeSpectra

> **Last Updated:** 2026-07-08  
> **Audit Scope:** Full codebase (frontend/, backend/, lib/)  
> **Risk Rating:** CRITICAL / HIGH / MEDIUM / LOW

---

## Spoofing — Authentication Bypass

| # | Finding | Impact | Likelihood | Current Mitigation | Recommended Mitigation |
|---|---------|--------|------------|--------------------|------------------------|
| S1 | **JWT fallback secret** — `frontend/lib/session.ts:6` uses `'fallback-dev-secret-do-not-use-in-production-32chars'` when `SESSION_SECRET` env var is unset. Anyone who knows this string can forge arbitrary session tokens. | **Full account takeover** — attacker crafts a session cookie for any uid/email/role. | **HIGH** (default in dev; production depends on env config). | None at code level; warning in string name. | Fail hard at startup if `SESSION_SECRET` is unset in production. Add runtime guard in `signSessionToken()`. |
| S2 | **Firebase Admin silent fallback** — `frontend/lib/firebase-admin.ts:13` returns `null` silently when credentials are missing. `getAPIUser()` in `route-auth.ts:64` skips Firebase verification and falls through to Jose-based token verify. | Session token minted with fallback secret is accepted. | **MEDIUM** | `verifySessionToken()` call after Firebase Admin returns null. | Remove fallback chain; enforce at least one provider is configured. |
| S3 | **Bearer token from Authorization header** — `route-auth.ts:74-83` accepts Firebase `verifyIdToken` without CSRF protection. Token can be leaked via browser extension or XSS. | Session hijacking via leaked token. | **MEDIUM** | Token must be a valid Firebase ID token. | Bind tokens to session cookies only; disable Bearer header auth for browser clients. |

---

## Tampering — Webhook / Data Integrity

| # | Finding | Impact | Likelihood | Current Mitigation | Recommended Mitigation |
|---|---------|--------|------------|--------------------|------------------------|
| T1 | **Stripe webhook stub** — `frontend/lib/stripe-webhook-sync.ts:9-16` is a Phase 7 stub that throws `Error(DEAD)`. Any Stripe webhook call returns 500. | No Stripe events processed; no signature verification exists for Stripe. | **HIGH** (if Stripe is used in production). | Stub prevents silent data corruption. | Implement webhook handler with `stripe.webhooks.constructEvent()` signature verification. |
| T2 | **Razorpay webhook verification OK** — `frontend/lib/razorpay-server.ts:79-90` uses HMAC-SHA256 with timing-safe comparison. `frontend/app/api/billing/webhook/route.ts:30` validates signature before processing. | No issue per se — but webhook_secret can be stored in DB or env, and DB-derived secrets may be stale. | **LOW** | HMAC-SHA256 + `timingSafeEqual`. | Add webhook secret rotation support; log when DB-derived secret is used vs env. |
| T3 | **GitHub OAuth token stored without encryption by default** — `frontend/lib/github-api-auth.ts:16` notes tokens are "stored unencrypted by default". `frontend/lib/github-token-crypto.ts` provides AES-256-GCM encryption but requires `GITHUB_TOKEN_ENCRYPTION_KEY` env var. | Leaked GitHub tokens in DB if DB is breached. | **MEDIUM** | Optional encryption layer exists. | Make encryption mandatory in production; warn at startup if key is missing. |

---

## Repudiation — Missing Audit Trails

| # | Finding | Impact | Likelihood | Current Mitigation | Recommended Mitigation |
|---|---------|--------|------------|--------------------|------------------------|
| R1 | **No audit logging for auth events** — Login, logout, signup, 2FA enable/disable events are not written to `admin_audit_logs` (defined in `frontend/lib/db/misc.ts:70`). | Cannot investigate unauthorized access or brute-force attempts. | **HIGH** | Collection exists (`admin_audit_logs`) but is never written to by auth routes. | Add middleware or wrapper that logs `{ user_id, action, ip, user_agent, timestamp }` for all auth mutations. |
| R2 | **No audit logging for admin role changes** — `route-auth.ts` has `invalidatePermissionCache()` but no corresponding audit entry when roles change. | Role assignment cannot be traced. | **HIGH** | None. | Log role changes to `admin_audit_logs` with old/new role, admin who made change. |
| R3 | **console.error only logging** — All errors use `console.error('[CodeSpectra] ...')` (e.g., `route-auth.ts:86`, `firebase-admin.ts:34`). No structured logs, no correlation IDs. | Forensic analysis impossible; cannot trace request chains. | **MEDIUM** | Prefix `[CodeSpectra]` for grep-ability. | Implement structured JSON logging with request IDs, timestamps, and severity levels. |

---

## Information Disclosure — Secrets & Credentials

| # | Finding | Impact | Likelihood | Current Mitigation | Recommended Mitigation |
|---|---------|--------|------------|--------------------|------------------------|
| I1 | **Gemini API key in URL query parameter** — `backend/ai_client.py:55` appends `?key={key}` to the Gemini API URL. API keys in URLs are logged by proxies, load balancers, and browser history. | Credential leak via access logs, referrer headers, or history. | **CRITICAL** | None. | Move API key to `x-goog-api-key` header (Gemini supports this). |
| I2 | **Hardcoded MongoDB credentials in committed `.env`** — `backend/.env:1` contains `MONGO_URL` with username and password in plaintext, committed to the repository. | Full database access for anyone with repo access. | **CRITICAL** | None (file is in `.gitignore` but is tracked and committed). | Rotate credentials immediately; remove from git history (BFG Repo-Cleaner); use secret manager or env-only. |
| I3 | **Firebase config returned from API** — `frontend/lib/firebase.ts:44` calls `/api/firebase-config` which returns Firebase credentials. While Firebase API keys are intentionally public, the `projectId` + `appId` combination aids targeted attacks. | LOW (Firebase keys are designed to be public). | **LOW** | None needed per Firebase docs. | N/A — this is by design. |
| I4 | **Server secrets cached in process memory** — `frontend/lib/server-secrets-cache.ts:72-107` caches all integration secrets (Razorpay keys, email passwords, etc.) in a process-level variable with no TTL enforcement beyond `cacheValid` boolean. | Secrets stale after admin rotation until `warmServerSecretsCache()` is called. | **LOW** | `invalidateServerSecretsCache()` exists but must be explicitly called. | Add TTL-based automatic cache invalidation. |

---

## Denial of Service — No Rate Limiting

| # | Finding | Impact | Likelihood | Current Mitigation | Recommended Mitigation |
|---|---------|--------|------------|--------------------|------------------------|
| D1 | **No rate limiting on AI backend endpoints** — `backend/ai_router.py` exposes `/chat`, `/complete`, `/code-review`, `/grade`, `/generate-problem`, `/agent`, etc. No rate limiter at the FastAPI level. | Attacker can exhaust LLM quota or cause runaway costs. | **CRITICAL** | The Next.js API routes calling the backend authenticate via session, but no per-user throttling. | Add per-user + per-IP rate limiting in FastAPI middleware; implement token bucket for LLM API calls. |
| D2 | **Rate limiter is optional and best-effort** — `frontend/lib/upstash-rate-limit.ts:45-47` falls back to in-memory (per-instance) limiter when Upstash is not configured. `frontend/lib/in-memory-rate-limit.ts` is process-local and resets on restart. | Single-node limit bypassed after restart; multi-node has no distributed coordination without Upstash. | **HIGH** | Upstash Redis-based limiter works when configured. | Make Upstash (or equivalent Redis) mandatory in production; fail closed if not configured. |
| D3 | **No rate limiting on login/signup endpoints** — No rate limit wrapper found on auth API routes. | Brute-force password attacks; account enumeration. | **HIGH** | None visible in auth routes. | Add exponential backoff per IP + per email on login failures. |
| D4 | **Piston code execution unbounded** — Piston runs with `privileged: true` (`docker-compose.yml:7`), and the frontend's PISTON_URL is configurable via `server-secrets-cache.ts`. No per-user execution limits. | Attacker can execute arbitrary code in sandbox; resource exhaustion. | **MEDIUM** | Piston itself sandboxes execution. | Add per-user daily execution quotas; monitor Piston resource usage. |

---

## Elevation of Privilege — Role Escalation

| # | Finding | Impact | Likelihood | Current Mitigation | Recommended Mitigation |
|---|---------|--------|------------|--------------------|------------------------|
| E1 | **TOTP disable without re-authentication** — `frontend/app/api/user/2fa/disable/route.ts:5-22` requires only `requireAuth()` (any logged-in session). No password re-prompt, no TOTP code re-verification. | If a session is hijacked (XSS, stolen cookie), attacker disables 2FA silently. | **HIGH** | Requires session cookie. | Require current password OR current TOTP code before disabling 2FA. |
| E2 | **Permission cache stale for up to 60 seconds** — `frontend/lib/route-auth.ts:22-27` caches MongoDB role permissions in memory for 60 seconds. Role changes take up to 60s to propagate. | User retains elevated privileges for up to 60s after demotion. | **MEDIUM** | 60-second TTL. | Reduce TTL to 10s or use real-time subscription (MongoDB change streams). |
| E3 | **Role hierarchy in middleware not enforced for API routes** — API route protection uses `requireAuth()` / `requireAdmin()` / `requireSuperAdmin()` from `route-auth.ts`. Middleware (`middleware.ts`) protects pages but API routes rely solely on route handler guards. | If a developer forgets `requireSuperAdmin()` on a new admin API route, any logged-in user can call it. | **MEDIUM** | None — relies on developer discipline. | Add API route middleware that checks role against route pattern match. |
| E4 | **Supabase `auth-service.ts` is dead but still importable** — `frontend/lib/auth-service.ts:18-46` returns `{ success: false, error: DEAD }`. Orphaned imports may mask broken auth flows. | Developer confusion; potential security hole if used in unexpected path. | **LOW** | Stub returns error. | Remove dead code and all imports. |

---

## Risk Summary

| Severity | Count | Key Actions |
|----------|-------|-------------|
| CRITICAL | 3 | I1 (Gemini key in URL), I2 (hardcoded DB creds), D1 (no AI rate limit) |
| HIGH | 7 | S1, T1, R1, R2, D2, D3, E1 |
| MEDIUM | 5 | S2, S3, T3, R3, E2, E3 |
| LOW | 3 | T2, I3, I4, E4 |

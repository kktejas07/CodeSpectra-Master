# Security Hardening Plan — CodeSpectra

## Summary
Comprehensive fix for all findings from the security audit. Organized into 10 independent groups applied sequentially. All changes backward-compatible.

---

## Group 1: Hardcoded JWT Secrets (CRITICAL)

**Problem:** Two files contain hardcoded JWT secrets visible in source code.
- `frontend/app/api/auth/login/route.ts:5` — `"your-super-secret-jwt-key-change-in-production-2024"`
- `frontend/lib/session.ts:6` — `"your-super-secret-jwt-key-change-in-production-2024-secure-token"`

**Fix:**
1. Both files read from `process.env.JWT_SECRET` with a runtime error if missing (no usable default).
2. Add `JWT_SECRET` to `.env.example`.

**Files to edit:** `login/route.ts`, `session.ts`, `.env.example`

---

## Group 2: NoSQL Injection — $regex (CRITICAL)

**Problem:** User input passed directly into MongoDB `$regex` operators without escaping.

**Affected endpoints:**
- `frontend/app/api/problems/route.ts:30` — `searchParams` → `$regex: query`
- `frontend/app/api/admin/audit-logs/route.ts` — `searchParams.get("q")` → `$regex: term`

**Fix:**
1. Create `frontend/lib/sanitize.ts` with `sanitizeRegex(str)` that escapes all regex metacharacters.
2. Apply to every user value entering a `$regex` query.

**Files to edit:** Create `sanitize.ts`, edit `problems/route.ts`, `audit-logs/route.ts`

---

## Group 3: Command Injection in Admin Cache Clear (CRITICAL)

**Problem:** `frontend/app/api/admin/system/cache/route.ts` uses `execSync` and `execFile('bash', ['-c', script])` with user-supplied script name. RCE via compromised admin session.

**Fix:**
1. Replace shell execution with a strict allowlist of permitted cache-clear script names.
2. Only execute scripts from the allowlist; reject anything else.

**Files to edit:** `admin/system/cache/route.ts`

---

## Group 4: SSRF Protection (HIGH)

**Problem:** Multiple endpoints fetch user-controlled URLs without blocking private IPs/localhost/metadata endpoints.

**Affected:** `admin/llm-config/test/route.ts`, `admin/llm-config/route.ts`, `admin/system/stats/route.ts`, `ai/codebase-chat/route.ts`, `qr/[token]/route.ts`

**Fix:**
1. Create `frontend/lib/url-safety.ts` with `isSafeUrl()` that blocks private/loopback IPs, metadata endpoints, non-HTTP protocols.
2. Apply before every `fetch()` call at the affected endpoints.

**Files to edit:** Create `url-safety.ts`, edit 5 route files

---

## Group 5: Error Information Leakage (MEDIUM)

**Problem:** Internal error messages returned to clients (`err.message` in JSON responses).

**Affected:** `ai-inventory/route.ts`, `ai-inventory/[id]/route.ts`, and any other routes with same pattern.

**Fix:** Replace `err.message` in responses with generic "Internal server error". Log real error server-side.

**Files to edit:** All route files returning `err.message`

---

## Group 6: User Enumeration in Forgot Password (MEDIUM)

**Problem:** `forgot-password/route.ts` returns different messages for existing vs non-existing emails.

**Fix:** Always return the same generic success message regardless of email existence.

**Files to edit:** `auth/forgot-password/route.ts`

---

## Group 7: Content Security Policy & Security Headers (MEDIUM)

**Problem:** CSP has `'unsafe-inline'` and `'unsafe-eval'` in `script-src`.

**Fix:**
1. Remove `'unsafe-eval'` from CSP (verify no eval/new Function usage first).
2. Add `base-uri: 'self'`, `form-action: 'self'` to CSP.
3. Note: `'unsafe-inline'` may be required for Next.js hydration — keep if needed but document.

**Files to edit:** `frontend/next.config.mjs`

---

## Group 8: Type Confusion in Login (MEDIUM)

**Problem:** `login/route.ts` checks `typeof password === "string"` but doesn't explicitly check `email` type.

**Fix:** Add `typeof email === "string"` guard to match.

**Files to edit:** `auth/login/route.ts`

---

## Group 9: Schema Validation Coverage (LOW-MEDIUM)

**Problem:** Some POST/PATCH handlers (ai-inventory) don't use zod validation.

**Fix:** Add zod schemas for create/update operations in ai-inventory routes.

**Files to edit:** `ai-inventory/route.ts`, `ai-inventory/[id]/route.ts`

---

## Group 10: `ignoreBuildErrors` (LOW)

**Problem:** `typescript: { ignoreBuildErrors: true }` hides type errors in production builds.

**Fix:** Remove the flag if possible; if not, add a `// SECURITY TODO` comment.

**Files to edit:** `frontend/next.config.mjs`

---

## New Files Created
| File | Purpose |
|------|---------|
| `frontend/lib/sanitize.ts` | `sanitizeRegex()` for NoSQL regex safety |
| `frontend/lib/url-safety.ts` | `isSafeUrl()` for SSRF protection |

## Risk Assessment
- **Groups 1-2, 5-6, 8-10:** Zero/low risk — only tighten existing behavior
- **Group 3 (cache scripts):** Verify all legitimate cache scripts are in the allowlist
- **Group 4 (SSRF):** Low risk — only blocks known-bad IP ranges
- **Group 7 (CSP):** Medium risk — removing `unsafe-eval` could break code using `eval()`. Verify first.

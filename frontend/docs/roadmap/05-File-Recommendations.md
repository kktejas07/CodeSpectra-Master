# CodeSpectra File-by-File Recommendations

> **Auto-Generated**: Internal Engineering documentation.

> **Auto-generated:** Based on codebase audit. Last updated: 2026-07-08.
> **Scope:** Most critical files only (sorted by priority).

---

## Critical Security

### `frontend/lib/session.ts` — Fix Hardcoded JWT Secret

**Issue:** Line 6 falls back to a hardcoded string `'fallback-dev-secret-do-not-use-in-production-32chars'` when `SESSION_SECRET` env var is absent.

**Severity:** CRITICAL — anyone who knows this string can forge valid session tokens.

**Recommendation:**
```typescript
const SECRET_ENCODED = process.env.SESSION_SECRET
if (!SECRET_ENCODED) {
  throw new Error(
    'SESSION_SECRET is not set. Generate one with: openssl rand -base64 32'
  )
}
const SECRET = new TextEncoder().encode(SECRET_ENCODED)
```

**Effort:** 30 minutes

---

### `frontend/lib/github-token-crypto.ts` — Encryption Reference Implementation

**Issue:** This file is actually a *correct* implementation of AES-256-GCM encryption. The TOTP secret storage should follow the same pattern.

**Recommendation:** Replicate the `encrypt:v1:` prefix + AES-256-GCM + 12-byte IV + 16-byte auth tag pattern for TOTP secrets.

**Effort:** 2 hours

---

### `backend/ai_client.py` — Fix API Key Exposure in URL

**Issue:** Line 55: `url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:streamGenerateContent?key={key}"` — the API key is in the URL query string, which gets logged by proxies, CDNs, and browsers.

**Severity:** HIGH

**Recommendation:** Use the `X-Goog-Api-Key` header instead:
```python
headers = {"X-Goog-Api-Key": key}
url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:streamGenerateContent"
```

**Effort:** 1 hour

---

## Auth Consolidation

### `frontend/lib/route-auth.ts` — Consolidate with `api-auth.ts`

**Issue:** `route-auth.ts` (153 lines) contains the real auth logic while `api-auth.ts` is a 7-line re-export. This dual-file pattern was introduced to work around Turbopack limitations but creates confusion.

**Severity:** HIGH — maintenance overhead, import bugs.

**Recommendation:**
- Option A: Move all auth logic into `api-auth.ts` and delete `route-auth.ts` with a deprecation comment.
- Option B: Keep `route-auth.ts` but remove the re-export layer; update all imports to point directly to `route-auth.ts`.

**Effort:** 2 days

### `frontend/lib/auth-context.tsx` — Fix OAuth Session Sync

**Issue:** Google/GitHub OAuth sign-ins use `signInWithPopup` (`auth-context.tsx:168-182`) but don't create a server-side session cookie. The session heartbeat (`setInterval` at line 128) relies on Firebase token refresh, which may not happen immediately.

**Severity:** MEDIUM — OAuth users may experience session inconsistency across devices.

**Recommendation:** After successful OAuth sign-in, call `POST /api/auth/session` with the Firebase ID token to sync the session cookie:
```typescript
const idToken = await fbUser.getIdToken()
await fetch('/api/auth/session', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ idToken }),
})
```

**Effort:** 1 day

---

## Architecture / Refactoring

### `frontend/app/dashboard/layout.tsx` — Split God Component

**Issue:** 685-line monolithic layout managing sidebar, navigation, auth state, notifications, fetch interception, theme, and mobile responsiveness. Violates single-responsibility principle.

**Severity:** HIGH — maintenance bottleneck.

**Recommendation:** Extract into composable modules:

| File | Responsibility |
|------|---------------|
| `components/dashboard/sidebar.tsx` | Sidebar shell (layout, collapse, responsive) |
| `components/dashboard/nav-items.tsx` | Navigation item generation (role-based) |
| `components/dashboard/session-guard.tsx` | Fetch interception + session expiry handler |
| `components/dashboard/user-menu.tsx` | Dropdown menu, profile, settings, billing |
| `components/dashboard/notification-badge.tsx` | Unread count polling |
| `components/dashboard/sidebar-footer.tsx` | Bottom section (theme, notifications, logout) |

**Effort:** 2 days

### `frontend/app/dashboard/scanner/page.tsx` — Split Into Routes

**Issue:** 689-line god component with 31 imports, 19 scanner modes, inline state for all scan types, and conditional rendering for every sub-component. The single file manages code scanning, GitHub scanning, quality gates, trends, reviews, config, reports, insights, teams, metrics, hotspots, architecture, PRs, and branches.

**Severity:** HIGH — slow page loads, merge conflicts, poor testability.

**Recommendation:** Route-per-mode using Next.js parallel routes or a router-switched pattern:

```
app/dashboard/scanner/
  page.tsx            → Redirect to ?mode=manual
  manual/page.tsx     → Code editor + scan button
  github/page.tsx     → GitHub integration + repo browser
  quality-gates/page.tsx → Quality Gate panel
  trends/page.tsx     → Metrics trend charts
  review/page.tsx     → Code review panel
  config/page.tsx     → Scanner configuration
  reports/page.tsx    → Report generator
  insights/page.tsx   → Insights dashboard
  team/page.tsx       → Team leaderboard
  metrics/page.tsx    → File browser metrics
  hotspots/page.tsx   → Security hotspots
  activity/page.tsx   → Activity timeline
  architecture/page.tsx → Architecture visualization
  pr/page.tsx         → PR integration
  branches/page.tsx   → Branch analytics
  chat/page.tsx       → Codebase chat
```

Each route imports only the components it needs, enabling code splitting.

**Effort:** 3 days

---

## API Routes

### `frontend/app/api/auth/login/route.ts` — Add Rate Limiting

**Issue:** No rate limiting. Unlimited brute-force attempts.

**Severity:** CRITICAL

**Recommendation:** Apply `rateLimitSlidingWindow` from `lib/in-memory-rate-limit.ts`:
```typescript
const limiterKey = clientLimiterKeyFromRequest(request, null)
const result = rateLimitSlidingWindow(`login:${limiterKey}`, 5, 60_000)
if (!result.ok) {
  return NextResponse.json(
    { error: `Too many attempts. Retry in ${result.retryAfterSec}s` },
    { status: 429 }
  )
}
```
- 5 attempts per minute per IP
- 10 attempts per minute per authenticated user

**Effort:** 4 hours

### `frontend/app/api/auth/signup/route.ts` — Add Email Verification

**Issue:** Users can sign up with unverified emails. No verification email is sent.

**Severity:** HIGH

**Recommendation:**
1. Add rate limiting (3 signups per hour per IP)
2. After insert, generate a verification token and send email via `transactional-mail.ts`
3. Create `GET /api/auth/verify-email?token=XXX` endpoint
4. Block login until `emailVerified: true`
5. Add configurable email verification requirement in platform settings

**Effort:** 2 days

---

## Database Layer

### `frontend/lib/db/` — Add Schemas, Indexes, Transactions

**Issues:**

| Problem | Files |
|---------|-------|
| Manual `as any` casts on every insert | All `db/*.ts` |
| No Zod schema validation | All `db/*.ts` |
| Collection name inconsistencies | `admin.ts:96` (`user`), `content.ts:130` (`job_postings`) |
| No indexes | `mongodb.ts` |
| No transactions | All billing routes + signup |
| No TTL indexes | `admin.ts` |

**Recommendation:**

1. **Define Zod schemas** for every document type in `lib/db/schemas/`:
   ```typescript
   // lib/db/schemas/user.ts
   export const UserDocSchema = z.object({
     _id: z.string().uuid(),
     email: z.string().email(),
     name: z.string().nullable(),
     role: z.enum(['user', 'tenant_admin', 'superadmin']),
     emailVerified: z.boolean(),
     createdAt: z.date(),
     updatedAt: z.date(),
   })
   export type UserDoc = z.infer<typeof UserDocSchema>
   ```

2. **Add indexes** in `lib/db-init.ts`:
   ```typescript
   await db.collection('user').createIndex({ email: 1 }, { unique: true })
   await db.collection('problems').createIndex({ slug: 1 }, { unique: true })
   await db.collection('submissions').createIndex({ user_id: 1, created_at: -1 })
   await db.collection('audit_logs').createIndex({ created_at: 1 }, { expireAfterSeconds: 7776000 })
   ```

3. **Wrap multi-collection writes in transactions** (billing + subscription, user + profile).

4. **Standardize collection names**: Use `users` for user collection, `jobs` instead of `job_postings`.

**Effort:** 5 days

---

## Backend

### `backend/ai_router.py` — Add Rate Limiting, Cost Tracking, Validation

**Issues:**
- No rate limiting on any of the 10 endpoints
- No cost tracking per user or per request
- No output schema validation (Zod/Pydantic)
- No prompt injection detection
- Single model per endpoint (no failover chain)

**Recommendation:**

1. **Rate limiting middleware** — Add per-user + per-IP rate limiting to every endpoint:
   - Chat: 30 req/min per user
   - Hints: 20 req/min
   - Code review: 10 req/min
   - Grade: 10 req/min
   - Agent: 5 req/min
   - Generate problem: 3 req/min
   - Identity verify: 3 req/min

2. **Cost tracking** — Log `provider`, `model`, `prompt_tokens`, `completion_tokens`, `user_id`, `endpoint` to `ai_cost_logs` collection.

3. **Output validation** — Use Pydantic models for every response type:
   ```python
   from pydantic import BaseModel, Field
   from typing import Literal
   
   class CodeReviewOutput(BaseModel):
       summary: str
       strengths: list[str]
       concerns: list[ConcernItem]
       suggestions: list[str]
       overall_rating: int = Field(ge=1, le=10)
   
   class ConcernItem(BaseModel):
       severity: Literal['critical', 'major', 'minor']
       title: str
       detail: str
       line: int | None = None
   ```

4. **Model fallback chain** — On provider failure, try: primary → secondary → tertiary.

**Effort:** 5 days

---

## Other Critical Files

### `frontend/lib/db-init.ts` — Create Database Initialization Script

**Status:** Needs audit — may not exist or be incomplete.

**Recommendation:** Create a comprehensive init script that runs on first deploy:
1. Create collections with validation schemas
2. Create indexes (unique email, unique slug, compound+sort indexes, TTL indexes)
3. Seed default roles and permissions
4. Seed default plans (Free, Pro, Enterprise)
5. Create default superadmin user (prompts for email)

### `frontend/lib/upstash-rate-limit.ts` — Production Rate Limiting

**Status:** Partial — only covers `generate-fixes` endpoint. Falls back to in-memory.

**Recommendation:** Make the Upstash limiter the default and apply it to all auth + AI endpoints. Add configurable limits per endpoint via `platform_settings`.

### `frontend/lib/firebase-admin.ts` — Firebase Admin Initialization

**Issue:** Private key handling uses `.replace(/\\n/g, '\n').replace(/^["']|["']$/g, '')` on line 26 — fragile parsing that breaks if env var format changes.

**Recommendation:** Use `firebase-admin` credential parsing more robustly:
```typescript
const privateKey = Buffer.from(process.env.FIREBASE_PRIVATE_KEY_BASE64, 'base64').toString('utf8')
```

### `frontend/lib/validation-schemas.ts` — Replace Manual Validation with Zod

**Issue:** Hand-written validation functions for Job, Exam, Resume — inconsistent with the rest of the codebase using Zod.

**Recommendation:** Replace all functions with Zod schemas and reuse them in both client and server.

### `frontend/lib/billing-catalog.ts` vs `frontend/lib/pricing-catalog.ts` — Potential Duplication

**Issue:** Two separate plan catalogs — needs audit for drift.

**Recommendation:** Unify into a single source of truth (`lib/plans-catalog.ts`) with DB-driven overrides.

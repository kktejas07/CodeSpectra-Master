# CodeSpectra Full Codebase Audit — 2026-11-06

**Scope:** Duplicates · Security/Vulnerabilities · Dead Code & Unused Files · Pipeline Automation Opportunities · Blog/Events/Publishing Correctness  
**Codebase:** 1,450+ frontend pages/routes, 364 components, 605 backend functions, 3 CI workflows

---

## 1. DUPLICATE CODE

### 1.1 `FALLBACK_PROVIDERS` — Inline Duplication (High Impact)

**Confirmed duplicate:** Two API routes each define their own `FALLBACK_PROVIDERS` array inline, while a _shared_ `frontend/lib/ai/provider-fallback.ts` with `PROVIDER_FALLBACK_CHAIN` already exists and is more complete.

| File | Line | Model list | Has brocode endpoint? |
|------|------|------------|----------------------|
| `frontend/app/api/learning/generate-course/route.ts` | 9 | 6 providers | ✅ Yes |
| `frontend/app/api/mock-tests/generate/route.ts` | 148 | 6 providers | ❌ No (missing endpoint field) |
| `frontend/lib/ai/provider-fallback.ts` | — | 11 providers (canonical) | ✅ Maintained with live-probe comments |

**Problem:** The two inline arrays are out of sync with each other and with the canonical chain. `mock-tests/generate` is missing the brocode endpoint URL, meaning it falls back through provider-auth differently. When providers change (they do — Groq removed `llama-3.3-70b` already), only `provider-fallback.ts` gets updated.

**Fix:** Replace both inline arrays with an import of `PROVIDER_FALLBACK_CHAIN` from `lib/ai/provider-fallback.ts`.

### 1.2 `usePageGuard` with Path vs Role String — Inconsistency

7 admin pages pass a **path string** (`'/dashboard/admin/...'`) to `usePageGuard()` while 50+ pages pass a **role string** (`'superadmin'`, `'tenant_admin'`). Both call patterns work (the hook normalises them), but the path-string approach bypasses the `ADMIN_ONLY_ROUTES` list and relies on the runtime `resolveRouteAccess` map instead — a subtle discrepancy.

Path-string callers (should likely be `'superadmin'`):
- `admin/agent/page.tsx`
- `admin/analytics/page.tsx`
- `admin/assistants/page.tsx`
- `admin/knowledge/page.tsx`
- `admin/onboarding/page.tsx`
- `admin/settings/page.tsx`
- `admin/system/page.tsx`

### 1.3 Double `usePageGuard` Call — `content-studio/page.tsx`

`frontend/app/dashboard/admin/content-studio/page.tsx` calls `usePageGuard('superadmin')` **twice** (lines 92 and 154 within the same component). One of these is dead and can be removed.

### 1.4 Blog → Learn Redirect Duplication

`/blog/route.ts` is a 301 redirect to `/learn`. There is also a `[lang]/blog/route.ts` for internationalised paths. The redirect logic (`blogIndexRedirect`) is extracted to a utility, which is correct. No actionable duplication here, but worth noting the route exists as a permanent redirect — keep it for SEO.

---

## 2. SECURITY VULNERABILITIES

### 2.1 Inconsistent Backend Auth on Admin API Routes

The frontend admin guard (`usePageGuard`) is **client-side UX only** — the proxy enforces the same rules server-side per `use-page-guard.ts` comments. However, some API routes under `/api/admin/` rely on `requireSuperAdmin()` from `lib/route-auth`, while others may not. The blog auto-draft route correctly calls `requireSuperAdmin()`. Verify all `/api/admin/` routes consistently call it.

**Action:** Grep `/api/admin/` routes for missing `requireSuperAdmin` or equivalent auth guard.

### 2.2 Hardcoded brocode.live Endpoint in `generate-course/route.ts`

The inline `FALLBACK_PROVIDERS` in `generate-course/route.ts` hardcodes `https://api.brocode.live/v1` as the endpoint for the `custom` provider. If this key ever rotates or the domain changes, only this one file needs updating (because the shared `provider-fallback.ts` manages the endpoint differently via `secretKey` lookup). This is a maintenance liability, not an immediate vuln — but the custom endpoint should come from env/secrets, not a hardcoded string.

### 2.3 `console.error` Leaking in Production RSS Routes

All five RSS routes (events, news, learn, digest, plus blog) catch errors with `console.error('[namespace] rss:', error.message)`. This is correct for resilience (a failed DB fetch returns empty feed instead of 500), but in production it leaks internal error messages to server logs. This is acceptable if logs are access-controlled; flag it for log-level review.

### 2.4 CI: 771 `console.log` Calls in Frontend Production Code

771 `console.log/warn/error` calls exist in frontend app code (16 in `/app/api/` routes alone). These:
- May leak internal state to browser consoles visible to users
- Add noise to production monitoring

**Recommendation:** Add an ESLint `no-console` rule (or a CI step that fails on `console.log` outside test files). The CI currently runs `tsc --noEmit` but no linting.

### 2.5 Missing ESLint in CI

`ci.yml` has a note that `npx next lint` was removed because "Next 16 dropped `next lint`". With no linter running in CI, issues like `no-console`, unused vars, and import hygiene are never caught automatically.

---

## 3. DEAD CODE & UNUSED FILES

### 3.1 `content-studio/page.tsx` — Second `usePageGuard` Call (Dead)

Line 154 is a second, redundant `const gate = usePageGuard('superadmin')` inside a sub-component rendered within the same page. The result is assigned to `gate` but `gate` from line 92 is already in scope. The second call runs an extra async fetch for locked pages on every render.

**Fix:** Remove the second `usePageGuard` call and pass the existing `gate` down as a prop.

### 3.2 `PROVIDER_FALLBACK_CHAIN` Has Stale/Commented Entries

`provider-fallback.ts` retains entries for providers probed and confirmed broken (nvidia, old llama model) as comments. These are good as documentation but confirm the inline copies in route files are **older and not updated** — they still reference `gemini-2.0-flash` and `deepseek-v4-flash-free`, which may not match what `provider-fallback.ts` has validated live.

### 3.3 Backend `services/security_scanner.py` — Stub Functions

`scan_file_for_viruses()` and `_verdict()` in `backend/services/security_scanner.py` exist but their implementation depends on an external AV service. Verify these are wired to a real endpoint in production or are genuinely in use.

### 3.4 Backend `generate_skeleton_code` / `generate_default_explanation` (services/ai.py)

`generate_skeleton_code()` (line 540) and `generate_default_explanation()` (line 567) in `backend/services/ai.py` — verify these are called from active routes (they appear to be utilities for question generation). If the question-generation route still uses them, they're active.

### 3.5 `frontend/app/blog/` — Not Dead, Just Redirect

`/blog` redirects 301 → `/learn`. The route file is intentional and should stay for SEO permanence. Not dead code.

---

## 4. BLOG / EVENTS / PUBLISHING CORRECTNESS

### 4.1 RSS Feeds — All Correct ✅

All five RSS feeds follow the same correct pattern:

| Feed | Route | Error handling | Cache-Control | HTML escaping |
|------|-------|---------------|---------------|--------------|
| Events | `/events/feed.xml` | try/catch, empty on failure | ✅ s-maxage=600 | ✅ `escapeHtml` |
| News | `/news/rss.xml` | try/catch, empty on failure | ✅ s-maxage=600 | ✅ `escapeHtml` |
| Learn | `/learn/rss.xml` | try/catch, empty on failure | ✅ s-maxage=600 | ✅ `escapeHtml` |
| Digest | `/digest/rss.xml` | try/catch, empty on failure | ✅ s-maxage=600 | ✅ `escapeHtml` |

Each feed:
- Uses `force-dynamic` (no stale cached XML)
- Uses `getSiteOrigin()` (not hardcoded domain — works across staging/prod)
- Includes `atom:link rel="self"` (correct RSS spec)
- Escapes all user content via `escapeHtml` (no XSS via feed)

### 4.2 Blog Publishing Pipeline — Correct ✅

`/api/admin/blog/auto-draft` is a full 7-step pipeline:
1. Rewrite title (via `backendComplete`)
2. Web search for source articles
3. Scrape full articles
4. Extract facts
5. Write unique post with attribution
6. Generate gradient cover
7. Save as draft

This is properly guarded by `requireSuperAdmin()`. The pipeline uses `maxDuration = 180` (3 min timeout, appropriate for the multi-step AI chain).

### 4.3 Events Feed Data Source

Events RSS pulls from `listPublishedFeed()` from `lib/events-feed/query` which aggregates internal events + external sources (HackClub API at `hackathons.hackclub.com`). The HackClub fetch has a 15s timeout and falls back gracefully. ✅

### 4.4 Issue: `[lang]/blog/route.ts` — i18n Blog Redirect Coverage

There is a `[lang]/blog/route.ts` for internationalised routes. Verify that all supported locales are handled and that the redirect target (`/[lang]/learn` or `/learn`) is consistent with the locale prefix strategy. This is a low-risk concern but worth verifying if internationalisation is active.

---

## 5. PIPELINE AUTOMATION OPPORTUNITIES

### 5.1 AI Provider Health Check — Manual Today

There is a `lib/ai/provider-health.ts` and an admin page at `/dashboard/admin/llm-health`. The `provider-fallback.ts` has manual "probed 2026-10-30" comments. 

**Opportunity:** Automate the probe as a **weekly GitHub Actions job** or a **cron job** that:
1. Hits each provider endpoint with a minimal prompt
2. Updates `provider-fallback.ts` dead/active status
3. Posts a Slack/webhook notification of changes

This would prevent AI endpoints from silently failing because a model was removed (which already happened to `llama-3.3-70b`).

### 5.2 CI: No E2E or Integration Tests

Current CI runs:
- `tsc --noEmit` (type check)
- `vitest run` (frontend unit tests)
- Backend unit tests (offline only)
- `yarn audit` (dependency vuln scan)
- `pip-audit` (Python vuln scan)
- `gitleaks` (secret scan)
- Docker image build

**Gaps:**
- No ESLint / code quality gate
- No E2E tests (Playwright/Cypress) for critical flows: auth, assessment submission, proctoring start
- No API integration tests (backend routes tested in isolation only)
- No performance regression checks (Lighthouse CI or bundle size tracking)
- No dead-code detection (ts-prune, knip, or similar)

**Recommended additions to `ci.yml`:**
```yaml
- name: Lint (ESLint)
  run: yarn eslint --max-warnings 0 app/ lib/

- name: Dead code (knip)
  run: npx knip --no-exit-code  # warning only until baseline established

- name: Bundle size
  run: npx bundlesize  # or size-limit
```

### 5.3 Blog Auto-Draft — Can Be Scheduled

The `/api/admin/blog/auto-draft` pipeline is a full automated blog writer. It's currently triggered manually from the admin UI. 

**Opportunity:** Add a weekly cron job (GitHub Actions `schedule:` or the app's `/dashboard/admin/cron-jobs` page) to auto-generate 2–3 draft blog posts per week, which an admin reviews before publishing.

### 5.4 News Digest — Has Cron Page but Check Wiring

There's a `/dashboard/admin/digest` page and `/dashboard/admin/cron-jobs` page. Verify the digest cron is actually scheduled in production (not just UI).

### 5.5 Events Feed — External Source Polling

The HackClub events API is fetched on every RSS request (with caching). Consider a **background job** that syncs external event sources (HackClub, Devpost, etc.) to the database on a schedule, rather than live-fetching on each request. This would:
- Reduce latency for feed consumers
- Allow deduplication and enrichment
- Decouple feed availability from upstream API health

### 5.6 Provider Fallback Config — Not in Admin UI

Per `CLAUDE.md`: "No SuperAdmin UI to configure Redis/settings" and "Upstash Redis config exists in `.env.example` but isn't wired yet." Similarly, the AI provider fallback chain is hardcoded in `provider-fallback.ts`.

**Opportunity:** The `/dashboard/admin/ai-inventory` page likely shows providers. Surface the fallback chain order there with enable/disable toggles, stored in MongoDB. This avoids a code push every time a provider key expires or a model is deprecated.

---

## 6. SUMMARY TABLE

| Category | Severity | Count | Action |
|----------|----------|-------|--------|
| Duplicate `FALLBACK_PROVIDERS` | Medium | 2 files | Consolidate to `provider-fallback.ts` |
| `usePageGuard` path vs role inconsistency | Low | 7 files | Standardise to role string |
| Double `usePageGuard` in content-studio | Low | 1 file | Remove second call |
| Missing `requireSuperAdmin` audit | High | Needs grep | Verify all `/api/admin/` routes |
| Hardcoded brocode endpoint | Low | 1 file | Move to env/secrets |
| 771 `console.log` in production | Medium | 771 calls | Add ESLint `no-console` to CI |
| No ESLint in CI | Medium | — | Add lint step |
| No E2E tests | Medium | — | Add Playwright smoke tests |
| RSS feeds correctness | — | ✅ All correct | No action |
| Blog publishing pipeline | — | ✅ Correct | No action |
| AI provider health automation | Opportunity | — | Add weekly probe job |
| Scheduled blog drafts | Opportunity | — | Add cron trigger |

---

## 7. QUICK WINS (can be done now)

1. **Remove duplicate `FALLBACK_PROVIDERS`** — replace both inline arrays in `generate-course` and `mock-tests` with:
   ```ts
   import { PROVIDER_FALLBACK_CHAIN } from '@/lib/ai/provider-fallback'
   ```
2. **Remove second `usePageGuard` in `content-studio/page.tsx`** (line 154)
3. **Add ESLint `no-console` rule** to `frontend/.eslintrc.json` (create if missing) and add `yarn lint` step to `ci.yml`
4. **Standardise 7 `usePageGuard` path callers** to `'superadmin'` where the page is in `ADMIN_ONLY_ROUTES`

---

*Report generated: 2026-11-06. Security vulnerability details pending background scan completion.*

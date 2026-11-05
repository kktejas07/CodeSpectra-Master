# CodeSpectra Full Codebase Audit — 2026-11-06

**Scope:** Security vulnerabilities · Duplicate code · Dead code · Publishing pipelines · CI/CD gaps · Auto-generation opportunities

---

## 🔴 CRITICAL

### 1. Email Template Preview — Unsanitized `dangerouslySetInnerHTML`
**File:** `frontend/app/dashboard/admin/settings/page.tsx:393`

```tsx
dangerouslySetInnerHTML={{ __html: preview.html }}
```
The email template preview endpoint returns arbitrary HTML from an AI call and renders it directly without DOMPurify or any sanitization wrapper. Even though this is a superadmin-only page, XSS here could compromise the admin session and exfiltrate cookies/CSRF tokens.

**Fix:** Wrap with `DOMPurify.sanitize()` before rendering, or render in a sandboxed `<iframe srcdoc>`.

---

### 2. Community Moderation Route — Auth Uses Custom `userGate`, Not `requireSuperAdmin`
**File:** `frontend/app/api/community/moderation/route.ts`

The `/api/community/moderation` endpoint (approve/hide/remove/ban users) uses `userGate(req)` which grants access to any authenticated user. The `userGate` helper doesn't enforce moderator role unless the caller passes role constraints. If `moderationAction()` doesn't re-check moderator role internally, any logged-in user can call moderation actions.

**Fix:** Confirm `moderationAction()` in `lib/community/service.ts` enforces the moderator role gate on the `g.user` object, or add `userGate(req, { role: 'moderator' })`.

---

## 🟠 HIGH

### 3. `dangerouslySetInnerHTML` in Problems Page
**File:** `frontend/app/dashboard/problems/[slug]/page.tsx:1071`

Manual escaping via `.replace(/</g, '&lt;')` before inserting into HTML is insufficient — it misses `>`, `"`, `'`, and unicode tricks. This is used for user-submitted problem content.

**Fix:** Use the existing `sanitizeArticleHtml()` utility already imported in the project.

---

### 4. FALLBACK_PROVIDERS Duplicated in 4 Files
The OpenAI-compatible provider fallback chain is copy-pasted in:
- `frontend/app/api/mock-tests/generate/route.ts`
- `frontend/app/api/learning/generate-course/route.ts`
- `frontend/lib/services/problems.ts`
- `frontend/lib/question-bank-generate.ts`

Each copy can drift from the others. When brocode.live models are updated, all 4 must be updated manually — a maintenance hazard already identified in prior sessions.

**Fix:** Create `frontend/lib/ai/provider-fallback.ts` (the constant `PROVIDER_FALLBACK_CHAIN` is already referenced in comments in `lib/courses/lesson-video.ts:546`). Export the array from there and import it everywhere.

---

### 5. Scheduler Hardcodes a Single Python Topic
**File:** `backend/scheduler.py`

```python
req = GenerateCourseReq(
    technology="Python",
    level="Intermediate",
    goal="Advanced Data Structures in Python",
    duration_hours=10,
)
```
The 12-hour scheduler only generates one fixed course. There's no queue, rotation, or database-driven topic list. This means the auto-generation system isn't actually useful for content diversity — it'll generate the same Python course repeatedly.

**Fix:** Pull a list of pending/requested topics from the DB, pick the oldest un-generated one, or accept a configurable topic list.

---

### 6. Mentor API Routes Have No Auth Wrapper
**Files:** All `frontend/app/api/mentors/me/*` and `mentors/sessions/[id]/*` routes

These don't import `getAPIUser`, `requireAuth`, or any session gate. If `userGate` from `lib/community/http` is not used here either, these routes may be wide open. Specifically:
- `mentors/me/route.ts` — profile data
- `mentors/sessions/[id]/token/route.ts` — video call token (high sensitivity)
- `mentors/sessions/[id]/dispute/route.ts` — submit a dispute

**Fix:** Audit each file to confirm they use a custom auth helper not caught by the grep, or add auth gating.

---

## 🟡 MEDIUM

### 7. Duplicate AI Assistant UIs (EDITH vs Agent Copilot)
Two separate chat UIs exist for AI assistance:
- `components/ai/go-edith.tsx` — the floating EDITH panel (SSE, brocode.live, RAG+Google)  
- `components/agent/agent-copilot.tsx` — the Agent Copilot in the full-page admin agent view

These call different backend endpoints (`/api/ai/edith` vs the agent API) but serve overlapping purposes. Users may be confused which one to use.

**Recommendation:** Keep EDITH for end-user lightweight queries. Document and visually distinguish Agent Copilot as the "agentic" / multi-step tool for admins.

### 8. `brocode.live` Endpoint Hardcoded in Multiple Files
`https://api.brocode.live/v1` appears hardcoded in:
- `frontend/lib/services/problems.ts`
- `frontend/app/api/mock-tests/generate/route.ts`
- `frontend/app/api/learning/generate-course/route.ts`
- (possibly more)

The canonical definition in `frontend/lib/llm-config.ts` (line 173) exists but is not imported by these files.

**Fix:** Import `LLM_PROVIDERS.find(p => p.id === 'custom').endpoint` from `llm-config.ts` or the new `provider-fallback.ts`.

### 9. Backend Scheduler — Sleeps Before First Run
```python
await asyncio.sleep(GENERATION_INTERVAL_SEC)  # 12 hours
```
The scheduler waits 12 hours before the first run. After a server restart nothing is generated for 12 hours.

**Fix:** Run once immediately on startup, then sleep between subsequent runs.

### 10. CI Pipeline Missing Backend Tests
`ci.yml` runs:
- TypeScript type-check
- Frontend unit tests (vitest)
- Python type-check (mypy)
- Secret scanning (gitleaks)

It does NOT run backend pytest. Backend test files exist in `backend/tests/` but are never run in CI.

**Fix:** Add a `backend-test` job to `ci.yml` that runs `pytest backend/tests/`.

### 11. `console.log` Statements in Production API Routes
Found in:
- `app/api/admin/blog/auto-draft/route.ts` (6 instances)
- `app/api/admin/blog/ai-write/route.ts` (5 instances)
- `app/api/admin/cloudflare-analytics/route.ts` (4 instances)
- `app/api/admin/courses/generate-curriculum/route.ts` (1 instance)

These leak internal state to browser console / server logs. Should use the project's logger or be removed.

---

## 🟢 LOW / INFORMATIONAL

### 12. RSS/Feed Publishing — Looks Correct
All 5 RSS endpoints (`/events/feed.xml`, `/news/rss.xml`, `/learn/rss.xml`, `/digest/rss.xml`, `sitemap.xml`) correctly:
- Use `escapeHtml()` to sanitize XML content
- Filter to `published` status only
- Set proper cache-control headers
- Return correct `Content-Type: application/rss+xml`

**No issues found.**

### 13. Blog Publishing Logic — Correct
`/api/blog/route.ts` properly gates `status=all` and `status=draft` behind `requireSuperAdmin()`. Public requests always see `status = 'published'` only.

**No issues found.**

### 14. GitHub Actions — Well Secured
- All action pins are full SHA hashes (not floating tags)
- `permissions: {}` at workflow level, scoped per job
- `concurrency: cancel-in-progress: true` prevents queue buildup
- Gitleaks secret scanning is in CI

**No issues found.**

### 15. Mobile CI Gaps
`android.yml` and `ios.yml` are both manual (`workflow_dispatch`) only. No automated builds on PR. This is noted as a tradeoff (slow builds), but means mobile regressions are only caught when someone manually triggers a build.

---

## 🏗️ PIPELINE AUTOMATION OPPORTUNITIES

### A. Auto-generate Blog Draft from News Signals
The `/api/admin/blog/auto-draft` route exists but requires manual trigger. The `cron/signals-ingest` route runs on a schedule. 

**Opportunity:** After `signals-ingest` processes new articles, auto-trigger `auto-draft` for the top 2–3 signals daily, writing drafts (not published) for editor review.

### B. Automated Question Bank Backfill
`scripts/backfill-problems.ts` exists but is a one-shot manual script.

**Opportunity:** Add a GitHub Actions scheduled workflow (`on: schedule: - cron: '0 2 * * 0'`) that runs this weekly for new technology topics.

### C. Backend Auto-generate Course Topics from DB
Instead of the hardcoded scheduler, pull topics from a `pending_topics` collection (populated when users request courses that don't exist yet).

### D. Auto-PR for Dependency Updates
No Dependabot or Renovate is configured. With ~200+ npm packages and Python deps, this is a blind spot.

**Opportunity:** Add `.github/dependabot.yml` targeting `frontend/` (npm) and root (pip) with weekly grouping.

### E. Stale Content Detection
No scheduled job detects blog posts or course content that hasn't been updated in >6 months. 

**Opportunity:** Weekly cron that queries MongoDB for posts with `updated_at < 6 months ago` and posts a digest to an admin Slack/email webhook.

---

## 📋 SUMMARY TABLE

| # | Severity | Category | File(s) | Fix Effort |
|---|----------|----------|---------|------------|
| 1 | 🔴 Critical | XSS | settings/page.tsx:393 | Small |
| 2 | 🔴 Critical | Auth | community/moderation/route.ts | Small |
| 3 | 🟠 High | XSS | problems/[slug]/page.tsx:1071 | Small |
| 4 | 🟠 High | Duplication | 4 route files | Medium |
| 5 | 🟠 High | Logic Bug | backend/scheduler.py | Small |
| 6 | 🟠 High | Auth | mentors/*/route.ts (8 files) | Medium |
| 7 | 🟡 Medium | UX/Duplication | go-edith + agent-copilot | Docs only |
| 8 | 🟡 Medium | Maintainability | 3+ route files | Small |
| 9 | 🟡 Medium | Bug | backend/scheduler.py | Trivial |
| 10 | 🟡 Medium | CI Gap | ci.yml | Small |
| 11 | 🟡 Medium | Logging | 4 API route files | Small |
| 12 | 🟢 Info | Publishing | RSS feeds | None |
| 13 | 🟢 Info | Publishing | Blog API | None |
| 14 | 🟢 Info | CI/CD | .github/workflows | None |

---

*Generated by full-codebase audit, 2026-11-06. Background agents (security-scan, dead-code-scan, publishing-scan, pipeline-scan) are still running and will add further findings.*

# Supabase → MongoDB + Better Auth Migration

Multi-phase migration from Supabase (Postgres + Auth + RLS) to **MongoDB Atlas** + **Better Auth**.

## Phases completed
1. **Infrastructure** — MongoDB client (`lib/mongodb.ts`), Better Auth server (`lib/auth.ts`) + React client (`lib/auth-client.ts`), catch-all route (`app/api/auth/[...all]/route.ts`)
2. **Auth pages + middleware** — `/auth/{login,signup,forgot-password,reset-password,github/callback}` rewritten; `proxy.ts` switched to Better Auth cookie check
3. **Profiles + RBAC** — Better Auth user collection holds `role`, `fullName`, `tenantId`, `organizationId`, `isActive`. `lib/rbac-server.ts` rewritten
4. **Auth cleanup + Scanner core** — `lib/route-auth.ts` rewritten (1 file → 15 routes auto-migrated); new `lib/db/scans.ts` repo; `analyze-code`, `analysis-history`, `scanner/{issues,metrics,activities}` migrated
5. **Admin + Team + Notifications** — new `lib/db/admin.ts`; `/api/admin/users`, `/api/team/*`, `/api/roles`, `/api/notifications/*` migrated
6. **Codeathons / Exams / Jobs / Resumes** — new `lib/db/content.ts`; all CRUD now MongoDB-backed (was partially mocked, partially Supabase)
7. **Quality gates / Comments / Integrations / Billing / GitHub / Misc** — new `lib/db/misc.ts`; 26 routes migrated; `lib/github-api-auth.ts` reads from Better Auth's `account` collection
8. **Cleanup** — `@supabase/*` packages removed; legacy lib files converted to thin shims; `supabase/` migrations folder backed up

## Environment variables required

```bash
MONGODB_URI=mongodb+srv://USER:PASS@host/?retryWrites=true&w=majority
MONGODB_DB_NAME=codespectra
BETTER_AUTH_SECRET=<openssl rand -base64 32>
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Optional
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
OPENAI_API_KEY=
```

## First-time setup

```bash
npm install --legacy-peer-deps
# (paste MongoDB credentials into .env.local)
npm run dev
# In a second terminal:
curl -X POST http://localhost:3000/api/setup-demo
```

Demo accounts created by `/api/setup-demo`:
- `superadmin@codespectra.com` / `SuperAdmin123!`
- `admin@codespectra.com` / `TenantAdmin123!`
- `demo@codespectra.com` / `DemoPass123!`

## MongoDB collections used

| Collection | Purpose |
|---|---|
| `user`, `account`, `session`, `verification` | Better Auth (auto-managed) |
| `code_scans`, `code_metrics`, `code_issues`, `suggested_fixes` | Scanner |
| `code_scan_activities`, `file_metrics`, `scan_comments`, `code_review_comments` | Scanner extras |
| `quality_gates`, `quality_ratings` | Gating rules |
| `codeathons`, `codeathon_registrations` | Codeathons |
| `exams`, `exam_submissions` | Exams |
| `job_postings`, `job_applications`, `resumes` | Jobs / resumes |
| `organization_invitations`, `user_roles`, `permissions` | Team / RBAC |
| `notifications`, `notification_preferences` | In-app notifications |
| `integrations`, `github_repo_metadata`, `github_webhook_scan_queue` | GitHub integration |
| `support_tickets` | Support |
| `pricing_tiers`, `pricing_features` | Billing config |
| `web_vitals_events` | Core Web Vitals telemetry |

Collections are created lazily on first write — no migrations to run.

## Deferred / still TODO

| Item | Status |
|---|---|
| Stripe checkout / billing routes | `lib/billing-server.ts` + `lib/stripe-server.ts` are stubs — re-implement against `user_subscriptions` / `invoices` Mongo collections |
| GitHub push webhook queue worker | `lib/github-queue-worker.ts` stubbed — re-implement with `findOneAndUpdate({ status: 'pending' }, …)` |
| Frontend `/dashboard/admin/{analytics,system,speed-insights,cdn,settings}` | Import the dead `supabase` shim; need `fetch('/api/...')` rewrites |
| Face MFA | Removed (was Supabase-only). Components in `_backup_supabase_auth/` for reference |
| Original Supabase code | Backed up to `_backup_supabase_auth/` (keep for reference, safe to delete later) |

## Key files added
- `lib/mongodb.ts` — connection pool
- `lib/auth.ts` + `lib/auth-client.ts` — Better Auth
- `lib/db/{scans,admin,content,misc}.ts` — MongoDB repositories
- `app/api/auth/[...all]/route.ts` — Better Auth catch-all

## Key files removed (backed up)
- `supabase/` (24 SQL migrations + 1 edge function) → `_backup_supabase_auth/migrations/supabase-original/`
- `app/auth/{login,signup,forgot-password,reset-password,github/callback}/page.tsx` (originals) → `_backup_supabase_auth/*.page.tsx`
- `app/api/auth/{login,signup,profile,setup-demo,google,github,face-*,enrollment-reminder}/` → `_backup_supabase_auth/api-routes/`
- `proxy.ts` (Supabase version) → `_backup_supabase_auth/proxy.ts`
- `@supabase/ssr`, `@supabase/supabase-js` packages

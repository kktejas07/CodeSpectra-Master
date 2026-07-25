# CodeSpectra — Project Memory

> Canonical source of truth for any AI working on this project.
> Read this first. Update it after every session.

## What is this?

CodeSpectra is a full-stack coding interview/assessment platform. Users solve problems, get evaluated by AI proctors, and companies manage hiring workflows.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind, shadcn/ui |
| Backend | Next.js API routes (Node), MongoDB (Mongoose) |
| Auth | Clerk (primary), custom JWT/credentials fallback |
| AI Proctors | Gemini via OpenAI-compatible API |
| Email | Resend (primary), SendGrid, Postal, SMTP |
| Payments | Razorpay, PhonePe, Stripe |
| CDN/Cache | Cloudflare (analytics + cache purge) |
| Deployment | Docker Swarm + Dokploy on `root@65.21.196.49` |

## Key Files

| Path | Purpose |
|---|---|
| `frontend/lib/server-secrets-cache.ts` | Central secrets read/write to MongoDB `platform_settings` |
| `frontend/lib/page-permissions.ts` | Route access control (ADMIN_ONLY, TENANT_ADMIN, ALL_USER) |
| `frontend/lib/rbac.ts` | Auto-generated from page-permissions.ts — DO NOT EDIT |
| `frontend/lib/email-templates.ts` | All transactional email templates |
| `frontend/app/api/admin/cloudflare-analytics/route.ts` | Cloudflare GraphQL analytics (3-day window) |
| `frontend/app/api/admin/server-secrets/reveal/route.ts` | Reveals unmasked secret values (30s auto-hide) |
| `frontend/app/api/admin/llm-config/reveal/route.ts` | Reveals LLM config API key |
| `docs/` | Public + customer docs (auto-served via `/docs/*`) |
| `.ai/` | **Project brain** — context for any AI working on this project |

**History**: `.kilo/` (opencode agent config, worktrees of other projects) was deleted — replaced by `.ai/` project brain.

## Documentation Agent

The `.kilo/command/doc-update.md` had useful scanning instructions. Summary: scan `frontend/app/api/` for new routes, `frontend/lib/db/` for schemas, `frontend/app/` for pages, `frontend/components/` for new components. Check `docs/api/`, `docs/database/`, `docs/roadmap/` respectively for drift.

## Database

- **DB**: `codespectra` (MongoDB)
- **Key collections**: `users`, `platform_settings`, `challenges`, `problems`, `submissions`, `workflows`
- `platform_settings` stores: server secrets (key: `secrets`), LLM config (key: `llm`), platform branding/ops/product
- Secrets are NEVER returned unmasked — use `/reveal` endpoint to fetch

## Secrets Architecture

- All secrets (API keys, tokens) stored in `platform_settings` collection with `key: "secrets"`
- GET `/api/admin/server-secrets` returns masked values + `has_<key>` booleans
- PATCH `/api/admin/server-secrets` accepts new values, ignores masked values (bullet `•` chars)
- GET `/api/admin/server-secrets/reveal?key=<key>` returns full value (requires superadmin)
- LLM API key stored separately in `platform_settings` with `key: "llm"`
- GET `/api/admin/llm-config/reveal` returns full LLM API key

## RBAC / Permissions

- Route registration: `frontend/lib/page-permissions.ts`
  - `ADMIN_ONLY_ROUTES` — superadmin only
  - `TENANT_ADMIN_ROUTES` — org admin & above
  - `ALL_USER_ROUTES` — all authenticated users
- `SUPERADMIN_PAGES`, `TENANT_ADMIN_PAGES`, `USER_PAGES` in `rbac.ts` are **auto-generated** — do not edit manually
- Add `usePageGuard('superadmin'|'tenant_admin'|'user')` to new pages

## Deployment

- **Branch**: `main` triggers Dokploy auto-deploy; `dev-fixes` is the WIP branch
- **PR workflow**: push to `dev-fixes` → open PR to `main` → merge → Dokploy builds
- **Manual hotfix**: `docker exec <container> sh -c "cd /app && yarn build"` then `docker commit` + `docker service update`
- **Frontend container**: `codespectra-frontend-dmeptb`

## Current State (2026-07-25)

- PR #80 open: merges `dev-fixes` into `main` with all recent fixes
- Cloudflare analytics using GraphQL (REST API is sunset by Cloudflare)
- Secrets reveal now fetches real values on eye-click + 30s auto-hide
- Mobile proctor skips fullscreen + hides badge
- Email templates: all 13 templates now visible in settings

## Environment Variables (production server)

```env
NEXT_PUBLIC_APP_URL=https://codespectra.ai
MONGODB_URI=mongodb://localhost:27017/codespectra
CLERK_SECRET_KEY=sk_...
CLERK_PUBLISHABLE_KEY=pk_...
```

## Gotchas

- `.zcode` (AI session plans) is in `.gitignore` — not project code
- `e2e-tests/` excluded from TypeScript build in `tsconfig.json`
- Always guard `.toLowerCase()`, `.charAt()` on potentially null values with `|| ''`
- When adding new API endpoints, always update corresponding docs in `docs/`
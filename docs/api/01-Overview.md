> **Auto-Generated Documentation**
> **Last Updated**: 2026-07-08
> **Source**: CodeSpectra Codebase Audit
> **Auto-Update Rule**: This document must be regenerated when API endpoints or database schemas change.

# API Architecture Overview

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌───────────┐
│   Browser   │────▶│  FastAPI     │────▶│  Next.js   │────▶ MongoDB
│  / Mobile   │     │  Proxy       │     │  App Router│
└─────────────┘     │  (Port 8001) │     │  (Port 3000)│
                    └──────────────┘     └─────┬─────┘
                          │                    │
                          │           ┌────────▼──────┐
                          │           │  FastAPI       │
                          └──────────▶│  Internal AI   │
                                      │  (Port 8001)  │
                                      │  /internal/ai/*│
                                      └───────────────┘
```

## Request Flow

1. **External client** → sends request to `/api/*` on port 8001 (FastAPI proxy layer)
2. **FastAPI proxy** (`backend/server.py`) — forwards to Next.js dev server on port 3000
   - Handles path-rewriting (some Kubernetes ingresses strip `/api` prefix)
   - Strips hop-by-hop headers
   - Returns upstream response as-is
3. **Next.js App Router** (`frontend/app/api/*`) — handles the actual business logic
   - Authenticates via Better Auth (Firebase Admin SDK or JWT session)
   - Reads/writes MongoDB via native driver
   - For AI features, calls FastAPI internal endpoints at `http://localhost:8001/internal/ai/*`
4. **FastAPI internal AI router** (`backend/ai_router.py`) — not exposed externally
   - Only reachable from within the cluster
   - Used exclusively by Next.js server-side API routes
   - Routes to external LLM providers via `ai_client.py`

## Route Inventory

### 165 route.ts files across 55 route groups

```
frontend/app/api/              (55 route groups, 165 route.ts files)
├── achievements/              (1 route)
├── admin/                     (14 routes)
│   ├── audit-logs/
│   ├── metrics/
│   ├── permissions/seed/
│   ├── permissions/roles/
│   ├── plans/
│   ├── platform-settings/
│   ├── pricing/features/
│   ├── pricing/tiers/[id]/features/[featureId]/
│   ├── pricing/tiers/[id]/features/
│   ├── pricing/tiers/
│   ├── security/
│   ├── server-secrets/
│   ├── system/cache/
│   ├── system/stats/
│   ├── teams/activity/
│   ├── teams/members/
│   ├── teams/
│   ├── test-emails/
│   ├── users/[userId]/
│   └── users/
├── ai/                        (10 routes)
│   ├── agent/
│   ├── chat/
│   ├── code-analysis/
│   ├── code-review/
│   ├── codebase-chat/
│   ├── fixes/[id]/apply/
│   ├── fixes/[id]/unapply/
│   ├── fixes/apply-batch/
│   ├── generate-problem/
│   ├── grade/
│   └── hints/
├── ai-inventory/              (2 routes)
├── analysis-history/          (1 route)
├── analytics/                 (3 routes)
├── analyze-code/              (1 route)
├── apply-fix/                 (1 route)
├── arena/                     (2 routes)
├── auth/                      (5 routes)
├── billing/                   (10 routes)
├── certifications/            (6 routes)
├── challenges/                (2 routes)
├── check-quality-gate/        (1 route)
├── code-review-comments/      (1 route)
├── codeathons/                (3 routes)
├── collaboration/             (1 route)
├── courses/                   (1 route)
├── cron/                      (1 route)
├── daily-challenge/           (1 route)
├── events/                    (1 route)
├── exams/                     (3 routes)
├── features/                  (2 routes)
├── firebase-config/           (1 route)
├── generate-fixes/            (1 route)
├── github/                    (9 routes)
├── hackathons/                (4 routes)
├── health/                    (1 route)
├── id-card/                   (1 route)
├── identity/                  (1 route)
├── integrations/              (7 routes)
├── interviews/                (1 route)
├── jobs/                      (4 routes)
├── leaderboard/               (1 route)
├── mcp/                       (1 route)
├── notifications/             (5 routes)
├── piston-status/             (1 route)
├── pricing/                   (1 route)
├── problems/                  (3 routes — GET problem, GET stats, +1 more)
│   └── [slug]/stats/          (GET acceptance rate + submission count)
├── proctor/                   (1 route)
├── qr/                        (1 route)
├── quality-gates/             (3 routes)
├── reports/                   (1 route)
├── resumes/                   (2 routes)
├── roles/                     (2 routes)
├── runtimes/                  (1 route)
├── scanner/                   (7 routes)
├── setup-demo/                (1 route)
├── submissions/              (2 routes — GET list, POST create)
├── qr/                        (1 route)
├── quality-gates/             (3 routes)
├── reports/                   (1 route)
├── resumes/                   (2 routes)
├── roles/                     (2 routes)
├── runtimes/                  (1 route)
├── scanner/                   (7 routes)
├── setup-demo/                (1 route)
├── submissions/               (1 route)
├── support/                   (1 route)
├── team/                      (3 routes)
├── tracks/                    (1 route)
├── user/                      (7 routes)
├── users/                     (1 route)
└── workflows/                 (3 routes)
```

## Authentication Guards

Pattern used across all API routes (from `lib/route-auth.ts`):

| Guard | Required Role | API Status on Fail |
|-------|---------------|-------------------|
| `requireAuth()` | Any authenticated user | `401 Unauthorized` |
| `requireAdmin()` | `superadmin` or `tenant_admin` | `403 Forbidden` |
| `requireSuperAdmin()` | `superadmin` only | `403 Forbidden` |
| `requirePermission(resource, action)` | Custom RBAC via `roles` collection | `403 Forbidden` |
| `requirePlanFeature(feature)` | Plan-based feature gating | `402 Payment Required` |

## Backend AI Router (FastAPI Internal)

10 endpoints mounted at `/internal/ai/*` on port 8001:

| Endpoint | Method | Purpose | Model |
|----------|--------|---------|-------|
| `/internal/ai/chat` | POST | SSE streaming chat | Claude Sonnet 4.5 |
| `/internal/ai/complete` | POST | Non-streaming LLM completion | Gemini 3 Flash |
| `/internal/ai/hints` | POST | Progressive coding hints | Gemini 3 Flash |
| `/internal/ai/code-review` | POST | Deep AI code review | Claude Sonnet 4.5 |
| `/internal/ai/code-analysis` | POST | Auto code analysis on submission | Gemini 3 Flash |
| `/internal/ai/grade` | POST | Smart grading by rubric | Claude Sonnet 4.5 |
| `/internal/ai/generate-problem` | POST | Admin question generator | Claude Sonnet 4.5 |
| `/internal/ai/skill-insights` | POST | Skill analytics | Gemini 3 Flash |
| `/internal/ai/identity-verify` | POST | Selfie vs ID comparison | Gemini 3 Flash (vision) |
| `/internal/ai/agent` | POST | Multi-step agentic fix loop | Claude Sonnet 4.5 |

## Inconsistency Warning: Dual Auth Libraries

The codebase has **two competing auth libraries** that are re-exports:

| Import Path | Actual Source | Purpose |
|-------------|---------------|---------|
| `@/lib/route-auth` | `lib/route-auth.ts` | Full implementation with `getAPIUser()`, `requireAuth()`, `requireAdmin()`, `requireSuperAdmin()` |
| `@/lib/api-auth` | Re-exports from `route-auth.ts` | Thin re-export "to avoid Turbopack treating mixed sync/async exports as Server Actions" |

Most routes use `@/lib/route-auth` directly. Some use `@/lib/api-auth`. They are functionally identical but inconsistent across the codebase.

Additionally:
- `lib/auth-service.ts` exists as a stub (all functions throw errors) — it's a legacy Supabase auth service that was removed
- `lib/session.ts` implements a JWT-based session cookie (`codespectra_session`) used as fallback when Firebase Admin SDK is unavailable
- `lib/firebase-admin.ts` provides Firebase Admin SDK authentication as the primary auth mechanism

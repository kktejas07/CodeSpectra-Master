> **Auto-Generated Documentation**
> **Last Updated**: 2026-07-08
> **Auto-Update Rule**: Regenerate when codebase architecture or schema changes.

# CodeSpectra — Performance Summary

## Bundle Size Issues

| Issue | Location | Impact | SeverITY |
|-------|----------|--------|----------|
| **Large dashboard layout** | `frontend/app/dashboard/layout.tsx:685` | Single component imports sidebar, header, mobile menu, theme switcher, search, notifications panel — increases JS bundle for every dashboard page | HIGH |
| **Large scanner page** | `frontend/app/dashboard/scanner/page.tsx:689` | Imports 20+ scanner sub-components conditionally, but all are bundled regardless of active scanner mode | HIGH |
| **Monaco Editor bundle** | `frontend/package.json` — `@monaco-editor/react` | Monaco is ~5MB minified; loaded on scanner and problems pages | HIGH |
| **Three.js / R3F bundle** | `frontend/package.json` — `@react-three/fiber`, `@react-three/drei`, `three` | 3D globe components (`code-globe-3d.tsx`, `globe-3d.tsx`) load ~1.5MB of WebGL libraries | MEDIUM |
| **Recharts bundle** | `frontend/package.json` — `recharts` | Charting library ~500KB; used across analytics and admin pages | MEDIUM |
| **Multiple icon libraries** | `lucide-react` + custom icon system | No tree-shaking verification; potential duplicate icon rendering | LOW |
| **Radix UI primitives** | 20+ `@radix-ui/*` packages installed | Each package is modular, but 20+ context providers may impact initial render | LOW |

### Bundle Size Recommendations

| Recommendation | Effort | Impact |
|----------------|--------|--------|
| Dynamic import (`next/dynamic`) for Monaco Editor | 1 hour | ~5MB deferred from initial load |
| Dynamic import for Three.js globes | 1 hour | ~1.5MB deferred |
| Lazy-load scanner sub-components by mode | 1 day | ~200KB deferred per mode |
| Split dashboard layout into smaller compositions | 2 days | Reduced initial JS per route |
| Analyze bundle with `@next/bundle-analyzer` | 30 min | Identifies precise bottlenecks |

---

## Database Performance Issues

### Missing Indexes

| Collection | Common Query Pattern | Index Needed | Impact |
|-----------|---------------------|--------------|--------|
| `code_scans` | `find({ user_id })` → sort by `created_at` | `{ user_id: 1, created_at: -1 }` | Full collection scan on every scanner page load |
| `code_metrics` | `find({ scan_id })` | `{ scan_id: 1 }` | Full scan for each scan detail view |
| `code_issues` | `find({ scan_id })` → filter by severity/status | `{ scan_id: 1, severity: 1, status: 1 }` | Full scan on issue listing |
| `submissions` | `find({ user_id })` → sort by `created_at` | `{ user_id: 1, created_at: -1 }` | Full scan on problem history |
| `submissions` | `find({ problem_id })` | `{ problem_id: 1, created_at: -1 }` | Full scan on problem stats |
| `ai_chat_messages` | `find({ session_id })` | `{ session_id: 1, created_at: 1 }` | Full scan on chat load |
| `xp_events` | `find({ user_id })` → aggregate sum | `{ user_id: 1, reason: 1, problem_id: 1 }` | Full scan for XP calculation + idempotency check |
| `notifications` | `find({ user_id, is_read: false })` | `{ user_id: 1, is_read: 1, created_at: -1 }` | Full scan on notification badge |
| `billing_orders` | `find({ user_id })` | `{ user_id: 1, created_at: -1 }` | Full scan on billing history |
| `github_webhook_scan_queue` | `findOneAndUpdate({ status: 'pending' })` | `{ status: 1, locked_at: 1 }` | Full scan on queue worker poll |

### N+1 Query Risks

| Location | Pattern | Impact |
|----------|---------|--------|
| `frontend/lib/db/scans.ts:186` — `listScansWithMetrics()` | Uses `$lookup` aggregation — correctly avoids N+1 | ✅ Good |
| `frontend/lib/db/scans.ts:301` — `aggregateMetricsForUser()` | Uses `$lookup` with `$group` — correctly avoids N+1 | ✅ Good |
| `frontend/components/scanner/scan-history.tsx` | Likely fetches scans then per-scan metrics | Potential N+1 (verify at runtime) |
| `frontend/app/dashboard/notifications/page.tsx` | May fetch notifications then per-notification preferences | Potential N+1 (verify at runtime) |
| Admin user list + per-user role/plan queries | `listAllUsers()` then individual lookups | Potential N+1 (verify at runtime) |

---

## Caching Gaps

| Layer | Current State | Recommendation |
|-------|---------------|----------------|
| **API responses** | No HTTP caching headers on any API route | Add `stale-while-revalidate` or `Cache-Control` headers to read-heavy endpoints (problems, leaderboard, certifications) |
| **Database queries** | No query result caching | Add in-memory cache layer for hot queries (leaderboard, top problems) with 30s TTL |
| **Page rendering** | No ISR (Incremental Static Regeneration) used | Implement ISR for problem catalog, documentation, public pages |
| **CDN** | CDN management route exists (`/dashboard/admin/cdn`) but no CDN configured | Configure Cloudflare or Vercel Edge Cache for static assets and problem content |
| **AI responses** | No semantic caching | Cache AI responses for identical prompts (hints, code analysis) with content-addressable hash |
| **Piston runtimes** | 5-minute in-memory cache in `piston.ts:112` | ✅ Good — extend to Redis for multi-instance deployments |
| **Server secrets** | Process-level cache with no TTL (`server-secrets-cache.ts`) | Add TTL-based automatic cache invalidation |
| **Permission cache** | 60-second process-level Map | Reduce to 10s or use change streams |

---

## God Component Analysis

| Component | Lines | Composition Strategy | Recommended Refactor |
|-----------|-------|---------------------|---------------------|
| `dashboard/layout.tsx` | 685 | Single file with sidebar, header, mobile nav, theme, notifications, search | Split into: `DashboardShell`, `Sidebar`, `Header`, `MobileNav`, `NotificationBell`, `SearchCommand` |
| `scanner/page.tsx` | 689 | Single file with 19 scanner modes, file browser, metrics grid, chat sidebar | Split into: `ScannerShell`, `ScannerModeRouter`, `CodeEditor`, `MetricsGrid`, `ChatSidebar`, `ResultsPanel` |
| `auth-context.tsx` | 231 | Firebase + Better Auth dual path, OAuth providers, session management | Split into: `AuthProvider`, `SessionManager`, `OAuthHandlers`, use separate hooks |
| `github-queue-worker.ts` | 267 | Queue processing, diff fetching, AI review, PR comments | Split into: `QueueClaimer`, `DiffFetcher`, `ReviewRunner`, `PRCommenter` |
| `ai_router.py` | 526 | 10 AI endpoints in single file | Split by capability: `chat_router`, `review_router`, `analysis_router`, `agent_router` |

---

## Key Performance Metrics

| Metric | Current State | Target |
|--------|---------------|--------|
| Initial JS bundle (dashboard) | ~2.5MB (est.) | <500KB |
| Initial JS bundle (scanner) | ~7MB (est. with Monaco) | <1MB |
| API response time (no index) | 500ms–5s (full collection scans) | <50ms |
| API response time (with indexes) | <20ms | — |
| Piston execution latency | 200ms–2s (cached runtime) | <500ms |
| MongoDB connection overhead | 6s timeout on fail + fallback | <1s auto-failover |
| Concurrent Piston slots | Configurable (default unlimited) | Configure per-tier |

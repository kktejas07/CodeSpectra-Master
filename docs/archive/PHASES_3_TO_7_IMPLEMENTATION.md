# Phases 3-7: Complete Roadmap & Implementation Guide

## Overview
CodeSpectra progresses through 5 advanced phases to become a comprehensive code quality platform rivaling SonarCloud and incorporating HackerRank-style features.

## Phase 3: GitHub Integration & Advanced Metrics Dashboard
**Timeline: 1-2 weeks | Priority: CRITICAL**

### Progress (2026-04)
- **Manual scan persistence**: signed-in users — `POST /api/analyze-code` writes `code_scans` + `code_metrics` (cookie session + RLS). `GET /api/analysis-history` lists recent scans; manual and GitHub modes load history on mount (`credentials: 'include'`).
- **RLS**: migration `20260417160000_code_scans_write_rls.sql` adds INSERT/UPDATE on `code_scans` and INSERT on `code_metrics` for `authenticated`.
- **GitHub OAuth**: callback + `github_integrations` upsert; repo browser + file fetch + analyze with `github_file` persistence. **Token encryption** (`GITHUB_TOKEN_ENCRYPTION_KEY`, `lib/github-token-crypto.ts`). **Webhooks** (`POST /api/github/webhook`, `GITHUB_WEBHOOK_SECRET`, audit table `github_webhook_events` + migration `20260417200000_github_webhook_events.sql`).
- **GitHub + AI fixes**: `RepositoryBrowser` passes `scanned_code` with scan results; GitHub mode uses the same **`AIFixesPanel`** as manual (persist when `scan_id` UUID).
- **Push queue**: migrations `20260421100000_github_push_scan_queue.sql` + `20260421120000_github_push_scan_queue_compare.sql` — `before_commit_sha`, `owner_login`, dedupe `delivery_id`. **`POST /api/github/webhook`** enqueues **`push`** when `before` / `after` SHAs exist (skips branch deletes).
- **Worker + scheduling**: `lib/github-queue-worker.ts` claims a row, matches **`github_integrations.github_username`** to **`owner_login`**, GitHub **compare**, then scans **up to 8** eligible changed files per queue item (`persistGithubFileScan` each). **`GET`/`POST /api/integrations/github/scan-queue/run`** (`Authorization: Bearer GITHUB_QUEUE_CRON_SECRET`, optional `?limit=5`) drains the queue. **Supabase:** deploy **`supabase/functions/github-scan-queue`** and use **Dashboard → Edge Functions → Schedules** (secrets: `GITHUB_QUEUE_CRON_SECRET`, `CODESPECTRA_APP_URL` = public app origin).
- **Repo metadata**: migration `20260421150000_github_repo_metadata.sql` — `github_repo_metadata` (per-user GitHub numeric id + `full_name`, branch, stars, etc.) with RLS; **`GET /api/github/repos`** upserts each page fetch so the catalog stays warm for future org UI and sweeps.
- **Sweeps**: **`POST /api/integrations/github/scan-queue/sweep`** (signed-in) reads `github_repo_metadata`, compares last two commits on the default branch, enqueues **`github_webhook_scan_queue`** rows with **`queue_kind = sweep`** (service insert). Run the same worker cron to drain.
- **GitHub App / org (schema)**: migration `20260422100000_github_app_queue_collab_rls.sql` — `github_integrations.github_app_installation_id`, **`integration_kind`** `oauth | github_app`, and **`queue_kind`** `push | sweep` on the queue. Wire **installation** webhooks + token exchange in a follow-up when you register the GitHub App.
- **Next (Phase 3)**: Full GitHub App OAuth + installation token exchange; org-wide repo selection; worker matching on `installation_id`.

### Deliverables
1. **GitHub OAuth Integration**
   - OAuth callback handling
   - Token storage with encryption
   - Automatic repository discovery
   - Repository linking UI

2. **Advanced Metrics Display**
   - 8+ metrics visualization
   - Real-time quality scoring
   - Severity-based issue grouping
   - Trend analysis over time

3. **Scan Management**
   - Manual repo/file scanning
   - Scan history with results
   - Auto-trigger on commits (webhook)
   - Scheduled scans

4. **Database Enhancements**
   - GitHub repositories table
   - Code analyses table with metrics
   - Scan history tracking
   - Migrations log

### Components to Build
- `GitHubConnectModal.tsx` - OAuth flow
- `RepositorySelector.tsx` - Browse & link repos
- `AdvancedMetricsCard.tsx` - Metrics display
- `ScanHistoryPanel.tsx` - View past scans
- `MetricsChart.tsx` - Trend visualization

### API Routes
- `POST /api/github/auth/callback` - OAuth token exchange
- `GET /api/github/repos` - List user repositories
- `POST /api/github/repo-files` - Get file tree
- `POST /api/github/restore-file` - Write `original_code` from a fix back to GitHub (rollback)
- `POST /api/analyze-repo` - Full repo analysis
- `GET /api/analysis-history` - Scan history
- `POST /api/integrations/github/scan-queue/sweep` - Enqueue sweep jobs from `github_repo_metadata`

---

## Phase 4: AI-Powered Code Fixes & Quality Gates
**Timeline: 1-2 weeks | Priority: HIGH**

### Progress (2026-04)
- **`/api/quality-gates`**: Uses cookie session (`requireAuth` + `createRouteHandlerSupabase`), scopes rows by `user_id`, maps DB columns (`max_bugs`, …) to API DTOs including nested **`gate_config`** for `/api/check-quality-gate`. Migration `20260417190000_quality_gates_and_fixes_rls.sql` adds optional `description` / `custom_rules` / `is_active` and **INSERT/UPDATE/DELETE** RLS policies.
- **`/api/check-quality-gate`**: Normalizes thresholds (`max_bugs` vs `max_bugs_count`, etc.) and coerces numeric inputs.
- **`/api/apply-fix`**: Auth + ownership; **`action: apply | unapply`** updates **`is_applied`**, **`applied_at`**, **`applied_by`**. RLS allows **UPDATE** on `suggested_fixes` for fixes under the user’s scans.
- **`/api/generate-fixes`**: When the client sends **`scan_id`** (UUID of the user’s `code_scans` row) and the user is signed in, inserts **`code_issues`** + **`suggested_fixes`** after a successful AI run. RLS: migration `20260420120000_code_issues_suggested_fixes_insert_rls.sql` adds **INSERT** policies scoped to own scans. Response includes optional **`persisted`** / per-fix **`db_fix_id`** for `POST /api/apply-fix`.
- **`/api/apply-fix`**: Supports **`fix_ids`** (batch, max 40) for marking multiple fixes applied in one request.
- **Scanner UI**: Shared **`components/scanner/ai-fixes-panel.tsx`** — generate fixes + per-fix apply + **Mark all applied** (batch).
- **Compliance presets**: `lib/compliance-templates.ts` (`COMPLIANCE_GATE_PRESETS`) + **`QualityGatesLivePanel`** on `/dashboard/scanner?mode=quality-gates` loads **`GET /api/quality-gates`**, applies presets, **`POST /api/quality-gates`** create/update (with **`id`**), **`DELETE /api/quality-gates?id=`** removes a gate; **Active** + **Enforce on push** toggles in the form.
- **Undo / limits / duplicate**: `POST /api/apply-fix` supports **`action: "unapply"`** (single or batch) to clear applied markers; **`AIFixesPanel`** shows **Undo apply**. **`POST /api/generate-fixes`** uses an in-process sliding-window **rate limit** (per user when persisting, else per IP) with **429** + `Retry-After`. **`POST /api/quality-gates`** accepts **`duplicate_from_id`** to clone a gate; **Quality gates** UI has **Duplicate**.
- **Next (Phase 4)**: True rollback to prior file contents; `generate-fixes` rate limits backed by Redis in multi-instance deploy; gate import-export (JSON).

### Deliverables
1. **Suggested Fixes Generation**
   - AI-generated fix suggestions
   - Before/after code comparison
   - Confidence scoring
   - Fix explanation

2. **Fix Application**
   - Apply single fix
   - Batch apply fixes
   - Undo/rollback capability
   - Fix history tracking

3. **Quality Gates**
   - Gate configuration UI
   - Threshold settings
   - Pass/fail determination
   - Gate-based reports

4. **Compliance Templates**
   - OWASP Top 10
   - CWE standards
   - NIST guidelines
   - Custom rules

### Components to Build
- `CodeFixViewer.tsx` - Diff viewer with apply
- `QualityGateDashboard.tsx` - Gate management
- `FixAppliedAlert.tsx` - User feedback
- `ComplianceSelector.tsx` - Standard selection
- `RuleBuilder.tsx` - Custom rule creation

### API Routes
- `POST /api/generate-fixes` - Generate fix suggestions (Upstash or in-memory rate limit)
- `POST /api/apply-fix` - Apply / unapply suggested fix (batch supported)
- `GET /api/quality-gates` - Fetch gate configs
- `POST /api/quality-gates` - Create/update/duplicate gates
- `GET /api/quality-gates/export` - JSON export
- `POST /api/quality-gates/import` - JSON import
- `POST /api/check-quality-gate` - Validate against gate

---

## Phase 5: Real-time IDE Integration & Live Analysis
**Timeline: 1-2 weeks | Priority: MEDIUM**

### Progress (2026-04)
- **`components/code-scanner/code-editor.tsx`**: Monaco from CDN; **`credentials: 'include'`** on live analyze fetch; external **`value`** / **`language`** sync with the editor model.
- **Manual scanner**: Monaco vs plain textarea toggle (default Monaco); debounced **live** analysis remains available in `CodeEditor` when enabled elsewhere.
- **Live channel (MVP)**: **`GET /api/events/scanner`** — **Server-Sent Events** stream (`ready` + `ping` every 25s, cookie session). Client can subscribe with `EventSource` and later switch payloads to analysis progress.

### API Routes
- `GET /api/events/scanner` - SSE heartbeat (extend later for analysis events)

### Deliverables
1. **Real-time Analysis**
   - WebSocket connection for live updates
   - Inline issue markers
   - Severity-based highlighting
   - Quick-fix suggestions

2. **Code Editor Integration**
   - Monaco editor setup
   - Syntax highlighting
   - Theme customization
   - Language support

3. **Live Diagnostics**
   - Issue updates as user types
   - Hover tooltips with details
   - Quick action menu
   - Keyboard shortcuts

4. **Performance Optimization**
   - Debounced analysis
   - Caching results
   - Background processing
   - Incremental updates

### Components to Build
- `CodeEditor.tsx` - Monaco editor wrapper
- `DiagnosticPanel.tsx` - Issues sidebar
- `QuickFixMenu.tsx` - Action suggestions
- `RealTimeIndicator.tsx` - Status indicator
- `ThemeSelector.tsx` - Editor themes

### Infrastructure
- WebSocket server for real-time updates
- Analysis queue with worker pool
- Result caching layer
- Performance monitoring

---

## Phase 6: Advanced Reporting & Analytics
**Timeline: 1-2 weeks | Priority: MEDIUM**

### Progress (2026-04)
- **Web Vitals (in-app)**: migration `20260421140000_web_vitals_events.sql` — `WebVitalsReporter` in `/dashboard` layout → **`POST /api/analytics/web-vitals`** (RLS: users insert own rows; superadmin **`SELECT`** all). **`GET /api/analytics/web-vitals/summary`** returns p75 + counts (superadmin); **`/dashboard/admin/speed-insights`** loads that API by range/route.
- **App origin**: `lib/app-origin.ts` uses **`NEXT_PUBLIC_APP_URL`** then **`CODESPECTRA_APP_URL`** only (no vendor deploy URL env vars).
- **Reports (MVP)**: **`POST /api/reports/generate`** — aggregates the caller’s recent scans + metrics into JSON (foundation for PDF/CSV later).

### Deliverables
1. **Historical Analytics**
   - Trend charts (quality over time)
   - Metric breakdowns by file/module
   - Risk matrix visualization
   - Team metrics dashboard

2. **Report Generation**
   - Executive summary reports
   - Detailed analysis reports
   - PDF/Excel export
   - Custom report builder

3. **Compliance Reporting**
   - Standards compliance status
   - Issue categorization by standard
   - Remediation tracking
   - Audit trails

4. **Scheduling & Automation**
   - Scheduled report generation
   - Email delivery
   - Slack/Teams integration
   - Webhook notifications

### Components to Build
- `AnalyticsOverview.tsx` - Main dashboard
- `TrendChart.tsx` - Historical trends
- `RiskMatrix.tsx` - Risk visualization
- `ReportBuilder.tsx` - Custom reports
- `ExportDialog.tsx` - Format selection

### API Routes
- `POST /api/analytics/web-vitals` - Persist Core Web Vitals (`web_vitals_events`)
- `GET /api/analytics/web-vitals/summary` - p75 + sample counts (superadmin)
- `GET /api/analytics` - Get analytics data
- `POST /api/reports/generate` - JSON scan summary (MVP shipped)
- `POST /api/reports/schedule` - Schedule reports
- `GET /api/reports/history` - Report history
- `POST /api/notifications/configure` - Setup alerts

---

## Phase 7: Code Review Collaboration & Team Features
**Timeline: 1-2 weeks | Priority: MEDIUM**

### Progress (2026-04)
- **`scan_comments` RLS** (migration `20260422100000_github_app_queue_collab_rls.sql`): owners can list/insert/update comments on their scans.
- **API**: **`GET/POST /api/collaboration/scan-comments?scan_id=`** — list and add discussion / suggestion / approval / rejection comments on a scan.

### API Routes
- `GET /api/collaboration/scan-comments?scan_id=` - List comments on a scan
- `POST /api/collaboration/scan-comments` - Add comment

### Deliverables
1. **Code Review System**
   - Comments on specific issues
   - Discussion threads
   - Approval workflows
   - Review history

2. **Team Management**
   - Organization/team setup
   - Role-based access control
   - Invite & permission management
   - Activity feeds

3. **Notifications & Alerts**
   - Issue notifications
   - Review assignments
   - Quality gate alerts
   - Digest emails

4. **Integration Points**
   - Slack bot integration
   - GitHub PR comments
   - Jira issue creation
   - CI/CD pipeline integration

### Components to Build
- `CodeReviewPanel.tsx` - Comments & discussion
- `TeamManagement.tsx` - Team settings
- `RoleManager.tsx` - Permission management
- `NotificationCenter.tsx` - Alert management
- `IntegrationSettings.tsx` - Third-party setup

### Database Tables
- team_members (roles, permissions)
- code_reviews (review metadata)
- review_comments (discussions)
- notifications (user alerts)
- integrations (connected services)

---

## Database Schema Evolution

### Phase 3 Tables
```sql
github_tokens
github_repositories
code_analyses (enhanced)
scan_history
suggested_fixes
quality_gates
```

### Phase 4 Tables (additions)
```sql
quality_gate_rules
compliance_standards
applied_fixes
fix_history
```

### Phase 5-7 Tables (additions)
```sql
websocket_sessions
analysis_cache
analytics_snapshots
team_organizations
team_members
code_reviews
review_comments
notifications
integrations
```

---

## Technology Stack

### Frontend
- **Framework**: Next.js 16 with React 19
- **Editor**: Monaco Editor
- **Charts**: Recharts/shadcn charts
- **Real-time**: WebSocket (native or Socket.io)
- **Styling**: Tailwind CSS v4
- **UI**: shadcn/ui components

### Backend
- **Runtime**: Node.js with Next.js API routes
- **Database**: Supabase PostgreSQL
- **Cache**: Redis (Upstash)
- **AI**: AI SDK (`ai` package) with Claude/GPT
- **File Storage**: Supabase Storage or object storage (S3-compatible)
- **WebSocket**: managed hosting with Fly.io or self-hosted

### Integrations
- GitHub OAuth & REST API
- Slack Bot API
- Jira REST API
- Gmail API (for email reports)
- Stripe API (for payments - Phase future)

---

## Implementation Priorities

**Week 1-2 (Phase 3)**: GitHub Integration + Advanced Metrics
- Highest ROI for user acquisition
- Core differentiator from basic tools
- Enables advanced analytics foundation

**Week 3-4 (Phase 4)**: AI Fixes + Quality Gates
- Major productivity booster
- Compliance requirement enabler
- High user satisfaction

**Week 5-6 (Phase 5)**: Real-time IDE Integration
- Premium feature for power users
- Requires significant frontend work
- Performance critical

**Week 7-8 (Phases 6-7)**: Reporting & Collaboration
- Team/enterprise features
- Revenue enabler (premium pricing)
- Sticky engagement driver

---

## Supplement (2026): observability, CDN shell, landing polish, hybrid arena

This wave runs **in parallel** with the phase roadmap above; it does not replace Phase 3–7 work.

| Track | Status (snapshot) | Next steps |
|-------|-------------------|------------|
| **Speed Insights** | Superadmin shell with range selector + **route filter** (UI scaffold); no third-party RUM script in root layout | Store vitals in **Supabase** (table + RLS) or your analytics pipeline; drive charts from that store |
| **CDN** | Superadmin `/dashboard/admin/cdn` tabs (overview, caches, redirects, routing) | Connect to real edge logs or provider APIs; persist redirect/routing rules in DB |
| **Landing “How it works”** | Steps, code panel, intersection-pause in `components/landing/process-showcase.tsx` | Optional: swap copy/snippets in `app/page.tsx` for shorter workflow-style demos |
| **Arena hybrid** | `POST /api/arena/adapt` (auth + optional `OPENAI_API_KEY`); arena detail page fetches and shows AI vs seed badge | Secure runner, hidden tests, per-language stubs from LLM (not only prose) |
| **Settings UX** | Superadmin **Platform settings**: section cards + **per-section PATCH** saves; user **Settings**: appearance/notifications persisted to **localStorage** with section saves | Wire user settings to profile API + theme provider when product-ready |
| **Marketing / legal routes** | `/docs`, `/support`, `/faq`, `/api-reference`, `/blog`, `/careers`, `/privacy`, `/terms`, `/cookies`, `/security` | Replace placeholder copy with counsel-approved documents before launch |
| **Auth + admin APIs** | Browser `createBrowserClient` (`@supabase/ssr`) in `lib/supabase-client.ts` | Session cookies reach `/api/*` (superadmin `platform-settings` after login) — re-login once if you migrated from legacy client |
| **Landing Process** | `components/landing/process-showcase.tsx` | **5s loop**: memoized `StepProgressBar` + RAF width % (isolated from code typing re-renders); visible-only elapsed; code column vertically centered on large screens |

---

## Success Metrics

By Phase 7 completion, CodeSpectra will have:
- ✓ GitHub repo auto-scanning with webhook support
- ✓ 8+ advanced metrics with historical tracking
- ✓ AI-powered fix suggestions with 80%+ accuracy
- ✓ Quality gates enforced across org
- ✓ Real-time analysis in code editor
- ✓ Advanced reporting with compliance
- ✓ Team collaboration features
- ✓ Enterprise-grade integrations

**Expected Impact**:
- 10x+ better than basic linters
- Competitive with SonarCloud in features
- HackerRank-style learning/gamification elements
- Enterprise-ready with compliance support

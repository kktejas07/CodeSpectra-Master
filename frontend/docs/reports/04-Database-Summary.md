> **Auto-Generated Documentation**
> **Last Updated**: 2026-07-08
> **Auto-Update Rule**: Regenerate when codebase architecture or schema changes.

# CodeSpectra — Database Summary

## Overview

- **Database Engine**: MongoDB 7.x (Atlas + local fallback)
- **Database Name**: `codespectra`
- **Driver (Frontend)**: `mongodb` npm v7.3.0
- **Driver (Backend)**: `motor` Python 3.3.1 + `pymongo` 4.6.3
- **Connection URI Priority**: Env var → DB `platform_settings` → Fallback URI
- **ID Strategy**: UUID v4 strings (not MongoDB ObjectId)

---

## Collection Inventory (38 Verified)

### Better Auth (4 collections — auto-managed)

| Collection | Purpose | Managed By |
|-----------|---------|------------|
| `user` | User records with role, plan, tenantId | Better Auth + manual updates |
| `session` | Session tokens | Better Auth |
| `account` | OAuth account linkages | Better Auth |
| `verification` | Email verification tokens | Better Auth |

### Scanner & Quality (6 collections — `lib/db/scans.ts`)

| Collection | Document Type | Key Fields |
|-----------|---------------|------------|
| `code_scans` | `CodeScanDoc` | `user_id`, `scan_type`, `scan_status`, `language`, `created_at` |
| `code_metrics` | `CodeMetricsDoc` | `scan_id`, `overall_quality_score`, `bugs`, `vulnerabilities`, `code_smells` |
| `code_issues` | `CodeIssueDoc` | `scan_id`, `severity`, `type`, `status`, `file_path`, `line_number` |
| `suggested_fixes` | `SuggestedFixDoc` | `issue_id`, `scan_id`, `user_id`, `applied` |
| `quality_gates` | `QualityGateDoc` | `project_id`, `user_id`, `name`, `conditions` |
| `scan_activities` | `ScanActivityDoc` | `user_id`, `type`, `message` |

### Problems & Submissions (2 collections — `lib/db/problems.ts`)

| Collection | Document Type | Key Fields |
|-----------|---------------|------------|
| `problems` | `ProblemDoc` | `slug`, `difficulty`, `topics`, `test_cases`, `starter_code` |
| `submissions` | `SubmissionDoc` | `problem_id`, `user_id`, `language`, `status`, `score` |

### AI Features (8 collections — `lib/db/ai.ts`)

| Collection | Document Type | Key Fields |
|-----------|---------------|------------|
| `ai_chat_sessions` | `AiChatSessionDoc` | `user_id`, `title`, `model_role` |
| `ai_chat_messages` | `AiChatMessageDoc` | `session_id`, `user_id`, `role`, `content` |
| `ai_code_reviews` | `AiCodeReviewDoc` | `user_id`, `scan_id`, `language`, `result` |
| `ai_grades` | `AiGradeDoc` | `user_id`, `submission_id`, `rubric`, `result` |
| `ai_generated_problems` | `AiGeneratedProblemDoc` | `user_id`, `payload`, `published_problem_id` |
| `proctor_events` | `ProctorEventDoc` | `user_id`, `session_kind`, `session_id`, `event_type` |
| `identity_verifications` | `IdentityVerificationDoc` | `user_id`, `status`, `result` |
| `skill_insights_cache` | *(generic)* | `user_id`, `result`, `created_at` |

### Billing (3 collections — `lib/db/billing.ts`)

| Collection | Document Type | Key Fields |
|-----------|---------------|------------|
| `billing_orders` | `BillingOrderDoc` | `user_id`, `razorpay_order_id`, `amount_paise`, `status` |
| `billing_payments` | `BillingPaymentDoc` | `user_id`, `order_id`, `razorpay_payment_id`, `status` |
| `billing_subscriptions` | `BillingSubscriptionDoc` | `user_id`, `plan_id`, `status`, `started_at`, `ends_at` |

### Content & Assessments (8 collections — `lib/db/content.ts` + `lib/db/certifications.ts`)

| Collection | Document Type | Key Fields |
|-----------|---------------|------------|
| `codeathons` | `CodeathonDoc` | `title`, `start_date`, `end_date`, `status` |
| `codeathon_registrations` | `CodeathonRegistrationDoc` | `codeathon_id`, `user_id` |
| `exams` | `ExamDoc` | `title`, `difficulty_level`, `duration`, `status` |
| `exam_submissions` | `ExamSubmissionDoc` | `exam_id`, `user_id`, `score`, `passed` |
| `job_postings` | `JobDoc` | `title`, `company`, `skills`, `is_active` |
| `job_applications` | `JobApplicationDoc` | `job_id`, `user_id`, `status` |
| `resumes` | `ResumeDoc` | `user_id`, `file_name`, `status`, `analysis` |
| `certifications` | `CertificationDoc` | `slug`, `title`, `level`, `category`, `questions` |
| `certification_attempts` | `CertificationAttemptDoc` | `user_id`, `certification_id`, `score`, `passed` |

### Admin & RBAC (6 collections)

| Collection | Source | Key Fields |
|-----------|--------|------------|
| `roles` | `frontend/lib/route-auth.ts` | `role`, `permissions[]` |
| `plans` | `frontend/lib/plans.ts` | `id`, `name`, `features`, `price` |
| `permissions` | `frontend/lib/db/admin.ts` | `name`, `role`, `description` |
| `organization_invitations` | `frontend/lib/db/admin.ts` | `organization_id`, `email`, `role`, `status` |
| `user_roles` | `frontend/lib/db/admin.ts` | `user_id`, `organization_id`, `role` |
| `notifications` | `frontend/lib/db/admin.ts` | `user_id`, `title`, `type`, `is_read` |
| `notification_preferences` | `frontend/lib/db/admin.ts` | `user_id`, `type`, `enabled`, `categories` |

### XP, GitHub & Workflows (6 collections — `lib/db/leaderboard.ts`)

| Collection | Document Type | Key Fields |
|-----------|---------------|------------|
| `xp_events` | `XpEventDoc` | `user_id`, `amount`, `reason`, `problem_id` |
| `github_webhook_events` | `GithubWebhookEventDoc` | `delivery_id`, `event_type`, `repository_full_name` |
| `github_webhook_scan_queue` | `GithubScanQueueDoc` | `delivery_id`, `repository_full_name`, `status`, `locked_at` |
| `workflows` | `WorkflowDoc` | `name`, `trigger`, `nodes`, `edges`, `is_active` |
| `workflow_runs` | `WorkflowRunDoc` | `workflow_id`, `user_id`, `status`, `steps` |

### Generic / Catch-All (14+ collections — `lib/db/misc.ts`)

| Collection | Purpose |
|-----------|---------|
| `integrations` | Connected third-party accounts (GitHub, Slack, SonarQube) |
| `github_tokens` | Encrypted GitHub access tokens |
| `github_scan_queue` | Legacy scan queue (overlaps with `github_webhook_scan_queue`) |
| `support_tickets` | User support requests |
| `pricing_tiers` | Pricing tier definitions |
| `pricing_features` | Per-tier feature flags |
| `web_vitals_events` | Real-user monitoring data |
| `admin_audit_logs` | Admin action audit trail |
| `feature_flags` | Runtime feature toggles |
| `code_review_comments` | Inline code review comments |
| `scan_comments` | Scanner result comments |
| `quality_ratings` | Quality rating rules |
| `platform_settings` | Platform-wide configurable settings |

---

## Naming Conflicts & Schema Issues

| Conflict | Collections | Source Files | Risk |
|----------|-------------|--------------|------|
| `quality_gates` defined in two places | `lib/db/scans.ts:134` + `lib/db/misc.ts:37` | Both export accessor functions pointing to same collection name | ⚠️ LOW — same name, same collection |
| `suggested_fixes` in two places | `lib/db/scans.ts:130` + `lib/db/misc.ts:76` | Both access same collection with different types | ⚠️ MEDIUM — type mismatch risk |
| `github_scan_queue` vs `github_webhook_scan_queue` | `lib/db/misc.ts:55` + `lib/db/leaderboard.ts:141` | Two collections for similar purpose | ⚠️ MEDIUM — data fragmentation |
| `github_tokens` standalone vs `integrations` | `lib/db/misc.ts:52` + `lib/db/misc.ts:49` | Token storage split across collections | ⚠️ MEDIUM — orphan token risk |
| `quality_ratings` named but unused | `lib/db/misc.ts:41` | Exists as accessor, no usage found | LOW — dead code |

---

## Critical Database Issues

### No Indexes
Every query in the codebase performs full collection scans. No `createIndex()` call was found in any file. This is the single biggest performance issue.

**Priority index suggestions**:
```javascript
// Code scans
db.code_scans.createIndex({ user_id: 1, created_at: -1 })
db.code_metrics.createIndex({ scan_id: 1 })
db.code_issues.createIndex({ scan_id: 1, severity: 1, status: 1 })

// Submissions
db.submissions.createIndex({ user_id: 1, created_at: -1 })
db.submissions.createIndex({ problem_id: 1, created_at: -1 })
db.submissions.createIndex({ user_id: 1, problem_id: 1 })

// AI
db.ai_chat_messages.createIndex({ session_id: 1, created_at: 1 })
db.ai_chat_sessions.createIndex({ user_id: 1, updated_at: -1 })

// XP
db.xp_events.createIndex({ user_id: 1, created_at: -1 })
db.xp_events.createIndex({ user_id: 1, problem_id: 1, reason: 1 })

// Queue worker
db.github_webhook_scan_queue.createIndex({ status: 1, locked_at: 1 })

// Notifications
db.notifications.createIndex({ user_id: 1, is_read: 1, created_at: -1 })

// Billing
db.billing_orders.createIndex({ user_id: 1, created_at: -1 })
db.billing_payments.createIndex({ order_id: 1 })
```

### No Schema Validation
No MongoDB collection has a `validator` or `$jsonSchema` defined. Document shapes are enforced only by TypeScript interfaces at the application layer.

### No Transactions
No `startSession()` or `withTransaction()` calls found. Multi-document operations (e.g., award XP + create submission) are not atomic.

### No TTL Indexes
No `expireAfterSeconds` on any collection. Stale data (webhook events, scan results, chat messages) accumulates indefinitely.

### No Tenant Isolation
Collections that span tenants (e.g., `billing_orders`, `code_scans`) store `user_id` but have no query-level tenant filtering. Multi-tenant data co-exists in the same collection without isolation guarantees.

---

## Migration Status

| Item | Status | Notes |
|------|--------|-------|
| Supabase → MongoDB migration | ✅ Complete | All production Supabase imports removed |
| `db-init.ts` | ✅ Converted to no-op | Was running Supabase migrations |
| String UUIDs instead of ObjectIds | ✅ Consistent | `randomUUID()` everywhere |
| Legacy `github_scan_queue` | 🟡 Pending consolidation | Overlaps with `github_webhook_scan_queue` |
| `billing-server.ts` stub | ❌ Dead | Throws errors, needs re-implementation |

> **Auto-Generated Documentation**
> **Last Updated**: 2026-07-08
> **Source**: CodeSpectra Codebase Audit
> **Auto-Update Rule**: This document must be regenerated when API endpoints or database schemas change.

# Index Strategy

## Current State: No Explicit Indexes

The codebase uses MongoDB Driver directly via `Collection.find()` / `aggregate()` calls. **There are zero explicit `createIndex()` calls in the entire codebase.** MongoDB's default `_id` index is the only index guaranteed present.

## Query Pattern Analysis (from code)

### Hot Query Patterns
| Pattern | Collections | Frequency |
|---------|-------------|-----------|
| `find({ user_id: ... }).sort({ created_at: -1 })` | `code_scans`, `xp_events`, `notifications`, `scan_activities`, `ai_chat_sessions` | Very High |
| `find({ scan_id: ... })` | `code_metrics`, `code_issues`, `suggested_fixes` | High |
| `find({ session_id: ... }).sort({ created_at: 1 })` | `ai_chat_messages` | High |
| `findOne({ email: ... })` | `user` | High (login) |
| `find({ slug: ... })` | `problems`, `certifications`, `hackathons` | High |
| `find({ id: ..., user_id: ... })` | Many collections (ownership check) | Medium |
| `aggregate([$match: {user_id}, $lookup])` | `code_scans` → `code_metrics` | Medium |
| `find({ problem_id: ..., user_id: ... })` | `submissions`, `xp_events` | Medium |
| `find({ status: ... })` | `github_webhook_scan_queue`, `billing_orders` | Medium |

## Recommended Indexes

### Auth Collections

| Collection | Index | Type | Justification |
|------------|-------|------|---------------|
| `user` | `{ email: 1 }` | Unique | Login lookup (used in `login/route.ts:18`) |
| `user` | `{ id: 1 }` | Unique | User lookup by custom ID field |
| `account` | `{ userId: 1 }` | Standard | FK lookup for OAuth account linking |
| `account` | `{ provider: 1, providerAccountId: 1 }` | Unique | Ensure one account per provider |
| `session` | `{ userId: 1 }` | Standard | Find all sessions for a user |
| `session` | `{ sessionToken: 1 }` | Unique | Session validation |
| `session` | `{ expiresAt: 1 }` | TTL | Auto-expire old sessions |

### Scanner Collections

| Collection | Index | Type | Justification |
|------------|-------|------|---------------|
| `code_scans` | `{ user_id: 1, created_at: -1 }` | Compound | `listScansWithMetrics` sorts by created_at DESC after user_id match |
| `code_scans` | `{ id: 1 }` | Unique | PK lookup from `$lookup` localField |
| `code_metrics` | `{ scan_id: 1 }` | Standard | FK lookup via `$lookup` (code_metrics.scan_id → code_scans.id) |
| `code_metrics` | `{ id: 1 }` | Unique | PK |
| `code_issues` | `{ scan_id: 1 }` | Standard | FK lookup in `listIssues` |
| `code_issues` | `{ user_id: 1, created_at: -1 }` | Compound | List issues for user |
| `code_issues` | `{ project_id: 1, scan_id: 1 }` | Compound | Filter by project + scan |
| `suggested_fixes` | `{ issue_id: 1 }` | Standard | FK lookup |
| `suggested_fixes` | `{ scan_id: 1 }` | Standard | FK lookup |
| `scan_activities` | `{ user_id: 1, created_at: -1 }` | Compound | `listActivities` query pattern |
| `file_metrics` | `{ scan_id: 1 }` | Standard | FK lookup |
| `file_metrics` | `{ project_id: 1 }` | Standard | Project filter |

### AI Collections

| Collection | Index | Type | Justification |
|------------|-------|------|---------------|
| `ai_chat_sessions` | `{ user_id: 1, updated_at: -1 }` | Compound | List recent sessions for user |
| `ai_chat_messages` | `{ session_id: 1, created_at: 1 }` | Compound | Load history in order |
| `ai_chat_messages` | `{ user_id: 1 }` | Standard | User message ownership check |
| `ai_code_reviews` | `{ user_id: 1 }` | Standard | List user's reviews |
| `ai_grades` | `{ user_id: 1 }` | Standard | List user's grades |

### Content Collections

| Collection | Index | Type | Justification |
|------------|-------|------|---------------|
| `problems` | `{ slug: 1 }` | Unique | Problem lookup by slug (used in `/problems/[slug]`) |
| `problems` | `{ is_published: 1, difficulty: 1 }` | Compound | Filter published problems |
| `submissions` | `{ problem_id: 1, user_id: 1, created_at: -1 }` | Compound | User's submissions for a problem |
| `submissions` | `{ user_id: 1, created_at: -1 }` | Compound | User's submission history |

### Certifications

| Collection | Index | Type | Justification |
|------------|-------|------|---------------|
| `certifications` | `{ slug: 1 }` | Unique | Public certification page lookup |
| `certification_attempts` | `{ user_id: 1 }` | Standard | User's attempts |
| `certification_attempts` | `{ verify_token: 1 }` | Unique | Public verification URL lookup |
| `certification_attempts` | `{ certification_id: 1 }` | Standard | FK lookup |

### Billing Collections

| Collection | Index | Type | Justification |
|------------|-------|------|---------------|
| `billing_orders` | `{ user_id: 1, created_at: -1 }` | Compound | User's order history |
| `billing_orders` | `{ razorpay_order_id: 1 }` | Unique | Razorpay reconciliation |
| `billing_payments` | `{ order_id: 1 }` | Standard | Payments for an order |
| `billing_payments` | `{ razorpay_payment_id: 1 }` | Unique | Razorpay reconciliation |
| `billing_payments` | `{ user_id: 1 }` | Standard | User's payment history |
| `billing_subscriptions` | `{ user_id: 1, status: 1 }` | Compound | Find active subscription for user |

### XP / Leaderboard

| Collection | Index | Type | Justification |
|------------|-------|------|---------------|
| `xp_events` | `{ user_id: 1, created_at: -1 }` | Compound | XP history + aggregation |
| `xp_events` | `{ user_id: 1, problem_id: 1, reason: 1 }` | Compound | Idempotency check for per-problem XP awards |

### GitHub Webhook Queue

| Collection | Index | Type | Justification |
|------------|-------|------|---------------|
| `github_webhook_scan_queue` | `{ status: 1, created_at: 1 }` | Compound | Queue sweep picks pending items |
| `github_webhook_scan_queue` | `{ delivery_id: 1 }` | Unique | Dedup webhook deliveries |

### Workflows

| Collection | Index | Type | Justification |
|------------|-------|------|---------------|
| `workflows` | `{ created_by: 1 }` | Standard | Workflows by user |
| `workflow_runs` | `{ workflow_id: 1, created_at: -1 }` | Compound | Run history per workflow |

### Admin / Settings

| Collection | Index | Type | Justification |
|------------|-------|------|---------------|
| `notifications` | `{ user_id: 1, is_read: 1, created_at: -1 }` | Compound | Unread notifications for user |
| `admin_audit_logs` | `{ created_at: -1 }` | Standard | Audit log sorted by time |
| `admin_audit_logs` | `{ actor: 1, created_at: -1 }` | Compound | Audit by actor |

### Integrations

| Collection | Index | Type | Justification |
|------------|-------|------|---------------|
| `integrations` | `{ user_id: 1, provider: 1 }` | Unique | One integration per provider per user |
| `github_tokens` | `{ user_id: 1 }` | Standard | Token lookup |

### QR / Hackathons

| Collection | Index | Type | Justification |
|------------|-------|------|---------------|
| `id_card_tokens` | `{ token: 1 }` | Unique | QR scan lookup |
| `id_card_tokens` | `{ user_id: 1, role_variant: 1 }` | Compound | GetOrCreate pattern |
| `hackathons` | `{ slug: 1 }` | Unique | Public page |
| `hackathon_teams` | `{ hackathon_id: 1 }` | Standard | Teams for a hackathon |

## Unique Constraints Required

| Collection | Index | Reason |
|------------|-------|--------|
| `user` | `{ email: 1 }` | Duplicate emails already checked at signup, but no DB-level constraint |
| `problems` | `{ slug: 1 }` | URL-unique problem slugs |
| `certifications` | `{ slug: 1 }` | URL-unique cert slugs |
| `hackathons` | `{ slug: 1 }` | URL-unique hackathon slugs |
| `xp_events` | `{ user_id: 1, problem_id: 1, reason: 1 }` | Idempotency for XP awards |
| `certification_attempts` | `{ verify_token: 1 }` | Public verification URLs must be unique |

## TTL Indexes Required

| Collection | Index | TTL | Justification |
|------------|-------|-----|---------------|
| `session` | `{ expiresAt: 1 }` | 0 (at expiry) | Auto-expire stale sessions (Better Auth may do this) |
| `github_oauth_states` | `{ created_at: 1 }` | 10 minutes | OAuth state cleanup |
| `web_vitals_events` | `{ created_at: 1 }` | 90 days | Analytics retention |
| `admin_audit_logs` | `{ created_at: 1 }` | 1 year | Audit log retention |

## Implementation Note

Indexes should be created in `lib/db-init.ts` or in a dedicated migration script. For example:

```typescript
// lib/db-init.ts
async function ensureIndexes() {
  const db = await getMongoDb()
  
  await db.collection('user').createIndex({ email: 1 }, { unique: true })
  await db.collection('user').createIndex({ id: 1 }, { unique: true })
  await db.collection('code_scans').createIndex({ user_id: 1, created_at: -1 })
  await db.collection('code_metrics').createIndex({ scan_id: 1 })
  await db.collection('problems').createIndex({ slug: 1 }, { unique: true })
  await db.collection('xp_events').createIndex({ user_id: 1, problem_id: 1, reason: 1 }, { unique: true, partialFilterExpression: { problem_id: { $exists: true } } })
  // ... etc
}
```

WARNING: `createIndex` with `unique: true` will **fail** if duplicates already exist. Run a dedup step first or use `createIndex` with `{ background: true }` for non-unique indexes.

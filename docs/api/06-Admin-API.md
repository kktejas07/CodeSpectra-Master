> **Auto-Generated Documentation**
> **Last Updated**: 2026-07-08
> **Source**: CodeSpectra Codebase Audit
> **Auto-Update Rule**: This document must be regenerated when API endpoints or database schemas change.

# Admin API

## Admin User Management

### GET /api/admin/users
List all users. Returns user rows with profile data.

**Auth**: `requireSuperAdmin()`

**Response (200):**
```json
{
  "users": [
    {
      "id": "uuid",
      "email": "user@example.com",
      "full_name": "John Doe",
      "role": "user",
      "plan": "free",
      "created_at": "2026-01-15T00:00:00Z",
      "updated_at": "2026-07-01T00:00:00Z",
      "last_sign_in_at": null,
      "provider": "email",
      "identities": [],
      "is_active": true,
      "is_verified": false,
      "scan_count": 0
    }
  ]
}
```

### POST /api/admin/users
Provision a new user (Firebase account + MongoDB profile).

**Auth**: `requireSuperAdmin()`

**Request Body:**
```json
{
  "email": "newuser@example.com",
  "password": "tempPass123!",
  "full_name": "New User",
  "role": "user"
}
```

**Response (200):**
```json
{
  "user": {
    "id": "firebase_uid",
    "email": "newuser@example.com",
    "full_name": "New User",
    "role": "user",
    "created_at": "..."
  },
  "welcomeEmailSent": false,
  "delivery": "none"
}
```

### GET /api/admin/users/[userId]
Get single user details.

**Auth**: `requireSuperAdmin()`

### PATCH /api/admin/users/[userId]
Update user (role, name, status, plan, password, tenantId).

**Auth**: `requireSuperAdmin()`

**Request Body:**
```json
{
  "role": "tenant_admin",
  "tenantId": "tenant-uuid"
}
```
`tenantId: null` clears the user's organization membership.

### DELETE /api/admin/users/[userId]
Delete user.

## Admin Tenants (Organizations)

### GET /api/admin/tenants
List all organizations with live `member_count`.

**Auth**: `requireSuperAdmin()`

**Response (200):**
```json
{
  "data": [
    { "id": "uuid", "name": "Acme Corp", "slug": "acme", "plan": "enterprise", "is_active": true, "created_at": "...", "created_by": "uuid", "member_count": 12 }
  ]
}
```

### POST /api/admin/tenants
Create an organization. Optionally provisions the org admin account in the same step.

**Auth**: `requireSuperAdmin()`

**Request Body:**
```json
{ "name": "Acme Corp", "slug": "acme", "plan": "enterprise", "admin_email": "jane@acme.com", "admin_name": "Jane Doe", "admin_password": "min-8-chars" }
```
Slug is auto-generated (lowercase, dashed) when omitted and deduped with a suffix on collision.

`admin_email` is optional. When provided, the user is created (Firebase account + DB record) with role `tenant_admin`, attached to the new tenant, and returned as `admin` in the response:
```json
{ "data": { "...": "...", "member_count": 1 }, "admin": { "id": "uid", "email": "jane@acme.com", "role": "tenant_admin" } }
```
If `admin_email` matches an existing user, they are attached to the new tenant and promoted to `tenant_admin` instead. A password is generated when omitted or shorter than 8 chars.

### PATCH /api/admin/tenants/[id]
Update organization (name, slug, plan, is_active).

### DELETE /api/admin/tenants/[id]
Delete organization. Members are detached (`tenantId` set to null) but their accounts remain.

### POST /api/admin/impersonate
Superadmin signs in as another user to debug their experience.

**Auth**: `requireSuperAdmin()`

**Request Body:**
```json
{ "userId": "target-user-id" }
```

Saves the admin's real session cookie to `codespectra_impersonator` and swaps the session to the target user. Fellow superadmins cannot be impersonated (403). Restore with `POST /api/admin/impersonate/stop`.

### POST /api/admin/impersonate/stop
Restore the admin's original session after impersonation.

### GET /api/admin/impersonate
Returns `{ "impersonating": true }` when the current session is an impersonation.

## Admin Teams

### GET /api/admin/teams
List all teams.

**Auth**: `requireSuperAdmin()`

### GET /api/admin/teams/members
List team members for the caller's organization (`tenant_admin`) or all users (`superadmin`; filter via `?tenantId=`).

**Auth**: `requireSuperAdmin()` or `tenant_admin`

**Query Params:**
- `?tenantId=<id>` — superadmin: filter to one org
- `?tenantId=all` — superadmin: all users
- `?stats=true` — include `{ total, active }` counts

### POST /api/admin/teams/members
Create a member inside the caller's organization (always role `user` unless superadmin opts into `tenant_admin`; scoped to the caller's tenant).

**Auth**: `requireSuperAdmin()` or `tenant_admin`

**Request Body:**
```json
{ "email": "member@company.com", "name": "Jane Doe", "password": "optional", "tenantId": "optional-superadmin", "role": "user | tenant_admin" }
```
- `tenantId` — superadmin only: attach the member to any org.
- `role` — superadmin only: `tenant_admin` provisions an org admin; anything else creates a plain `user`. Tenant admins always create plain `user`.
- If the email already exists, the account is attached to the tenant and its role is upgraded (never downgrades a `superadmin`).

### GET /api/admin/teams/activity
Team activity report — aggregates scan counts, review counts, submissions per team member.

**Auth**: `requireSuperAdmin()`

## Admin Permissions

### GET /api/admin/permissions/roles
List all RBAC roles with their permissions.

**Auth**: `requireSuperAdmin()`

**Response (200):**
```json
[{ "id": "...", "role": "superadmin", "permissions": [{ "resource": "*", "actions": ["*"] }] }]
```

### POST /api/admin/permissions/roles
Create a new role.

### PUT /api/admin/permissions/roles
Update a role.

### POST /api/admin/permissions/seed
Seed default roles (`superadmin`, `tenant_admin`, `user`) into the `roles` collection.

**Auth**: `requireSuperAdmin()`

## Admin Platform Settings

### GET /api/admin/platform-settings
List all platform settings.

**Auth**: `requireSuperAdmin()`

### PUT /api/admin/platform-settings
Update platform settings.

## Admin Pricing

### GET /api/admin/pricing/tiers
List pricing tiers.

### POST /api/admin/pricing/tiers
Create pricing tier.

### GET /api/admin/pricing/features
List pricing features.

### POST /api/admin/pricing/features
Create pricing feature.

### GET /api/admin/pricing/tiers/[id]/features
List features for a tier.

### POST /api/admin/pricing/tiers/[id]/features
Add feature to tier.

### DELETE /api/admin/pricing/tiers/[id]/features/[featureId]
Remove feature from tier.

## Admin Plans

### GET /api/admin/plans
List all pricing plans from the `plans` collection.

### POST /api/admin/plans
Create a new plan.

## Admin Security

### GET /api/admin/security
List security settings.

**Auth**: `requireSuperAdmin()`

**Response (200):**
```json
{
  "data": [
    { "name": "Two-Factor Authentication", "status": "enabled", "icon": "Lock" },
    { "name": "IP Whitelist", "status": "disabled", "icon": "Shield" },
    { "name": "API Rate Limiting", "status": "enabled", "icon": "alert-triangle" }
  ]
}
```

## Admin Audit Logs

### GET /api/admin/audit-logs
List admin audit trail.

**Auth**: `requireSuperAdmin()`

**Response (200):**
```json
{
  "data": [
    {
      "id": "a1",
      "ts": "2026-06-29T14:22:01Z",
      "actor": "superadmin@codespectra.com",
      "actorIp": "203.0.113.10",
      "action": "platform_settings.update",
      "resource": "general",
      "resourceType": "settings",
      "severity": "info",
      "outcome": "success",
      "detail": "maintenance_mode toggled"
    }
  ]
}
```

## Admin System

### GET /api/admin/system/stats
System statistics (user counts, scan counts, DB status).

### GET /api/admin/system/cache
View or clear in-memory permission cache.

### GET /api/admin/metrics
Platform-wide metrics (aggregate scan counts, active users).

### GET /api/admin/server-secrets
List server secrets (encrypted keys).

### POST /api/admin/server-secrets
Set a server secret.

### POST /api/admin/test-emails
Test email delivery configuration.

## Admin Newsletter

### GET /api/newsletter/subscribers
List newsletter subscribers (superadmin). Query: `?limit=&offset=`. Returns `{ subscribers, total, subscribed, limit, offset }`.

### POST /api/newsletter/subscribers
Broadcast a newsletter to all active subscribers (superadmin). Body: `{ subject, content }` (content supports simple HTML). Emails each subscriber via Postal with the branded `newsletter` template and a per-recipient unsubscribe link. Returns `{ ok, sent, failed, total }`.

> Public (no auth): `POST /api/newsletter/subscribe` (signup), `GET|POST /api/newsletter/unsubscribe?email=` (opt-out). Collection: `newsletter_subscribers`.

## Question Bank API

Backing collection: `question_bank` (see `lib/question-bank.ts` for schema + normalization).

### GET /api/question-bank
List questions with server-side filtering + pagination.
**Auth**: `requireAuth()`

Query params: `q` (search title/question/subject/tags), `branch`, `degree_type`, `difficulty`, `type`, `subject`, `page` (default 1), `limit` (default 25, max 100).

**Response (200):** `{ data: BankQuestionDoc[], total, page, limit }`

### POST /api/question-bank
Create a single question. **Auth**: `requireSuperAdmin()`
Body: `BankQuestionDoc` fields (`question` required; legacy `title`/`domain`/uppercase `type` tolerated). Returns the normalized doc (201).

### PATCH /api/question-bank?id=<id>
Update an existing question. **Auth**: `requireSuperAdmin()`

### DELETE /api/question-bank?id=<id>
Delete a question. **Auth**: `requireSuperAdmin()`

### GET /api/question-bank/stats
Aggregate totals. **Auth**: `requireAuth()`
Optional `?branch=` scopes counts. Returns `{ total, byDifficulty, byType, byBranch, byDegree, branchCatalog, degreeCatalog }`.

### POST /api/question-bank/import
Bulk import. **Auth**: `requireSuperAdmin()`
Accepts either `application/json` (array of question objects or `{questions: []}`) or `text/plain` CSV with header `type,title,question,options,answer,explanation,difficulty,degree_type,branch,subject,tags,marks` (options pipe-delimited). Dedupes by content hash (skips existing). Max 5000 items. Returns `{ inserted, skipped, errors }`.

### POST /api/question-bank/generate
AI bulk generation. **Auth**: `requireSuperAdmin()`
Body: `{ branch?, subject?, difficulty?: 'Easy'|'Medium'|'Hard'|'mixed', types?: string[], count? }`. Streams through the backend `/internal/ai/complete` with provider fallbacks. Inserts into the bank, deduping by content hash. Returns `{ inserted, requested, skipped, errors }`.

## List of All Admin Routes

| Route | Methods | Auth | Collection(s) |
|-------|---------|------|---------------|
| `/api/admin/users` | GET, POST | superadmin | `user` |
| `/api/admin/users/[userId]` | GET, PATCH, DELETE | superadmin | `user` |
| `/api/admin/tenants` | GET, POST | superadmin | `tenants` |
| `/api/admin/tenants/[id]` | PATCH, DELETE | superadmin | `tenants` |
| `/api/admin/impersonate` | GET, POST | superadmin | `user`, session |
| `/api/admin/impersonate/stop` | POST | session cookie | `user`, session |
| `/api/admin/teams` | GET | superadmin | `teams` |
| `/api/admin/teams/members` | GET, POST | superadmin, tenant_admin | `user` |
| `/api/admin/teams/activity` | GET | superadmin | multiple |
| `/api/admin/permissions/roles` | GET, POST, PUT | superadmin | `roles` |
| `/api/admin/permissions/seed` | POST | superadmin | `roles` |
| `/api/admin/platform-settings` | GET, PUT | superadmin | `platform_settings` |
| `/api/admin/pricing/tiers` | GET, POST | superadmin | `pricing_tiers` |
| `/api/admin/pricing/features` | GET, POST | superadmin | `pricing_features` |
| `/api/admin/pricing/tiers/[id]/features` | GET, POST | superadmin | `tier_features` |
| `/api/admin/pricing/tiers/[id]/features/[featureId]` | POST, DELETE | superadmin | `tier_features` |
| `/api/admin/plans` | GET, POST | superadmin | `plans` |
| `/api/admin/security` | GET | superadmin | `security_settings` |
| `/api/admin/audit-logs` | GET | superadmin | `admin_audit_logs` |
| `/api/admin/system/stats` | GET | superadmin | multiple |
| `/api/admin/system/cache` | GET, POST | superadmin | in-memory |
| `/api/admin/metrics` | GET | superadmin | multiple |
| `/api/admin/server-secrets` | GET, POST | superadmin | `server_secrets` |
| `/api/admin/test-emails` | POST | superadmin | N/A (Postal) |
| `/api/newsletter/subscribers` | GET, POST | superadmin | `newsletter_subscribers` |
| `/api/question-bank` | GET, POST, PATCH, DELETE | GET auth, rest superadmin | `question_bank` |
| `/api/question-bank/stats` | GET | auth | `question_bank` |
| `/api/question-bank/import` | POST | superadmin | `question_bank` |
| `/api/question-bank/generate` | POST | superadmin | `question_bank` |

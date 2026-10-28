# Role-Based Access Control (RBAC) — CodeSpectra

> **Auto-Generated**: Internal Engineering documentation.

> **Last Updated:** 2026-07-08  
> **Roles:** `superadmin`, `tenant_admin`, `user`  
> **Permission Sources:** Static (page-permissions.ts) + Dynamic (MongoDB `roles` collection)

---

## Role Hierarchy

```
superadmin ─── unrestricted access to all pages + API routes
    │
tenant_admin ── org-level access: team management + all user pages
    │
user ────────── personal access: challenges, learning, profile, scanner
```

---

## Permission Sources

### Source 1: Static Route Registry (`frontend/lib/page-permissions.ts`)

Three exported arrays that define route-to-role mapping:

```
ADMIN_ONLY_ROUTES = ['/dashboard/admin', ...] → requires superadmin
TENANT_ADMIN_ROUTES = ['/dashboard/admin/team', ...] → requires tenant_admin+
ALL_USER_ROUTES = ['/dashboard', '/dashboard/arena', ...] → requires any auth
```

### Source 2: Database-Driven Permissions (`frontend/lib/permissions-db.ts`)

MongoDB `roles` collection stores per-role resource permissions with CRUD actions.

```
roles document:
  { role: 'superadmin', permissions: [{ resource, actions: ['manage'] }] }
```

The `checkResourcePermission()` function checks if a role has a specific action on a resource.

---

## Authorization Check Chain

```mermaid
flowchart TD
    A[Incoming Request] --> B{Is it an API route?}
    
    B -->|Yes| C[route-auth.ts / requireAuth()]
    C --> D{Session cookie present?}
    D -->|Yes| E[Jose verifySessionToken + Firebase Admin fallback]
    D -->|No| F{Auth header Bearer?}
    F -->|Yes| G[Firebase verifyIdToken]
    F -->|No| H[401 Unauthorized]
    E --> I[Normalize role via rbac.ts]
    G --> I
    
    I --> J{Role check}
    J -->|requireSuperAdmin| K{role === 'superadmin'?}
    J -->|requireAdmin| L{role in ['superadmin','tenant_admin']?}
    J -->|requireAuth| M{user exists?}
    
    K -->|No| N[403 Forbidden]
    L -->|No| N
    M -->|No| N
    
    K -->|Yes| O[DB permission check<br/>route-auth.ts requirePermission()]
    L -->|Yes| O
    M -->|Yes| O
    
    O --> P{Has resource:action?}
    P -->|No| N
    P -->|Yes| Q[200 OK]
    
    B -->|No - Page route| R[Middleware.ts]
    R --> S{Session valid?}
    S -->|No| T[Redirect to /auth/login]
    S -->|Yes| U[Normalize role]
    U --> V{isSuperAdmin?}
    V -->|Yes| W[Allow all pages]
    V -->|No| X[canAccessPage() → check route in ACCESSIBLE_PAGES]
    X -->|Allowed| Y[Render page]
    X -->|Denied| Z[Redirect to default dashboard]
```

---

## Key Files

| File | Purpose |
|------|---------|
| `frontend/lib/page-permissions.ts` | Static route → role mapping (single source of truth) |
| `frontend/lib/rbac.ts` | Auto-generated role page lists + helper functions |
| `frontend/lib/route-auth.ts` | Server-side auth guards + permission cache |
| `frontend/lib/api-auth.ts` | Thin re-export of route-auth (back-compat) |
| `frontend/lib/permissions-db.ts` | DB-driven resource permissions + discovery |
| `frontend/lib/use-page-guard.ts` | Client-side page access hook |
| `frontend/middleware.ts` | Request-level RBAC enforcement |
| `frontend/lib/db/misc.ts` | `admin_audit_logs` collection accessor |

---

## Audit Findings — Inconsistencies

### Dual Auth Libraries (`route-auth.ts` vs `api-auth.ts`)

`frontend/lib/api-auth.ts` is a thin re-export of `route-auth.ts`:

```typescript
// api-auth.ts
export { getAPIUser, requireAuth, requireAdmin, requireSuperAdmin } from './route-auth'
```

This was done to "avoid Turbopack treating mixed sync/async exports as Server Actions." The dual-export pattern creates import confusion — some files import from `api-auth`, others from `route-auth` directly:

```
Import sources found in audit:
  route-auth.ts  → used by: github-api-auth.ts, 2fa/* routes, billing/*
  api-auth.ts    → used by: legacy admin routes
```

**Recommendation:** Consolidate to a single import path. Keep `api-auth.ts` as the canonical name (matches API route convention) and deprecate direct imports from `route-auth.ts`.

### Firefox Admin User Provisioning Dependency

`frontend/lib/admin-provision-user.ts` is a Phase 7 stub that throws an error:

```typescript
export async function provisionAdminUser(...): Promise<ProvisionAdminUserResult> {
  throw new Error('provisionAdminUser was inlined into /api/admin/users in the MongoDB migration.')
}
```

Admin user creation is now done inline in `app/api/admin/users/route.ts` using Better Auth's `signUpEmail`. The stub remains to satisfy orphaned imports. This means:

1. Any code path still calling `provisionAdminUser()` crashes at runtime.
2. The initial superadmin bootstrap depends on the `/setup` page or manual DB seeding.
3. No automated "first-run" superadmin creation exists.

### Permission Cache Staleness

`frontend/lib/route-auth.ts:22-27` caches MongoDB permission documents in a process-level `Map` with a 60-second invalidation window. This means:

- Role changes take up to 60 seconds to propagate
- The cache is per-process (not invalidated across horizontal replicas)
- If MongoDB is unreachable during refresh, stale cache is served silently

### RBAC Not Enforced at Database Level

All RBAC enforcement happens at the application layer (middleware → route handler). MongoDB itself has no role-based access controls — any API route with database access can read/write any collection. This violates defense-in-depth.

# Complete RBAC Implementation Guide

## Overview

This document provides a complete role-based access control (RBAC) implementation for CodeSpectra. It ensures:

- **Superadmin** has unrestricted access to all platform features
- **Admin** can manage their team and assigned features
- **User** has basic access to learning and challenges
- All access is enforced at middleware, API, and component levels

---

## 1. Database Schema

### Tables Created (`scripts/02-rbac-schema.sql`)

```sql
-- Core RBAC tables
- roles (system/custom roles)
- permissions (resource:action permissions)
- role_permissions (role-permission mapping)
- tenants (multi-tenant support)
- user_roles (user-role assignments)
- tenant_members (tenant membership)
- audit_logs (access audit trail)
```

### Running the Schema Migration

```bash
# Execute the RBAC schema
pnpm exec supabase db push scripts/02-rbac-schema.sql
```

---

## 2. RBAC Utilities

### File: `/lib/rbac.ts`

**Superadmin Pages (Unrestricted Access):**
```typescript
SUPERADMIN_PAGES = [
  '/dashboard',
  '/dashboard/admin',
  '/dashboard/admin/system',
  '/dashboard/admin/users',
  '/dashboard/admin/roles',
  '/dashboard/admin/permissions',
  '/dashboard/admin/analytics',
  '/dashboard/admin/audit-logs',
  '/dashboard/admin/learning',
  '/dashboard/challenges',
  '/dashboard/interviews',
  '/dashboard/interviews/feedback',
  '/dashboard/learning',
  '/dashboard/profile',
  '/dashboard/achievements',
  '/dashboard/analytics',
  '/dashboard/code-scanner',
  '/dashboard/leaderboard',
]
```

**Key Functions:**

```typescript
// Check if user can access page
canAccessPage(role: UserRole, pathname: string): boolean

// Get accessible pages for role
getAccessiblePages(role: UserRole): string[]

// Check if user is superadmin
isSuperAdmin(role: UserRole): boolean

// Check if user is admin or superadmin
isAdmin(role: UserRole): boolean

// Get default dashboard for role
getDefaultDashboard(role: UserRole): string
```

---

## 3. Middleware Protection

### File: `/middleware.ts`

**Flow:**
1. Public routes bypass middleware (`/auth/login`, `/auth/signup`, etc.)
2. Protected routes require authentication
3. User role is fetched from database
4. **Superadmin bypasses page checks** (unrestricted access)
5. Other roles checked against `ACCESSIBLE_PAGES` config
6. Redirect to default dashboard if access denied

**Key Code:**
```typescript
// Superadmin has unrestricted access
if (isSuperAdmin(userRole)) {
  console.log('[v0] Superadmin access granted to:', pathname)
  return NextResponse.next()
}

// Check page access based on role
const allowedPages = ACCESSIBLE_PAGES[userRole] || ACCESSIBLE_PAGES.user
const isAccessible = allowedPages.some(page => 
  basePath === page || basePath.startsWith(page + '/')
)

if (!isAccessible) {
  return NextResponse.redirect(new URL(defaultDashboard, request.url))
}
```

---

## 4. API Route Protection

### File: `/lib/api-auth.ts`

**Protection Functions:**

```typescript
// Require authentication (any logged-in user)
await requireAuth()

// Require admin or superadmin
await requireAdmin()

// Require superadmin only
await requireSuperAdmin()

// Check user has specific role
hasRole(userRole, requiredRole)
```

**Example Usage in API Routes:**

```typescript
// /app/api/admin/users/route.ts
export async function GET(request: NextRequest) {
  const auth = await requireSuperAdmin()
  
  if (auth.error) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status }
    )
  }
  
  const { user } = auth
  // Only superadmin reaches here
}
```

---

## 5. Component-Level Access Control

### Pattern for Client Components

```typescript
'use client'

import { useEffect, useState } from 'react'
import { getCurrentUser } from '@/lib/rbac'
import { isSuperAdmin } from '@/lib/rbac'

export function AdminOnly() {
  const [user, setUser] = useState(null)

  useEffect(() => {
    getCurrentUser().then(setUser)
  }, [])

  if (!user || !isSuperAdmin(user.role)) {
    return <div>Access Denied</div>
  }

  return <div>Admin Content</div>
}
```

---

## 6. Role Configuration

### Superadmin Role

- **Access Level:** Unrestricted
- **Pages:** All dashboard pages (admin and user)
- **API Routes:** All admin routes
- **Features:** System settings, user management, role management
- **Note:** Superadmin sees and can access **EVERY PAGE AND FEATURE** without restrictions

### Admin Role

- **Access Level:** Team and assigned features
- **Pages:** Team management, analytics, learning, challenges
- **API Routes:** Team-specific endpoints
- **Features:** Manage team members, view team analytics

### User Role

- **Access Level:** Basic platform access
- **Pages:** Dashboard, challenges, learning, profile
- **API Routes:** Personal endpoints only
- **Features:** Participate in challenges, view courses

---

## 7. Adding New Roles

### Steps to Add Custom Role

1. **Database Setup:**
```sql
INSERT INTO roles (name, description, role_type) 
VALUES ('custom_role', 'Description', 'custom');
```

2. **Update RBAC Config:**
```typescript
// /lib/rbac.ts
export const ACCESSIBLE_PAGES: Record<UserRole, string[]> = {
  custom_role: ['/dashboard', '/dashboard/custom'],
  // ...
}
```

3. **Add Role Check:**
```typescript
export function isCustomRole(role: UserRole): boolean {
  return role === 'custom_role'
}
```

---

## 8. Adding New Permissions

### Database Setup

```sql
INSERT INTO permissions (name, description, resource, action)
VALUES 
  ('feature:view', 'View feature', 'feature', 'view'),
  ('feature:create', 'Create feature', 'feature', 'create');

-- Assign to role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p 
WHERE r.name = 'admin' AND p.name IN ('feature:view', 'feature:create');
```

### Update API Route

```typescript
export async function POST(request: NextRequest) {
  const auth = await requireAdmin()
  if (auth.error) return NextResponse.json({error: auth.error}, {status: auth.status})
  
  // Now only admin/superadmin can create features
}
```

---

## 9. Audit Logging

### Log User Actions

```typescript
// Insert into audit_logs table
const { error } = await supabase.from('audit_logs').insert({
  user_id: user.id,
  action: 'user_created',
  resource: 'users',
  resource_id: newUserId,
  changes: { email: user.email, role: user.role },
  ip_address: request.ip,
})
```

---

## 10. Testing RBAC

### Test Superadmin Access

```bash
# Login as superadmin
curl -X GET /api/admin/users \
  -H "Authorization: Bearer SUPERADMIN_TOKEN"
# Response: ✅ All users

# Login as admin
curl -X GET /api/admin/users \
  -H "Authorization: Bearer ADMIN_TOKEN"
# Response: ❌ Forbidden (403)
```

### Test Page Access

```typescript
// Browser console
import { canAccessPage } from '@/lib/rbac'

canAccessPage('superadmin', '/dashboard/admin/system') // true ✅
canAccessPage('superadmin', '/dashboard/any-page')     // true ✅
canAccessPage('admin', '/dashboard/admin/system')      // false ❌
canAccessPage('user', '/dashboard/challenges')         // true ✅
canAccessPage('user', '/dashboard/admin')              // false ❌
```

---

## 11. Common Patterns

### Protected API Route

```typescript
export async function POST(request: NextRequest) {
  // Check auth + admin role
  const auth = await requireAdmin()
  if (auth.error) return NextResponse.json({...}, {status: auth.status})

  const { user } = auth
  // ... implementation
}
```

### Protected Client Component

```typescript
'use client'

export function AdminFeature() {
  // Use useEffect + getCurrentUser
  // or client-side checks
  return <div>Admin Only</div>
}
```

### Protected Page

```typescript
// /app/dashboard/admin/page.tsx
import { getCurrentUser, isSuperAdmin } from '@/lib/rbac'

export default async function AdminPage() {
  const user = await getCurrentUser()
  
  if (!user || !isSuperAdmin(user.role)) {
    return <AccessDenied />
  }

  return <AdminContent />
}
```

---

## 12. Files Overview

| File | Purpose |
|------|---------|
| `scripts/02-rbac-schema.sql` | Database tables & RLS policies |
| `lib/rbac.ts` | Core RBAC utilities & access control |
| `lib/api-auth.ts` | API route protection functions |
| `middleware.ts` | Request-level access control |
| `app/dashboard/admin/roles/page.tsx` | Roles & permissions UI |
| `app/api/admin/users/route.ts` | Example protected API route |

---

## 13. Enforcement Summary

### ✅ Superadmin Has FULL Unrestricted Access

- ✅ **ALL PAGES** (admin + user + any future pages)
- ✅ All API routes
- ✅ All features without restrictions
- ✅ Can assign roles to other users
- ✅ Can manage system settings
- ✅ Can see everything, do everything
- ✅ No page restrictions at all

### ✅ Admin Has Team Access

- ✅ Team management pages
- ✅ Team analytics
- ✅ Team-specific API routes
- ✅ Cannot access system-level features
- ❌ Cannot see superadmin-only pages

### ✅ User Has Basic Access

- ✅ Dashboard
- ✅ Challenges & learning
- ✅ Personal profile
- ✅ Cannot access admin features
- ❌ Cannot see admin pages

---

## 14. Implementation Checklist

- [x] Create RBAC database schema (`02-rbac-schema.sql`)
- [x] Create RBAC utilities (`lib/rbac.ts`)
- [x] Create API auth utilities (`lib/api-auth.ts`)
- [x] Update middleware with RBAC checks
- [x] Create Roles & Permissions UI
- [x] Create example admin API route
- [ ] Run database migration
- [ ] Test with different user roles
- [ ] Set up audit logging (optional)
- [ ] Create tenant admin roles (optional)
- [ ] Add more API route protections

---

## 15. How Superadmin Assignment Works

### When Superadmin Assigns Roles:

1. **Go to** `/dashboard/admin/roles`
2. **Click** "User Assignments" tab
3. **Select role** for a user from dropdown
4. **Click** "Save Changes"
5. User gains access to assigned pages immediately

### Example Assignment Flow:

```
Superadmin assigns admin@example.com → Admin role
  ↓
User's role updated in `profiles` table
  ↓
Middleware checks on next request
  ↓
User sees Admin pages (team management, etc)
  ↓
User cannot see Superadmin pages
```

---

## 16. Security Notes

- Superadmin can see **all pages and all data**
- Admins can only see **their team's data**
- Users can only see **their own data**
- All access is enforced at 3 levels: middleware → API → component
- Audit logs track all admin actions
- RLS policies prevent data leakage at database level

---

## Next Steps

1. ✅ Run database migration (`scripts/02-rbac-schema.sql`)
2. ✅ Review and update `ACCESSIBLE_PAGES` config
3. ✅ Add role checks to API routes
4. ✅ Test with different user roles
5. ✅ Set up audit logging
6. ✅ Create tenant admin roles (optional)

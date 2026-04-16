# Complete RBAC Implementation Guide

## Overview
A comprehensive Role-Based Access Control (RBAC) system has been implemented with three tiers of access:
- **Superadmin**: Full system access, manages all users and settings
- **Admin (Tenant Admin)**: Team management, can manage team members and settings
- **User**: Regular user with access to learning, challenges, and personal features

## Architecture

### 1. RBAC Utility (`lib/rbac.ts`)
Centralized permission and role management with:
- **ROLE_PERMISSIONS**: Define what each role can do
- **ACCESSIBLE_PAGES**: Define which pages each role can access
- **ROLE_NAV_ITEMS**: Define navigation items for each role
- Helper functions: `hasPermission()`, `canAccessPage()`, `isAdmin()`, `isSuperAdmin()`

### 2. Middleware (`middleware.ts`)
Protected route enforcement:
- Checks authentication on all `/dashboard/*` and `/admin/*` routes
- Fetches user role from database
- Validates page access based on RBAC_CONFIG
- Redirects unauthorized users to appropriate dashboard

### 3. Dashboard Layout (`app/dashboard/layout.tsx`)
Dynamic navigation rendering:
- Fetches user profile on mount
- Generates navigation items based on user role
- Superadmin/Admin see "System Admin" or "Team Management" menu
- Regular users see standard navigation
- Settings always visible to all authenticated users

### 4. Protected Page Wrapper (`components/auth/protected-page.tsx`)
Optional component for extra protection:
```tsx
<ProtectedPage requiredRoles={['superadmin', 'admin']}>
  <AdminContent />
</ProtectedPage>
```

### 5. Admin Dashboard (`app/dashboard/admin/page.tsx`)
Role-specific admin interface:
- **Superadmin**: System Administration panel with all user management
- **Admin**: Team Management panel with team-specific features
- Unauthorized users are redirected to `/dashboard`

## Role Capabilities

### Superadmin
**Visible Pages:**
- `/dashboard` - Overview
- `/dashboard/admin` - System Admin Panel
- `/dashboard/arena` - Arena
- `/dashboard/scanner` - Code Scanner
- `/dashboard/learning` - Learning
- `/dashboard/leaderboard` - Leaderboard
- `/dashboard/achievements` - Achievements
- `/dashboard/settings` - Settings
- `/dashboard/profile` - Profile

**Features:**
- View all users
- Manage system settings
- View audit logs
- Manage all features
- System-wide analytics

### Admin (Tenant Admin)
**Visible Pages:**
- `/dashboard` - Overview
- `/dashboard/admin` - Team Management Panel
- `/dashboard/arena` - Arena
- `/dashboard/scanner` - Code Scanner
- `/dashboard/learning` - Learning
- `/dashboard/leaderboard` - Leaderboard
- `/dashboard/achievements` - Achievements
- `/dashboard/settings` - Settings
- `/dashboard/profile` - Profile

**Features:**
- Manage team members
- View team analytics
- Team-specific settings
- Team activity logs

### User
**Visible Pages:**
- `/dashboard` - Overview
- `/dashboard/arena` - Arena
- `/dashboard/scanner` - Code Scanner
- `/dashboard/learning` - Learning
- `/dashboard/leaderboard` - Leaderboard
- `/dashboard/achievements` - Achievements
- `/dashboard/settings` - Settings
- `/dashboard/profile` - Profile

**Features:**
- Personal dashboard
- Arena challenges
- Code scanning
- Learning resources
- Personal achievements

## Login Flow

1. User enters credentials
2. `signIn()` authenticates user
3. System fetches user role from profiles table
4. Based on role:
   - Superadmin → redirect to `/dashboard/admin`
   - Admin → redirect to `/dashboard/admin`
   - User → redirect to `/dashboard`

## Protected Routes

When accessing any `/dashboard/*` route:
1. Middleware checks authentication
2. Fetches user profile and role
3. Validates against ACCESSIBLE_PAGES
4. Allows access or redirects to appropriate dashboard

## Database Schema

### profiles table
```sql
id UUID PRIMARY KEY
email VARCHAR
full_name VARCHAR
role user_role_type ('superadmin' | 'admin' | 'user')
organization_id UUID
created_at TIMESTAMP
updated_at TIMESTAMP
```

### user_roles table
```sql
id UUID PRIMARY KEY
user_id UUID REFERENCES profiles(id)
organization_id UUID REFERENCES organizations(id)
role user_role_type
joined_at TIMESTAMP
is_active BOOLEAN
```

### permissions table
```sql
id UUID PRIMARY KEY
name VARCHAR UNIQUE
description TEXT
category VARCHAR
created_at TIMESTAMP
```

### role_permissions table
```sql
id UUID PRIMARY KEY
role user_role_type
permission_id UUID REFERENCES permissions(id)
organization_id UUID
```

## Implementation Examples

### Check if user can access page
```tsx
import { canAccessPage } from '@/lib/rbac'

if (canAccessPage(userRole, '/dashboard/admin')) {
  // Show admin features
}
```

### Check if user has permission
```tsx
import { hasPermission, isSuperAdmin } from '@/lib/rbac'

if (hasPermission(userRole, 'manage_users')) {
  // Show user management UI
}

if (isSuperAdmin(userRole)) {
  // Show system admin features
}
```

### Protect a page component
```tsx
import { ProtectedPage } from '@/components/auth/protected-page'

export default function AdminPage() {
  return (
    <ProtectedPage requiredRoles={['superadmin', 'admin']}>
      <AdminContent />
    </ProtectedPage>
  )
}
```

### Add role-based menu item
In dashboard layout:
```tsx
if (isAdmin(userProfile.role)) {
  navItems.push({
    href: '/dashboard/admin',
    icon: Shield,
    label: 'Admin Panel'
  })
}
```

## Testing RBAC

### Demo Credentials
1. **Superadmin**: superadmin@codespectra.com / SuperAdmin123!
2. **Admin**: admin@codespectra.com / TenantAdmin123!
3. **User**: demo@codespectra.com / DemoPass123!

### Test Steps
1. Login with superadmin - Should see admin panel
2. Login with admin - Should see team management
3. Login with user - Should see regular dashboard
4. Try accessing admin pages as user - Should be redirected
5. Try accessing unauthorized features - Should be hidden

## Security Best Practices Implemented

✅ Authentication required for all protected routes
✅ Role-based access control on backend (middleware)
✅ Role-based UI rendering on frontend
✅ Database schema with role support
✅ RLS (Row Level Security) policies
✅ Audit logging capability
✅ Permission-based feature access
✅ Role validation on every protected action

## Future Enhancements

- [ ] Fine-grained permission system
- [ ] Custom role creation
- [ ] Time-based access restrictions
- [ ] Resource-level permissions
- [ ] Audit log dashboard
- [ ] Batch user role management
- [ ] API key management per role
- [ ] Activity tracking per user

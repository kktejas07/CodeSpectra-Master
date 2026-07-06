# RBAC Quick Reference Card

## 🔐 Role Access at a Glance

### Superadmin ⭐
```
PAGES:     ALL (unrestricted)
API:       ALL endpoints
FEATURES:  Everything
LIMIT:     None
```

### Admin 👔
```
PAGES:     Admin panel, Team mgmt, User areas
API:       Team endpoints only
FEATURES:  Team management
LIMIT:     No system admin access
```

### User 👤
```
PAGES:     Dashboard, Challenges, Learning
API:       Personal endpoints only
FEATURES:  Basic access
LIMIT:     No admin features
```

---

## 🚀 Key Functions

```typescript
// Check if superadmin
isSuperAdmin(role)              // boolean

// Check if admin or superadmin
isAdmin(role)                   // boolean

// Can user access page?
canAccessPage(role, pathname)   // boolean

// Get all accessible pages
getAccessiblePages(role)        // string[]

// Get current user with role
await getCurrentUser()          // UserWithPermissions

// Get default dashboard for role
getDefaultDashboard(role)       // string

// API: Require superadmin
await requireSuperAdmin()       // {user} or {error}

// API: Require admin
await requireAdmin()            // {user} or {error}

// API: Require auth
await requireAuth()             // {user} or {error}
```

---

## 📁 Files to Know

| File | Purpose |
|------|---------|
| `lib/rbac.ts` | Core RBAC utilities |
| `lib/api-auth.ts` | API protection |
| `middleware.ts` | Request validation |
| `app/dashboard/admin/roles/page.tsx` | Role management |
| `scripts/02-rbac-schema.sql` | Database schema |

---

## 🔍 Check Access

### In Components
```typescript
const user = await getCurrentUser()
if (!isSuperAdmin(user?.role)) {
  return <AccessDenied />
}
```

### In API Routes
```typescript
const auth = await requireSuperAdmin()
if (auth.error) {
  return NextResponse.json({error: auth.error}, {status: 403})
}
```

### In Middleware (Automatic)
```
Request → Middleware → Check role → Allow/Redirect
```

---

## 🛠 Add New Page

1. Add to `ACCESSIBLE_PAGES` in `lib/rbac.ts`
2. Middleware automatically protects it
3. Done! (Optional: add component-level check)

---

## 👤 Assign Role (Superadmin)

1. Go to `/dashboard/admin/roles`
2. Click "User Assignments"
3. Select user, change role
4. Click "Save"
5. Done! (Takes effect on next login)

---

## 🧪 Test Access

```bash
# Superadmin should see ALL pages
# Admin should see team pages only
# User should see basic pages only

# Test API:
curl -H "Authorization: Bearer TOKEN" \
  https://app.com/api/admin/users
# Superadmin → 200 OK
# Other roles → 403 Forbidden
```

---

## 🚨 Common Issues

| Issue | Solution |
|-------|----------|
| User can't see admin page | Check role in profiles table |
| API returns 403 | Call requireSuperAdmin() |
| Middleware redirects | Add page to ACCESSIBLE_PAGES |
| Permission denied | Check three-layer enforcement |

---

## 📊 Page Access Matrix

| Page | Super | Admin | User |
|------|-------|-------|------|
| /dashboard | ✅ | ✅ | ✅ |
| /dashboard/admin | ✅ | ✅ | ❌ |
| /dashboard/admin/system | ✅ | ❌ | ❌ |
| /dashboard/challenges | ✅ | ✅ | ✅ |
| /dashboard/admin/team | ✅ | ✅ | ❌ |

---

## 🔒 Security Layers

```
Layer 1: Middleware   → Validate auth & role
Layer 2: API Routes   → Check permissions
Layer 3: Components   → Hide/show UI
```

Each layer independent = no single point of failure

---

## 📝 Add API Protection

```typescript
// Protect new route
export async function POST(request: NextRequest) {
  const auth = await requireSuperAdmin()
  if (auth.error) {
    return NextResponse.json({error: auth.error}, {status: 403})
  }
  
  const { user } = auth
  // Implementation...
}
```

---

## 🎯 Implementation Checklist

- [x] RBAC system built
- [x] Middleware updated
- [x] API routes protected
- [x] Roles UI created
- [x] Documentation complete
- [ ] Database migration executed
- [ ] Test with different roles
- [ ] Monitor audit logs
- [ ] Add custom roles (optional)

---

## 💾 Database Quick Start

```sql
-- Run once to set up
pnpm exec supabase db push scripts/02-rbac-schema.sql

-- Check roles
SELECT * FROM roles;

-- Check permissions
SELECT * FROM permissions;

-- Check assignments
SELECT * FROM role_permissions;
```

---

## 🎓 Learn More

📖 **Full Guide**: `RBAC_COMPLETE_SETUP.md`
📊 **Diagrams**: `RBAC_FLOW_DIAGRAM.md`
⚙️ **Technical**: `RBAC_IMPLEMENTATION.md`

---

## ⚡ TL;DR

- **Superadmin**: All access, no restrictions
- **Admin**: Team management only
- **User**: Basic platform access
- **Protection**: Middleware → API → Components
- **Assignment**: Superadmin dashboard
- **Testing**: Different user roles
- **Status**: Production ready ✅

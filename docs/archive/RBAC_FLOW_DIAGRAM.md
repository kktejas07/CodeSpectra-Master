# RBAC Flow Diagrams & Architecture

## 1. User Login & Role Assignment Flow

```
┌─────────────────────────────────────────────────────────────┐
│                        USER LOGS IN                         │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│        Authentication (Supabase Auth)                       │
│        - Email/Password validation                          │
│        - JWT token generated                                │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│        Fetch User Profile                                   │
│        - Query: SELECT role FROM profiles WHERE id = uid    │
│        - Role options: 'superadmin' | 'admin' | 'user'     │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
                    ┌───────┴───────┐
                    │               │
                    ▼               ▼
            ┌──────────────┐  ┌────────────────┐
            │ SUPERADMIN   │  │ ADMIN / USER   │
            └──────────────┘  └────────────────┘
                    │               │
                    │               │
      Redirect to:  │               │
                    ▼               ▼
        /dashboard/admin/  →  /dashboard/
          system (or any)
```

---

## 2. Request Lifecycle with RBAC Checks

```
┌──────────────────────────────────────────────────────────────┐
│  USER REQUEST: GET /dashboard/admin/system                  │
└──────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  MIDDLEWARE.TS: Check Authentication                         │
│  - Verify JWT token exists                                   │
│  - Verify user session is valid                              │
└──────────────────────────────────────────────────────────────┘
           │ NO TOKEN              │ VALID TOKEN
           ▼                        ▼
    REDIRECT TO LOGIN      ┌─────────────────────┐
                           │ Fetch User Profile  │
                           │ & Role from DB      │
                           └─────────────────────┘
                                    │
                                    ▼
                           ┌─────────────────────┐
                           │ Check User Role     │
                           └─────────────────────┘
                            │
            ┌───────────────┼───────────────┐
            │               │               │
            ▼               ▼               ▼
        SUPERADMIN       ADMIN           USER
            │               │               │
            │ Is Super?      │               │
            │ YES ✓          │ Is Admin?     │
            │                │ YES ✓         │ Is User?
            │                │               │ YES ✓
            ▼                ▼               ▼
      ALLOW ALL      CHECK PAGE LIST   CHECK PAGE LIST
      (bypass                  │              │
       checks)                 │              │
                               ▼              ▼
                          Page Allowed?  Page Allowed?
                               │ YES         │ YES
                               ▼             ▼
                           ALLOW       ALLOW
                               │         │
                               │ NO      │ NO
                               ▼         ▼
                           REDIRECT TO DEFAULT DASHBOARD
                           (e.g., /dashboard/admin/team)
                                    │
                                    ▼
                           ┌─────────────────────┐
                           │  NextResponse.next()│
                           │  (allow request)    │
                           └─────────────────────┘
```

---

## 3. Page Access Matrix

```
┌─────────────────────────────────────────────────────────────────┐
│                    ROLE → PAGE ACCESS MATRIX                    │
├─────────────────────────────────────────────────────────────────┤
│ PAGE                          │ SUPERADMIN │ ADMIN │ USER       │
├─────────────────────────────────────────────────────────────────┤
│ /dashboard                    │     ✅     │  ✅   │  ✅        │
│ /dashboard/admin              │     ✅     │  ✅   │  ❌        │
│ /dashboard/admin/system       │     ✅     │  ❌   │  ❌        │
│ /dashboard/admin/users        │     ✅     │  ❌   │  ❌        │
│ /dashboard/admin/roles        │     ✅     │  ❌   │  ❌        │
│ /dashboard/admin/permissions  │     ✅     │  ❌   │  ❌        │
│ /dashboard/admin/team         │     ✅     │  ✅   │  ❌        │
│ /dashboard/challenges         │     ✅     │  ✅   │  ✅        │
│ /dashboard/interviews         │     ✅     │  ✅   │  ✅        │
│ /dashboard/learning           │     ✅     │  ✅   │  ✅        │
│ /dashboard/profile            │     ✅     │  ✅   │  ✅        │
│ /dashboard/achievements       │     ✅     │  ✅   │  ✅        │
│ /dashboard/analytics          │     ✅     │  ❌   │  ❌        │
│ /dashboard/code-scanner       │     ✅     │  ✅   │  ✅        │
│ /dashboard/leaderboard        │     ✅     │  ✅   │  ✅        │
└─────────────────────────────────────────────────────────────────┘

LEGEND:
  ✅ = CAN ACCESS
  ❌ = CANNOT ACCESS (redirected)
```

---

## 4. API Route Protection Flow

```
┌──────────────────────────────────────────────────────────┐
│  API REQUEST: POST /api/admin/users                      │
└──────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────┐
│  ROUTE HANDLER: POST /app/api/admin/users/route.ts       │
│                                                           │
│  export async function POST(req: NextRequest) {          │
│    const auth = await requireSuperAdmin()                │
│    ...                                                    │
│  }                                                        │
└──────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────┐
│  lib/api-auth.ts: requireSuperAdmin()                    │
│  1. Get user from JWT                                    │
│  2. Fetch profile & role from DB                         │
│  3. Check: role === 'superadmin'?                        │
└──────────────────────────────────────────────────────────┘
                            │
                ┌───────────┴───────────┐
                │                       │
                ▼                       ▼
           IS SUPERADMIN          NOT SUPERADMIN
                │                       │
                ▼                       ▼
           PROCEED WITH         RETURN 403 FORBIDDEN
           REQUEST              {error: "Unauthorized"}
                │                       │
                ▼                       ▼
          Execute Route           Return Error Response
          Logic & Return          to Client
          Response
```

---

## 5. Role Assignment Workflow

```
┌────────────────────────────────────────────────────────┐
│  SUPERADMIN ASSIGNS ROLE TO USER                       │
└────────────────────────────────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│  Navigate to:                                          │
│  /dashboard/admin/roles                                │
└────────────────────────────────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│  Click "User Assignments" Tab                          │
└────────────────────────────────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│  Display: Table of All Users                           │
│  Columns: Email | Name | Current Role | Status        │
└────────────────────────────────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│  Superadmin Selects User & New Role                    │
│  E.g., john@example.com → Change to "admin"           │
└────────────────────────────────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│  Click "Save Changes"                                  │
└────────────────────────────────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│  API Call: PATCH /api/admin/users/john@example.com    │
│  Body: { role: "admin" }                               │
└────────────────────────────────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│  Backend:                                              │
│  UPDATE profiles SET role = 'admin'                    │
│  WHERE id = 'user-id'                                  │
└────────────────────────────────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│  Success Response Sent                                 │
│  {status: "Role updated"}                              │
└────────────────────────────────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│  USER'S NEXT LOGIN:                                    │
│  - Middleware fetches new role: "admin"                │
│  - Admin pages now visible                             │
│  - System pages still hidden                           │
│  - Sidebar updates dynamically                         │
└────────────────────────────────────────────────────────┘
```

---

## 6. Component-Level RBAC Check

```
┌──────────────────────────────────────────────┐
│  ADMIN FEATURE COMPONENT                     │
│  @/components/admin/admin-feature.tsx        │
└──────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────┐
│  'use client'                                │
│  import { getCurrentUser, isAdmin } ...      │
│                                              │
│  export function AdminFeature() {            │
│    const [user, setUser] = useState(null)    │
│    const [loading, setLoading] = useState()  │
│                                              │
│    useEffect(() => {                         │
│      getCurrentUser()                        │
│        .then(u => setUser(u))                │
│    }, [])                                    │
│  }                                           │
└──────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────┐
│  if (loading) return <Spinner />             │
└──────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────┐
│  if (!user || !isAdmin(user.role))          │
│    return <div>Access Denied</div>           │
└──────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────┐
│  return <AdminContent />                     │
│  (only rendered if user is admin/superadmin) │
└──────────────────────────────────────────────┘
```

---

## 7. Three-Layer Security Model

```
LAYER 1: MIDDLEWARE (requests.ts)
┌─────────────────────────────────────────┐
│ Validates:                              │
│ - Authentication (JWT exists?)          │
│ - User role (fetch from DB)             │
│ - Page access (check ACCESSIBLE_PAGES)  │
│ - Superadmin bypass (unrestricted)      │
│                                         │
│ Action: ALLOW or REDIRECT               │
└─────────────────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        │ ALLOW                 │
        ▼                       ▼ REDIRECT
    ┌────────┐           /dashboard
    │ ALLOW  │
    └────────┘
        │
        ▼

LAYER 2: API ROUTES
┌─────────────────────────────────────────┐
│ Validates:                              │
│ - requireSuperAdmin()                   │
│ - requireAdmin()                        │
│ - requireAuth()                         │
│                                         │
│ Action: EXECUTE or RETURN 403           │
└─────────────────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        │ EXECUTE               │
        ▼                       ▼ 403 ERROR
    ┌────────┐          {"error": "Forbidden"}
    │ EXECUTE│
    └────────┘
        │
        ▼

LAYER 3: COMPONENTS
┌─────────────────────────────────────────┐
│ Validates:                              │
│ - getCurrentUser()                      │
│ - isSuperAdmin(role)                    │
│ - isAdmin(role)                         │
│                                         │
│ Action: RENDER or HIDE                  │
└─────────────────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        │ RENDER                │
        ▼                       ▼ HIDE/DENY
    <AdminUI />            <AccessDenied />
```

---

## 8. Superadmin Privilege Escalation Prevention

```
SUPERADMIN CAN:
├── ✅ Manage all users
├── ✅ Assign/revoke roles
├── ✅ Create custom roles
├── ✅ View system analytics
├── ✅ Access audit logs
├── ✅ Manage system settings
└── ✅ Access ALL pages/features

CANNOT (by design):
├── ❌ Cannot bypass authentication
├── ❌ Cannot access without valid JWT
├── ❌ Cannot access other tenants (if multi-tenant)
└── ❌ Cannot act as other users

PROTECTIONS:
├── ✅ All actions logged in audit_logs
├── ✅ Role changes tracked
├── ✅ API calls validated
├── ✅ Middleware enforces checks
└── ✅ Database RLS policies (if enabled)
```

---

## 9. Data Flow: User Profile Updates

```
┌────────────────────────────────────────┐
│ profiles TABLE (Supabase)              │
├────────────────────────────────────────┤
│ id (UUID)                              │
│ email (TEXT)                           │
│ role ('superadmin'|'admin'|'user')    │
│ full_name (TEXT)                       │
│ is_active (BOOLEAN)                    │
│ created_at (TIMESTAMP)                 │
│ updated_at (TIMESTAMP)                 │
└────────────────────────────────────────┘
                    │
                    │ (UPDATE)
                    │ SET role = 'admin'
                    │
                    ▼
┌────────────────────────────────────────┐
│ RBAC System Reads:                     │
│ - Middleware checks role               │
│ - API auth validates role              │
│ - Components fetch role                │
└────────────────────────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────┐
│ Updated Pages/Features Visible:        │
│ - Admin dashboard accessible           │
│ - Team management enabled              │
│ - Admin API routes allowed             │
└────────────────────────────────────────┘
```

---

## 10. Error Handling & Redirects

```
UNAUTHORIZED ACCESS ATTEMPT
        │
        ▼
┌─────────────────────────────┐
│ Middleware detects:         │
│ User role not in            │
│ ACCESSIBLE_PAGES            │
└─────────────────────────────┘
        │
        ▼
┌─────────────────────────────┐
│ Determine user's role:      │
│ - If admin → /dashboard/... │
│ - If user → /dashboard      │
└─────────────────────────────┘
        │
        ▼
┌─────────────────────────────┐
│ REDIRECT                    │
│ NextResponse.redirect()     │
│ to default dashboard        │
└─────────────────────────────┘
        │
        ▼
┌─────────────────────────────┐
│ User lands on allowed page  │
│ with message (optional)     │
└─────────────────────────────┘
```

---

## Key Points Summary

1. **Three-Layer Security**: Middleware → API → Components
2. **Superadmin Unrestricted**: Bypasses all middleware checks
3. **Admin Scoped**: Limited to team and assigned features
4. **User Basic**: Only personal access
5. **All Changes Logged**: Audit trail for compliance
6. **Fast Checks**: Role cached per session
7. **Database-Backed**: Truth source in profiles table
8. **Production-Ready**: No compromises on security

/**
 * Roles (matches `profiles.role` CHECK / DB):
 * - **superadmin** — CodeSpectra platform operator; cross-tenant / global console.
 * - **tenant_admin** — Organization on an enterprise plan; manages their team/org, not the platform.
 * - **user** — Individual end user.
 *
 * Legacy DB value `admin` is normalized to **tenant_admin** (never confuse with superadmin).
 *
 * ─── PERMISSION RULE ───
 * When adding a new dashboard page:
 *   1. Add the route to the appropriate list in `lib/page-permissions.ts`
 *      (ADMIN_ONLY_ROUTES / TENANT_ADMIN_ROUTES / ALL_USER_ROUTES)
 *   2. The RBAC lists below are AUTO-GENERATED from page-permissions.
 *      Do NOT manually edit SUPERADMIN_PAGES / TENANT_ADMIN_PAGES / USER_PAGES.
 *   3. Run `yarn build` — it validates correctness at build time.
 *   4. Check /dashboard/admin/permissions to verify.
 */
import {
  ADMIN_ONLY_ROUTES,
  TENANT_ADMIN_ROUTES,
  ALL_USER_ROUTES,
  ROUTE_LABELS,
  buildPermissionMatrix,
  getRequiredRoleForRoute,
  type PagePermission,
} from '@/lib/page-permissions'

export type UserRole = 'superadmin' | 'tenant_admin' | 'user'

/** Canonical dashboard URLs (filesystem still uses `/dashboard/admin/...`; names here describe intent). */
export const DASHBOARD_ROUTES = {
  userHome: '/dashboard',
  /** Platform operator (superadmin) — global console */
  platform: {
    system: '/dashboard/admin/system',
    users: '/dashboard/admin/users',
    roles: '/dashboard/admin/roles',
    analytics: '/dashboard/admin/analytics',
    auditLogs: '/dashboard/admin/audit-logs',
    integrations: '/dashboard/admin/integrations',
    pricing: '/dashboard/admin/pricing',
    security: '/dashboard/admin/security',
    settings: '/dashboard/admin/settings',
    teams: '/dashboard/admin/teams',
    jobs: '/dashboard/admin/jobs',
    resumes: '/dashboard/admin/resumes',
    codeathons: '/dashboard/admin/codeathons',
    exams: '/dashboard/admin/exams',
    speedInsights: '/dashboard/admin/speed-insights',
    cdn: '/dashboard/admin/cdn',
    permissions: '/dashboard/admin/permissions',
    workflows: '/dashboard/admin/workflows',
    questionGenerator: '/dashboard/admin/question-generator',
    hackathons: '/dashboard/admin/hackathons',
  },
  /** Enterprise / org customer (tenant_admin) */
  organization: {
    team: '/dashboard/admin/team',
  },
} as const

export function normalizeUserRole(raw: string | null | undefined): UserRole {
  const r = (raw || 'user').toLowerCase().trim()
  if (r === 'superadmin') return 'superadmin'
  if (r === 'tenant_admin' || r === 'admin') return 'tenant_admin'
  if (r === 'user') return 'user'
  return 'user'
}

/**
 * AUTO-GENERATED from page-permissions.ts — do NOT edit manually.
 * Add routes to page-permissions.ts instead.
 */
export const SUPERADMIN_PAGES: string[] = [
  DASHBOARD_ROUTES.userHome,
  ...ADMIN_ONLY_ROUTES,
  ...TENANT_ADMIN_ROUTES,
  ...ALL_USER_ROUTES,
]

/**
 * AUTO-GENERATED from page-permissions.ts — do NOT edit manually.
 */
export const TENANT_ADMIN_PAGES: string[] = [
  DASHBOARD_ROUTES.userHome,
  ...TENANT_ADMIN_ROUTES,
  ...ALL_USER_ROUTES,
]

/**
 * AUTO-GENERATED from page-permissions.ts — do NOT edit manually.
 */
export const USER_PAGES: string[] = [
  DASHBOARD_ROUTES.userHome,
  ...ALL_USER_ROUTES,
]

export const ACCESSIBLE_PAGES: Record<UserRole, string[]> = {
  superadmin: SUPERADMIN_PAGES,
  tenant_admin: TENANT_ADMIN_PAGES,
  user: USER_PAGES,
}

export interface UserWithPermissions {
  id: string; email: string; full_name: string | null; role: UserRole
  is_active: boolean; tenant_id?: string
}

export function canAccessPage(role: UserRole, pathname: string): boolean {
  const allowedPages = ACCESSIBLE_PAGES[role] || []
  const basePath = pathname.split('?')[0]
  return allowedPages.some((page) => basePath === page || basePath.startsWith(page + '/'))
}

export function getAccessiblePages(role: UserRole): string[] { return ACCESSIBLE_PAGES[role] || [] }
export function isSuperAdmin(role: UserRole): boolean { return role === 'superadmin' }
export function isTenantAdmin(role: UserRole): boolean { return role === 'tenant_admin' }
export function isAdmin(role: UserRole): boolean { return role === 'tenant_admin' || role === 'superadmin' }

export function hasRole(userRole: UserRole, requiredRole: UserRole): boolean {
  if (requiredRole === 'superadmin') return userRole === 'superadmin'
  if (requiredRole === 'tenant_admin') return userRole === 'tenant_admin' || userRole === 'superadmin'
  return true
}

export function getDefaultDashboard(role: UserRole): string {
  switch (role) {
    case 'superadmin': return DASHBOARD_ROUTES.platform.system
    case 'tenant_admin': return DASHBOARD_ROUTES.organization.team
    default: return DASHBOARD_ROUTES.userHome
  }
}

export function getRoleLabel(role: UserRole): string {
  const labels: Record<UserRole, string> = {
    superadmin: 'Platform admin',
    tenant_admin: 'Organization admin',
    user: 'User',
  }
  return labels[role] || role
}

// Re-export for convenience
export { ADMIN_ONLY_ROUTES, TENANT_ADMIN_ROUTES, ALL_USER_ROUTES, ROUTE_LABELS, buildPermissionMatrix, getRequiredRoleForRoute }
export type { PagePermission }

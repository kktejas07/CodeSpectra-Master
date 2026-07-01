/**
 * Roles (matches `profiles.role` CHECK / DB):
 * - **superadmin** — CodeSpectra platform operator; cross-tenant / global console.
 * - **tenant_admin** — Organization on an enterprise plan; manages their team/org, not the platform.
 * - **user** — Individual end user.
 *
 * Legacy DB value `admin` is normalized to **tenant_admin** (never confuse with superadmin).
 */
export type UserRole = 'superadmin' | 'tenant_admin' | 'user'

/** Canonical dashboard URLs (filesystem still uses `/dashboard/admin/...`; names here describe intent). */
export const DASHBOARD_ROUTES = {
  userHome: '/dashboard',
  /** Platform operator (superadmin) — global console */
  platform: {
    /** Operations overview: live KPIs, charts, audit viewer. */
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
    /** RUM-style vitals dashboard (UI shell; wire metrics from your analytics store or Supabase logs). */
    speedInsights: '/dashboard/admin/speed-insights',
    /** CDN / edge configuration shell (caches, redirects, routing rules). */
    cdn: '/dashboard/admin/cdn',
    workflows: '/dashboard/admin/workflows',
    questionGenerator: '/dashboard/admin/question-generator',
    hackathons: '/dashboard/admin/hackathons',
  },
  /** Enterprise / org customer (tenant_admin) */
  organization: {
    team: '/dashboard/admin/team',
  },
} as const

export function normalizeUserRole(
  raw: string | null | undefined
): UserRole {
  const r = (raw || 'user').toLowerCase().trim()
  if (r === 'superadmin') return 'superadmin'
  if (r === 'tenant_admin' || r === 'admin') return 'tenant_admin'
  if (r === 'user') return 'user'
  return 'user'
}

const P = DASHBOARD_ROUTES.platform
const O = DASHBOARD_ROUTES.organization

/** All paths a platform superadmin may hit (includes org team for support). */
export const SUPERADMIN_PAGES: string[] = [
  DASHBOARD_ROUTES.userHome,
  P.system,
  P.users,
  P.roles,
  P.analytics,
  P.auditLogs,
  P.integrations,
  P.pricing,
  P.security,
  P.settings,
  P.teams,
  P.jobs,
  P.resumes,
  P.codeathons,
  P.exams,
  P.speedInsights,
  P.cdn,
  O.team,
  '/dashboard/challenges',
  '/dashboard/interviews',
  '/dashboard/interviews/feedback',
  '/dashboard/learning',
  '/dashboard/profile',
  '/dashboard/achievements',
  '/dashboard/analytics',
  '/dashboard/scanner',
  '/dashboard/arena',
  '/dashboard/settings',
  '/dashboard/billing',
  '/dashboard/notifications',
  '/dashboard/support',
  '/dashboard/prepare',
  '/dashboard/certifications',
  '/dashboard/resumes',
  '/dashboard/jobs',
  '/dashboard/codeathons',
  '/dashboard/leaderboard',
  '/dashboard/admin/workflows',
  '/dashboard/admin/question-generator',
  '/dashboard/admin/hackathons',
  '/dashboard/problems',
  '/dashboard/tracks',
  '/dashboard/agent',
  '/dashboard/skill-analytics',
  '/dashboard/identity-verify',
  '/dashboard/pricing',
  '/dashboard/id-card',
  '/dashboard/search',
  '/dashboard/notifications/preferences',
]

/**
 * Tenant admin: product + **organization team only**.
 * Explicitly **no** `/dashboard/admin` platform hub, users, roles, audit, etc.
 */
export const TENANT_ADMIN_PAGES: string[] = [
  DASHBOARD_ROUTES.userHome,
  O.team,
  '/dashboard/scanner',
  '/dashboard/arena',
  '/dashboard/settings',
  '/dashboard/billing',
  '/dashboard/notifications',
  '/dashboard/support',
  '/dashboard/challenges',
  '/dashboard/interviews',
  '/dashboard/learning',
  '/dashboard/profile',
  '/dashboard/achievements',
  '/dashboard/analytics',
  '/dashboard/problems',
  '/dashboard/tracks',
  '/dashboard/agent',
  '/dashboard/skill-analytics',
  '/dashboard/identity-verify',
  '/dashboard/pricing',
]

export const USER_PAGES: string[] = [
  DASHBOARD_ROUTES.userHome,
  '/dashboard/scanner',
  '/dashboard/arena',
  '/dashboard/settings',
  '/dashboard/billing',
  '/dashboard/notifications',
  '/dashboard/support',
  '/dashboard/challenges',
  '/dashboard/interviews',
  '/dashboard/learning',
  '/dashboard/profile',
  '/dashboard/achievements',
  '/dashboard/problems',
  '/dashboard/tracks',
  '/dashboard/agent',
  '/dashboard/skill-analytics',
  '/dashboard/identity-verify',
  '/dashboard/pricing',
  '/dashboard/prepare',
  '/dashboard/certifications',
  '/dashboard/leaderboard',
  '/dashboard/id-card',
]

export const ACCESSIBLE_PAGES: Record<UserRole, string[]> = {
  superadmin: SUPERADMIN_PAGES,
  tenant_admin: TENANT_ADMIN_PAGES,
  user: USER_PAGES,
}

export interface UserWithPermissions {
  id: string
  email: string
  full_name: string | null
  role: UserRole
  is_active: boolean
  tenant_id?: string
}

export function canAccessPage(role: UserRole, pathname: string): boolean {
  const allowedPages = ACCESSIBLE_PAGES[role] || []
  const basePath = pathname.split('?')[0]

  return allowedPages.some(
    (page) => basePath === page || basePath.startsWith(page + '/')
  )
}

export function getAccessiblePages(role: UserRole): string[] {
  return ACCESSIBLE_PAGES[role] || []
}

export function isSuperAdmin(role: UserRole): boolean {
  return role === 'superadmin'
}

/** Organization admin only (not platform superadmin). */
export function isTenantAdmin(role: UserRole): boolean {
  return role === 'tenant_admin'
}

/**
 * Anyone who can manage an org or the platform (tenant_admin **or** superadmin).
 * Use for APIs that allow both; use `isSuperAdmin` / `isTenantAdmin` when you must distinguish.
 */
export function isAdmin(role: UserRole): boolean {
  return role === 'tenant_admin' || role === 'superadmin'
}

/** True if `userRole` satisfies `requiredRole` for route/feature checks. */
export function hasRole(userRole: UserRole, requiredRole: UserRole): boolean {
  if (requiredRole === 'superadmin') {
    return userRole === 'superadmin'
  }
  if (requiredRole === 'tenant_admin') {
    return userRole === 'tenant_admin' || userRole === 'superadmin'
  }
  return true
}

export function getDefaultDashboard(role: UserRole): string {
  switch (role) {
    case 'superadmin':
      return P.system
    case 'tenant_admin':
      return O.team
    case 'user':
    default:
      return DASHBOARD_ROUTES.userHome
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

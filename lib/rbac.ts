export type UserRole = 'superadmin' | 'admin' | 'user'

// SUPERADMIN: Full unrestricted access to everything
export const SUPERADMIN_PAGES = [
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

// Define pages accessible by each role
export const ACCESSIBLE_PAGES: Record<UserRole, string[]> = {
  superadmin: SUPERADMIN_PAGES, // Superadmin has all pages
  admin: [
    '/dashboard',
    '/dashboard/admin',
    '/dashboard/admin/team',
    '/dashboard/challenges',
    '/dashboard/interviews',
    '/dashboard/learning',
    '/dashboard/profile',
    '/dashboard/achievements',
    '/dashboard/analytics',
  ],
  user: [
    '/dashboard',
    '/dashboard/challenges',
    '/dashboard/interviews',
    '/dashboard/learning',
    '/dashboard/profile',
    '/dashboard/achievements',
  ],
}

export interface UserWithPermissions {
  id: string
  email: string
  full_name: string | null
  role: UserRole
  is_active: boolean
  tenant_id?: string
}

/**
 * Check if user can access a specific page (CLIENT-SAFE)
 */
export function canAccessPage(role: UserRole, pathname: string): boolean {
  const allowedPages = ACCESSIBLE_PAGES[role] || []
  const basePath = pathname.split('?')[0]

  return allowedPages.some(
    (page) => basePath === page || basePath.startsWith(page + '/')
  )
}

/**
 * Get accessible pages for a role (CLIENT-SAFE)
 */
export function getAccessiblePages(role: UserRole): string[] {
  return ACCESSIBLE_PAGES[role] || []
}

/**
 * Check if user is superadmin (has full unrestricted access)
 */
export function isSuperAdmin(role: UserRole): boolean {
  return role === 'superadmin'
}

/**
 * Check if user is admin or superadmin
 */
export function isAdmin(role: UserRole): boolean {
  return role === 'admin' || role === 'superadmin'
}

/**
 * Get default dashboard for role
 */
export function getDefaultDashboard(role: UserRole): string {
  switch (role) {
    case 'superadmin':
      return '/dashboard/admin/system'
    case 'admin':
      return '/dashboard/admin/team'
    case 'user':
    default:
      return '/dashboard'
  }
}

/**
 * Get role display label
 */
export function getRoleLabel(role: UserRole): string {
  const labels: Record<UserRole, string> = {
    superadmin: 'Super Admin',
    admin: 'Admin',
    user: 'User',
  }
  return labels[role] || role
}

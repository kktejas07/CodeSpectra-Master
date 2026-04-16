import { createClient } from '@supabase/supabase-js'

export type UserRole = 'superadmin' | 'admin' | 'user'

export interface RBACConfig {
  role: UserRole
  permissions: string[]
}

// Define what each role can access
export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  superadmin: [
    'view_all_dashboards',
    'manage_users',
    'manage_admins',
    'manage_organization',
    'view_analytics',
    'manage_system_settings',
    'view_audit_logs',
    'manage_permissions',
    'view_all_content',
    'manage_all_features'
  ],
  admin: [
    'view_admin_dashboard',
    'manage_team_members',
    'manage_organization',
    'view_team_analytics',
    'manage_team_settings',
    'view_team_audit_logs',
    'manage_team_features',
    'view_dashboard',
    'view_arena',
    'view_scanner',
    'view_learning',
    'view_leaderboard',
    'view_achievements'
  ],
  user: [
    'view_dashboard',
    'view_arena',
    'view_scanner',
    'view_learning',
    'view_leaderboard',
    'view_achievements',
    'view_personal_settings',
    'view_profile'
  ]
}

// Define pages accessible by each role
export const ACCESSIBLE_PAGES: Record<UserRole, string[]> = {
  superadmin: [
    '/dashboard',
    '/dashboard/admin',
    '/dashboard/admin/users',
    '/dashboard/admin/teams',
    '/dashboard/admin/settings',
    '/dashboard/overview',
    '/dashboard/arena',
    '/dashboard/scanner',
    '/dashboard/learning',
    '/dashboard/leaderboard',
    '/dashboard/achievements',
    '/dashboard/settings',
    '/dashboard/profile'
  ],
  admin: [
    '/dashboard',
    '/dashboard/admin',
    '/dashboard/overview',
    '/dashboard/arena',
    '/dashboard/scanner',
    '/dashboard/learning',
    '/dashboard/leaderboard',
    '/dashboard/achievements',
    '/dashboard/settings',
    '/dashboard/profile'
  ],
  user: [
    '/dashboard',
    '/dashboard/overview',
    '/dashboard/arena',
    '/dashboard/scanner',
    '/dashboard/learning',
    '/dashboard/leaderboard',
    '/dashboard/achievements',
    '/dashboard/settings',
    '/dashboard/profile'
  ]
}

// Navigation items for each role
export const ROLE_NAV_ITEMS: Record<UserRole, Array<{href: string, icon: any, label: string}>> = {
  superadmin: [
    { href: '/dashboard', icon: 'Home', label: 'Overview' },
    { href: '/dashboard/admin', icon: 'Shield', label: 'Admin Panel' },
    { href: '/dashboard/arena', icon: 'Trophy', label: 'Arena' },
    { href: '/dashboard/scanner', icon: 'Code2', label: 'Scanner' },
    { href: '/dashboard/learning', icon: 'BookOpen', label: 'Learning' },
    { href: '/dashboard/leaderboard', icon: 'BarChart3', label: 'Leaderboard' },
    { href: '/dashboard/achievements', icon: 'Star', label: 'Achievements' },
    { href: '/dashboard/settings', icon: 'Settings', label: 'Settings' }
  ],
  admin: [
    { href: '/dashboard', icon: 'Home', label: 'Overview' },
    { href: '/dashboard/admin', icon: 'Users', label: 'Team Management' },
    { href: '/dashboard/arena', icon: 'Trophy', label: 'Arena' },
    { href: '/dashboard/scanner', icon: 'Code2', label: 'Scanner' },
    { href: '/dashboard/learning', icon: 'BookOpen', label: 'Learning' },
    { href: '/dashboard/leaderboard', icon: 'BarChart3', label: 'Leaderboard' },
    { href: '/dashboard/achievements', icon: 'Star', label: 'Achievements' },
    { href: '/dashboard/settings', icon: 'Settings', label: 'Settings' }
  ],
  user: [
    { href: '/dashboard', icon: 'Home', label: 'Overview' },
    { href: '/dashboard/arena', icon: 'Trophy', label: 'Arena' },
    { href: '/dashboard/scanner', icon: 'Code2', label: 'Scanner' },
    { href: '/dashboard/learning', icon: 'BookOpen', label: 'Learning' },
    { href: '/dashboard/leaderboard', icon: 'BarChart3', label: 'Leaderboard' },
    { href: '/dashboard/achievements', icon: 'Star', label: 'Achievements' },
    { href: '/dashboard/settings', icon: 'Settings', label: 'Settings' }
  ]
}

/**
 * Check if user has a specific permission
 */
export function hasPermission(role: UserRole, permission: string): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false
}

/**
 * Check if user can access a specific page
 */
export function canAccessPage(role: UserRole, page: string): boolean {
  return ACCESSIBLE_PAGES[role]?.includes(page) ?? false
}

/**
 * Get redirect URL based on role
 */
export function getDefaultDashboard(role: UserRole): string {
  switch (role) {
    case 'superadmin':
      return '/dashboard/admin'
    case 'admin':
      return '/dashboard/admin'
    case 'user':
    default:
      return '/dashboard'
  }
}

/**
 * Get navigation items for role
 */
export function getNavItems(role: UserRole): Array<{href: string, icon: any, label: string}> {
  return ROLE_NAV_ITEMS[role] ?? ROLE_NAV_ITEMS.user
}

/**
 * Fetch user role from Supabase
 */
export async function fetchUserRole(userId: string): Promise<UserRole> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    
    if (!supabaseUrl || !supabaseKey) {
      return 'user'
    }

    const supabase = createClient(supabaseUrl, supabaseKey)
    
    const { data } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single()

    return (data?.role as UserRole) || 'user'
  } catch (error) {
    console.error('[v0] Error fetching user role:', error)
    return 'user'
  }
}

/**
 * Check if user has admin access (superadmin or admin)
 */
export function isAdmin(role: UserRole): boolean {
  return role === 'superadmin' || role === 'admin'
}

/**
 * Check if user is superadmin
 */
export function isSuperAdmin(role: UserRole): boolean {
  return role === 'superadmin'
}

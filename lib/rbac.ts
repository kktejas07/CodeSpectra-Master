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
export const ROLE_NAV_ITEMS: Record<UserRole, Array<{href: string, icon: any, label: string, section?: string}>> = {
  superadmin: [
    // Main Section
    { href: '/dashboard', icon: 'Home', label: 'Overview', section: 'main' },
    
    // Admin Section
    { href: '/dashboard/admin/system', icon: 'Shield', label: 'System Admin', section: 'admin' },
    { href: '/dashboard/admin/users', icon: 'Users', label: 'Users', section: 'admin' },
    { href: '/dashboard/admin/teams', icon: 'Users', label: 'Teams', section: 'admin' },
    { href: '/dashboard/admin/roles', icon: 'Lock', label: 'Roles & Permissions', section: 'admin' },
    { href: '/dashboard/admin/analytics', icon: 'BarChart3', label: 'System Analytics', section: 'admin' },
    { href: '/dashboard/admin/audit-logs', icon: 'FileText', label: 'Audit Logs', section: 'admin' },
    { href: '/dashboard/admin/security', icon: 'Shield', label: 'Security', section: 'admin' },
    { href: '/dashboard/admin/settings', icon: 'Settings', label: 'System Settings', section: 'admin' },
    
    // Platform Section
    { href: '/dashboard/arena', icon: 'Trophy', label: 'Arena', section: 'platform' },
    { href: '/dashboard/scanner', icon: 'Code2', label: 'Scanner', section: 'platform' },
    { href: '/dashboard/learning', icon: 'BookOpen', label: 'Learning', section: 'platform' },
    { href: '/dashboard/leaderboard', icon: 'BarChart3', label: 'Leaderboard', section: 'platform' },
    { href: '/dashboard/achievements', icon: 'Star', label: 'Achievements', section: 'platform' },
    
    // User Section
    { href: '/dashboard/settings', icon: 'Settings', label: 'Settings', section: 'user' },
    { href: '/dashboard/profile', icon: 'User', label: 'Profile', section: 'user' },
  ],
  admin: [
    { href: '/dashboard', icon: 'Home', label: 'Overview', section: 'main' },
    { href: '/dashboard/admin/team', icon: 'Users', label: 'Team Management', section: 'admin' },
    { href: '/dashboard/admin/team-analytics', icon: 'BarChart3', label: 'Team Analytics', section: 'admin' },
    { href: '/dashboard/admin/team-settings', icon: 'Settings', label: 'Team Settings', section: 'admin' },
    { href: '/dashboard/arena', icon: 'Trophy', label: 'Arena', section: 'platform' },
    { href: '/dashboard/scanner', icon: 'Code2', label: 'Scanner', section: 'platform' },
    { href: '/dashboard/learning', icon: 'BookOpen', label: 'Learning', section: 'platform' },
    { href: '/dashboard/leaderboard', icon: 'BarChart3', label: 'Leaderboard', section: 'platform' },
    { href: '/dashboard/achievements', icon: 'Star', label: 'Achievements', section: 'platform' },
    { href: '/dashboard/settings', icon: 'Settings', label: 'Settings', section: 'user' },
    { href: '/dashboard/profile', icon: 'User', label: 'Profile', section: 'user' },
  ],
  user: [
    { href: '/dashboard', icon: 'Home', label: 'Overview', section: 'main' },
    { href: '/dashboard/arena', icon: 'Trophy', label: 'Arena', section: 'platform' },
    { href: '/dashboard/scanner', icon: 'Code2', label: 'Scanner', section: 'platform' },
    { href: '/dashboard/learning', icon: 'BookOpen', label: 'Learning', section: 'platform' },
    { href: '/dashboard/leaderboard', icon: 'BarChart3', label: 'Leaderboard', section: 'platform' },
    { href: '/dashboard/achievements', icon: 'Star', label: 'Achievements', section: 'platform' },
    { href: '/dashboard/settings', icon: 'Settings', label: 'Settings', section: 'user' },
    { href: '/dashboard/profile', icon: 'User', label: 'Profile', section: 'user' },
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
      return '/dashboard/admin/system'
    case 'admin':
      return '/dashboard/admin/team'
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

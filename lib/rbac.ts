import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

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
 * Get current user with role from Supabase
 */
export async function getCurrentUser(): Promise<UserWithPermissions | null> {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          },
        },
      }
    )

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return null

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (error) {
      console.log('[v0] Profile fetch error:', error.message)
      return null
    }

    const role = (profile?.role || 'user') as UserRole

    return {
      id: user.id,
      email: user.email || '',
      full_name: profile?.full_name,
      role,
      is_active: profile?.is_active !== false,
      tenant_id: profile?.tenant_id,
    }
  } catch (error) {
    console.error('[v0] Error fetching current user:', error)
    return null
  }
}

/**
 * Check if user can access a specific page
 */
export function canAccessPage(role: UserRole, pathname: string): boolean {
  const allowedPages = ACCESSIBLE_PAGES[role] || []
  const basePath = pathname.split('?')[0]

  return allowedPages.some(
    (page) => basePath === page || basePath.startsWith(page + '/')
  )
}

/**
 * Get accessible pages for a role
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

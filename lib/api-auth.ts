'use server'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { isSuperAdmin, isAdmin } from './rbac'
import { NextResponse } from 'next/server'

export type UserRole = 'superadmin' | 'admin' | 'user'

export interface APIUser {
  id: string
  email: string
  role: UserRole
}

/**
 * Get authenticated user in API routes
 */
export async function getAPIUser(): Promise<APIUser | null> {
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

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    return {
      id: user.id,
      email: user.email || '',
      role: (profile?.role || 'user') as UserRole,
    }
  } catch (error) {
    console.error('[v0] Error getting API user:', error)
    return null
  }
}

/**
 * Protect API route - requires authentication
 */
export async function requireAuth() {
  const user = await getAPIUser()

  if (!user) {
    return {
      error: 'Unauthorized',
      status: 401,
    }
  }

  return { user }
}

/**
 * Protect API route - requires admin role
 */
export async function requireAdmin() {
  const user = await getAPIUser()

  if (!user) {
    return {
      error: 'Unauthorized',
      status: 401,
    }
  }

  if (!isAdmin(user.role)) {
    return {
      error: 'Forbidden - Admin access required',
      status: 403,
    }
  }

  return { user }
}

/**
 * Protect API route - requires superadmin role
 */
export async function requireSuperAdmin() {
  const user = await getAPIUser()

  if (!user) {
    return {
      error: 'Unauthorized',
      status: 401,
    }
  }

  if (!isSuperAdmin(user.role)) {
    return {
      error: 'Forbidden - Superadmin access required',
      status: 403,
    }
  }

  return { user }
}

/**
 * Check if user has specific role
 */
export function hasRole(userRole: UserRole, requiredRole: UserRole): boolean {
  if (requiredRole === 'superadmin') {
    return userRole === 'superadmin'
  }
  if (requiredRole === 'admin') {
    return userRole === 'admin' || userRole === 'superadmin'
  }
  return true // user role, everyone has access
}

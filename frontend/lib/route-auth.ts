import { headers } from 'next/headers'
import { auth } from './auth'
import { isSuperAdmin, isAdmin, normalizeUserRole, type UserRole as RBACUserRole } from './rbac'

/** API layer role — same as `profiles.role` after normalization. */
export type UserRole = RBACUserRole

export interface APIUser {
  id: string
  email: string
  role: UserRole
}

/**
 * Get authenticated user in API routes (server only).
 *
 * Phase 3 of migration: this is now backed by Better Auth + MongoDB. The
 * function signature and return shape are identical to the previous
 * Supabase implementation so every importing API route keeps working.
 */
export async function getAPIUser(): Promise<APIUser | null> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    })
    if (!session?.user) return null

    const u = session.user as unknown as {
      id: string
      email: string
      role?: string | null
    }

    return {
      id: u.id,
      email: u.email || '',
      role: normalizeUserRole(u.role),
    }
  } catch (error) {
    console.error('[CodeSpectra] Error getting API user:', error)
    return null
  }
}

export async function requireAuth() {
  const user = await getAPIUser()
  if (!user) {
    return { error: 'Unauthorized', status: 401 as const }
  }
  return { user }
}

/** Requires `tenant_admin` or `superadmin`. */
export async function requireAdmin() {
  const user = await getAPIUser()
  if (!user) return { error: 'Unauthorized', status: 401 as const }
  if (!isAdmin(user.role)) {
    return { error: 'Forbidden - Admin access required', status: 403 as const }
  }
  return { user }
}

export async function requireSuperAdmin() {
  const user = await getAPIUser()
  if (!user) return { error: 'Unauthorized', status: 401 as const }
  if (!isSuperAdmin(user.role)) {
    return { error: 'Forbidden - Superadmin access required', status: 403 as const }
  }
  return { user }
}

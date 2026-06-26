import { headers } from 'next/headers'
import { cookies } from 'next/headers'
import { getAdminAuthInstance } from './firebase-admin'
import { bootSchedulerOnce } from './boot-scheduler'
import { isSuperAdmin, isAdmin, normalizeUserRole, type UserRole as RBACUserRole } from './rbac'

export type UserRole = RBACUserRole

export interface APIUser {
  id: string
  email: string
  role: UserRole
}

const SESSION_COOKIE_NAME = 'codespectra_session'

export async function getAPIUser(): Promise<APIUser | null> {
  bootSchedulerOnce()
  try {
    const adminAuth = await getAdminAuthInstance()
    if (!adminAuth) return null

    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value

    if (sessionCookie) {
      try {
        const decoded = await adminAuth.verifySessionCookie(sessionCookie, true)
        if (decoded) {
          return {
            id: decoded.uid,
            email: decoded.email || '',
            role: normalizeUserRole((decoded as Record<string, unknown>).role as string | undefined),
          }
        }
      } catch {
        /* invalid cookie — fall through to Bearer token check */
      }
    }

    const headersList = await headers()
    const authHeader = headersList.get('authorization')
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7)
      try {
        const decoded = await adminAuth.verifyIdToken(token)
        if (decoded) {
          return {
            id: decoded.uid,
            email: decoded.email || '',
            role: normalizeUserRole((decoded as Record<string, unknown>).role as string | undefined),
          }
        }
      } catch {
        /* invalid token */
      }
    }

    return null
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

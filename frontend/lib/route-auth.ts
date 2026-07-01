import { headers } from 'next/headers'
import { cookies } from 'next/headers'
import { getAdminAuthInstance } from './firebase-admin'
import { bootSchedulerOnce } from './boot-scheduler'
import { normalizeUserRole, type UserRole as RBACUserRole } from './rbac'
import { users as getUsersCollection } from '@/lib/db/admin'
import { verifySessionToken, type SessionPayload } from '@/lib/session'
import { checkResourcePermission } from '@/lib/permissions-db'
import { isFeatureEnabled, isPageAllowed } from '@/lib/plans-client'
import { getPlanForRole } from '@/lib/plans'
import { getMongoDb } from '@/lib/mongodb'

export type UserRole = RBACUserRole

export interface APIUser {
  id: string; email: string; role: UserRole
}

const SESSION_COOKIE_NAME = 'codespectra_session'

/** In-memory permission cache — invalidated every 60 seconds */
let _permCache: Map<string, Array<{ resource: string; actions: string[] }>> | null = null
let _permCacheAt = 0

async function getPermissionsForRole(role: string): Promise<Array<{ resource: string; actions: string[] }>> {
  const now = Date.now()
  if (_permCache && now - _permCacheAt < 60_000) return _permCache.get(role) || []
  try {
    const db = await getMongoDb()
    const roles = await db.collection('roles').find({}).toArray()
    _permCache = new Map()
    for (const r of roles) _permCache.set(r.role, r.permissions || [])
    _permCacheAt = now
    return _permCache.get(role) || []
  } catch {
    if (_permCache) _permCacheAt = now
    return (_permCache?.get(role)) || []
  }
}

export function invalidatePermissionCache() { _permCache = null; _permCacheAt = 0 }

async function lookupRole(uid: string): Promise<UserRole> {
  try {
    const userCol = await getUsersCollection()
    const profile = await userCol.findOne({ id: uid })
    if (profile?.role) return normalizeUserRole(profile.role as string)
  } catch { /* fall through */ }
  return 'user'
}

function fromSessionPayload(p: SessionPayload): APIUser {
  return { id: p.uid, email: p.email, role: normalizeUserRole(p.role) }
}

export async function getAPIUser(): Promise<APIUser | null> {
  bootSchedulerOnce()
  try {
    const adminAuth = await getAdminAuthInstance()
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value

    if (sessionCookie) {
      if (adminAuth) {
        try {
          const decoded = await adminAuth.verifySessionCookie(sessionCookie, true)
          if (decoded) return { id: decoded.uid, email: decoded.email || '', role: await lookupRole(decoded.uid) }
        } catch { /* fallback */ }
      }
      const payload = await verifySessionToken(sessionCookie)
      if (payload) return fromSessionPayload(payload)
    }

    if (adminAuth) {
      const headersList = await headers()
      const authHeader = headersList.get('authorization')
      if (authHeader?.startsWith('Bearer ')) {
        try {
          const decoded = await adminAuth.verifyIdToken(authHeader.slice(7))
          if (decoded) return { id: decoded.uid, email: decoded.email || '', role: await lookupRole(decoded.uid) }
        } catch { /* invalid */ }
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
  if (!user) return { error: 'Unauthorized', status: 401 as const }
  return { user }
}

/** requireAdmin: role-based check (DB permissions add granularity, never restrict) */
export async function requireAdmin() {
  const user = await getAPIUser()
  if (!user) return { error: 'Unauthorized', status: 401 as const }
  // Role check first — this is the baseline. DB permissions only add finer control.
  if (user.role !== 'superadmin' && user.role !== 'tenant_admin') {
    return { error: 'Forbidden - Admin access required', status: 403 as const }
  }
  return { user }
}

/** requireSuperAdmin: role-based check (DB permissions add granularity, never restrict) */
export async function requireSuperAdmin() {
  const user = await getAPIUser()
  if (!user) return { error: 'Unauthorized', status: 401 as const }
  // Role check first — this is the baseline. DB permissions only add finer control.
  if (user.role !== 'superadmin') {
    return { error: 'Forbidden - Superadmin access required', status: 403 as const }
  }
  return { user }
}

/**
 * Check if the current user can perform an action on a resource.
 * This is the primary DB-driven permission check for API routes.
 */
export async function requirePermission(resource: string, action: string = 'read') {
  const user = await getAPIUser()
  if (!user) return { error: 'Unauthorized', status: 401 as const }
  const perms = await getPermissionsForRole(user.role)
  if (checkResourcePermission(perms as any, resource, action as any)) return { user }
  return { error: `Forbidden - ${action} on ${resource} denied`, status: 403 as const }
}

/**
 * Check if the current user's plan allows a feature.
 * Returns 402 Payment Required if the plan doesn't include the feature.
 */
export async function requirePlanFeature(feature: string) {
  const user = await getAPIUser()
  if (!user) return { error: 'Unauthorized', status: 401 as const }

  try {
    const db = await getMongoDb()
    const userDoc = await db.collection('users').findOne({ id: user.id })
    const planId = userDoc?.plan || 'free'
    const plan = await getPlanForRole(planId)

    if (!plan) return { error: 'No active plan', status: 402 as const }
    if (!isFeatureEnabled(plan, feature)) {
      return { error: `Plan upgrade required - feature '${feature}' is not available on your plan`, status: 402 as const }
    }
    return { user, plan }
  } catch {
    return { error: 'Failed to verify plan', status: 500 as const }
  }
}

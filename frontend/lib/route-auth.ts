import { headers } from 'next/headers'
import { cookies } from 'next/headers'
import { getAdminAuthInstance } from './firebase-admin'
import { bootSchedulerOnce } from './boot-scheduler'
import type { UserRole as RBACUserRole } from './rbac'
import { verifySessionToken, loadAuthProfile, isTenantActive, type AuthProfile } from '@/lib/session'
import { issuedAfterRevocation, profileTenantId, resolveAccount } from '@/lib/auth-account'
import { checkResourcePermission } from '@/lib/permissions-db'
import { isFeatureEnabled, isPageAllowed } from '@/lib/plans-client'
import { getPlanForRole } from '@/lib/plans'
import { getMongoDb } from '@/lib/mongodb'

export type UserRole = RBACUserRole

export interface APIUser {
  id: string; email: string; role: UserRole
  /** Display name (populated from the auth token when present). */
  name?: string
  /** Full name (populated from the auth token when present). */
  fullName?: string
  /** Last login method (google, github, email, sso). */
  lastLoginMethod?: string | null
  /** Last login timestamp. */
  lastLoginAt?: Date | null
  /** Tenant/organization the user belongs to (from the user doc). */
  tenantId?: string | null
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

/**
 * Build the request user from the DB profile. The token only proves who the
 * caller is; role, status and tenant always come from the `user` doc (short
 * cache in lib/session), so a demotion, deactivation or deletion takes effect
 * on the next request instead of when the token expires.
 */
async function buildAPIUser(
  uid: string,
  fallbackEmail: string,
  tokenName?: string | null,
): Promise<APIUser | null> {
  let profile: AuthProfile | null
  try {
    profile = await loadAuthProfile(uid)
  } catch (e) {
    console.error('[route-auth] profile lookup failed — denying:', e)
    return null
  }
  const tenantId = profileTenantId(profile)
  let tenantActive = true
  if (tenantId) {
    try { tenantActive = await isTenantActive(tenantId) } catch { tenantActive = false }
  }
  const account = resolveAccount(profile, { tenantActive })
  if (!account.ok || !profile) return null
  const name = profile.fullName || profile.name || tokenName || undefined
  return {
    id: String(profile.id || profile._id || uid),
    email: (typeof profile.email === 'string' && profile.email) || fallbackEmail || '',
    role: account.role,
    name: name ?? undefined,
    fullName: name ?? undefined,
    lastLoginMethod: profile.lastLoginMethod ?? null,
    lastLoginAt: profile.lastLoginAt ?? null,
    tenantId: account.tenantId,
  }
}

/** Firebase credentials carry no session version — check the revocation stamp instead. */
async function firebaseCredentialStillValid(uid: string, iat: unknown): Promise<boolean> {
  try {
    const profile = await loadAuthProfile(uid)
    return issuedAfterRevocation(iat, profile)
  } catch {
    return false
  }
}

/**
 * Resolve the caller from raw credentials (the session cookie value and/or an
 * `Authorization` header). Shared by getAPIUser and the proxy page gate
 * (lib/page-access-server.ts), which cannot use next/headers.
 */
export async function getUserFromCredentials(creds: {
  sessionCookie?: string | null
  authorization?: string | null
}): Promise<APIUser | null> {
  try {
    const sessionCookie = creds.sessionCookie || null
    if (sessionCookie) {
      // Own session JWT first (every sign-in path now issues one).
      const payload = await verifySessionToken(sessionCookie)
      if (payload) return buildAPIUser(payload.uid, payload.email)
      // Legacy Firebase session cookies (issued before OAuth moved to the JWT).
      const adminAuth = await getAdminAuthInstance()
      if (adminAuth) {
        try {
          const decoded = await adminAuth.verifySessionCookie(sessionCookie, true)
          if (decoded && (await firebaseCredentialStillValid(decoded.uid, decoded.iat))) {
            return buildAPIUser(decoded.uid, decoded.email || '', decoded.name ?? null)
          }
        } catch { /* invalid */ }
      }
      return null
    }

    const authHeader = creds.authorization || null
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7)
      // ponytail: own session JWTs (mobile-token endpoint, SecureStore-held)
      // must also authenticate API calls — Firebase is optional, this is not.
      const payload = await verifySessionToken(token)
      if (payload) return buildAPIUser(payload.uid, payload.email)
      const adminAuth = await getAdminAuthInstance()
      if (adminAuth) {
        try {
          const decoded = await adminAuth.verifyIdToken(token, true)
          if (decoded && (await firebaseCredentialStillValid(decoded.uid, decoded.iat))) {
            return buildAPIUser(decoded.uid, decoded.email || '', decoded.name ?? null)
          }
        } catch { /* invalid */ }
      }
    }
    return null
  } catch (error) {
    console.error('[CodeSpectra] Error getting API user:', error)
    return null
  }
}

export async function getAPIUser(): Promise<APIUser | null> {
  bootSchedulerOnce()
  try {
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value
    if (sessionCookie) return getUserFromCredentials({ sessionCookie })
    const headersList = await headers()
    return getUserFromCredentials({ authorization: headersList.get('authorization') })
  } catch (error) {
    console.error('[CodeSpectra] Error getting API user:', error)
    return null
  }
}

/** Page permissions for a role: stored `roles` doc merged with the static defaults (60s cache). */
export async function getMergedPermissionsForRole(role: UserRole) {
  const permsDb = await import('@/lib/permissions-db')
  const stored = (await getPermissionsForRole(role)).map((p) => ({
    resource: p.resource,
    resourceType: (p.resource.startsWith('/') ? 'page' : 'entity') as import('@/lib/permissions-db').ResourceType,
    actions: (p.actions || []) as import('@/lib/permissions-db').PermissionAction[],
  }))
  return permsDb.mergePermissions(stored, permsDb.getDefaultRolePermissions(role))
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
  // Deny by default: buildAPIUser already demotes a tenant-less (or suspended-
  // tenant) tenant_admin to `user`; this re-check keeps the guard safe even if
  // a caller hand-builds an APIUser.
  if (user.role === 'tenant_admin' && !user.tenantId) {
    return { error: 'Forbidden - Admin access required', status: 403 as const }
  }
  const tfa = await admin2faApiBlock(user)
  if (tfa) return tfa
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
  const tfa = await admin2faApiBlock(user)
  if (tfa) return tfa
  return { user }
}

/**
 * SEC-009 / A-041: required admin 2FA applies to the admin API too, not only
 * to pages — after the same grace period a stolen admin password alone can no
 * longer drive /api/admin/*. The 2FA setup routes use requireAuth, so the
 * admin can always turn it on.
 */
export async function admin2faApiBlock(user: Pick<APIUser, 'id' | 'role'>): Promise<{ error: string; status: 403; code: 'admin_2fa_required' } | null> {
  try {
    const { getAdmin2faState } = await import('@/lib/admin-2fa')
    if ((await getAdmin2faState(user.id, user.role)).status === 'required') {
      return {
        error: 'Turn on two-factor authentication to use admin tools (Account → Security).',
        status: 403 as const,
        code: 'admin_2fa_required' as const,
      }
    }
  } catch (e) {
    // Settings/DB unreachable: same behaviour as the page gate (don't lock admins out).
    console.error('[route-auth] admin 2FA check failed:', (e as Error)?.message)
  }
  return null
}

/**
 * Tenant ownership guard for a single entity document.
 * - superadmin: always allowed (returns the doc)
 * - tenant_admin: allowed only when the doc belongs to their tenant
 * Returns `{ doc }` on success, or an error result to return directly.
 */
export async function requireTenantEntity(
  db: Awaited<ReturnType<typeof getMongoDb>>,
  collection: string,
  id: string,
  user: APIUser,
  idField: string = 'id'
) {
  if (!id) return { error: 'id required', status: 400 as const }
  const doc = await db.collection(collection).findOne({ [idField]: id })
  if (!doc) return { error: 'Not found', status: 404 as const }
  // A tenant_admin with no tenant owns nothing — never let a missing tenantId
  // fall through as "allowed" (it used to skip the check entirely).
  if (user.role === 'tenant_admin' && (!user.tenantId || doc.tenant_id !== user.tenantId)) {
    return { error: 'Forbidden - resource belongs to another tenant', status: 403 as const }
  }
  return { doc }
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
 * Server-side page / feature gate for the API behind a dashboard page: the
 * caller must be signed in, the page (and `feature`, e.g. "scanner:chat") must
 * not be locked by the superadmin, and the role must have read access to the
 * page (stored role permissions merged with the defaults). Superadmin bypasses.
 */
export async function requirePageAccess(route: string, feature?: string) {
  const user = await getAPIUser()
  if (!user) return { error: 'Unauthorized', status: 401 as const }
  if (user.role === 'superadmin') return { user }
  try {
    const [{ decideRouteAccess }, { isFeatureLocked }, { mergeGeneralPlatformSettings }] = await Promise.all([
      import('@/lib/page-access-map'),
      import('@/lib/page-access'),
      import('@/lib/platform-general-settings'),
    ])
    const db = await getMongoDb()
    const general = await db.collection('platform_settings').findOne({ key: 'general' })
    const settings = mergeGeneralPlatformSettings(general?.value)
    if (feature && isFeatureLocked(feature, settings.locked_features ?? [])) {
      return { error: 'This feature is not available yet', status: 403 as const }
    }
    // Same rule the proxy applies to the page (lib/page-access-map.ts). Plan
    // gates stay with requirePlanFeature on the API that needs them.
    const decision = decideRouteAccess({
      pathname: route,
      user: { role: user.role, tenantId: user.tenantId ?? null },
      lockedPages: settings.locked_pages ?? [],
      permissions: await getMergedPermissionsForRole(user.role),
    })
    if (decision.ok) return { user }
    return decision.reason === 'locked'
      ? { error: 'This feature is not available yet', status: 403 as const }
      : { error: 'Forbidden', status: 403 as const }
  } catch (e) {
    console.error('[route-auth] requirePageAccess:', e)
    return { error: 'Could not verify access', status: 500 as const }
  }
}

/**
 * Check if the current user's plan allows a feature.
 * Returns 402 Payment Required if the plan doesn't include the feature.
 */
export async function requirePlanFeature(feature: string) {
  const user = await getAPIUser()
  if (!user) return { error: 'Unauthorized', status: 401 as const }

  try {
    // One resolver (active subscription, then admin override) — lib/entitlements.ts.
    const { getUserEntitlements, checkFeature } = await import('@/lib/entitlements')
    const ent = await getUserEntitlements(user.id)
    const denied = checkFeature(user, ent, feature)
    if (denied) return { error: denied.error, status: 402 as const }
    return { user, plan: ent.plan }
  } catch (e) {
    console.error('[route-auth] requirePlanFeature:', e)
    return { error: 'Failed to verify plan', status: 500 as const }
  }
}

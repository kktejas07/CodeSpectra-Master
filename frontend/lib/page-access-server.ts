/**
 * Server enforcement of the route → access map (lib/page-access-map.ts) for
 * page requests. Called from proxy.ts for every signed-in page (documents,
 * RSC navigations and prefetches), so a page the caller cannot open is never
 * rendered: signed-out → /auth/login, otherwise the branded /dashboard/locked
 * page (rewrite; the URL stays). APIs keep their own checks (route-auth).
 *
 * Role, status and tenant come from the DB on each request via the session
 * helper (lib/session, ~10s cache); platform locks and role permissions are
 * cached here for 15s / 60s so navigation stays cheap.
 */
import { decideRouteAccess, resolveRouteAccess, type RouteDecision } from '@/lib/page-access-map'
import { getUserFromCredentials, getMergedPermissionsForRole, type APIUser } from '@/lib/route-auth'

export const SESSION_COOKIE_NAME = 'codespectra_session'

const LOCKS_TTL_MS = 15_000
let _locks: { at: number; pages: string[] } | null = null

async function lockedPages(): Promise<string[]> {
  if (_locks && Date.now() - _locks.at < LOCKS_TTL_MS) return _locks.pages
  const [{ getMongoDb }, { mergeGeneralPlatformSettings }] = await Promise.all([
    import('@/lib/mongodb'),
    import('@/lib/platform-general-settings'),
  ])
  const db = await getMongoDb()
  const doc = await db.collection('platform_settings').findOne({ key: 'general' })
  const pages = (mergeGeneralPlatformSettings(doc?.value).locked_pages ?? []).filter((p): p is string => typeof p === 'string')
  _locks = { at: Date.now(), pages }
  return pages
}

const PLAN_TTL_MS = 30_000
type Ent = Awaited<ReturnType<typeof import('@/lib/entitlements').getUserEntitlements>>
const _planCache = new Map<string, { at: number; ent: Ent }>()

/** The caller's plan-feature check (lib/entitlements, cached 30s per user). */
async function planFeatureCheck(user: APIUser): Promise<(feature: string) => boolean> {
  const { getUserEntitlements, checkFeature } = await import('@/lib/entitlements')
  let hit = _planCache.get(user.id)
  if (!hit || Date.now() - hit.at >= PLAN_TTL_MS) {
    hit = { at: Date.now(), ent: await getUserEntitlements(user.id) }
    _planCache.set(user.id, hit)
    if (_planCache.size > 5000) {
      const first = _planCache.keys().next().value
      if (first) _planCache.delete(first)
    }
  }
  const ent = hit.ent
  return (feature: string) => checkFeature(user, ent, feature) === null
}

export type PageGateResult =
  | { action: 'next'; user: APIUser | null }
  | { action: 'login' }
  | { action: 'deny'; reason: 'forbidden' | 'locked' | 'plan' | 'unavailable'; feature?: string }
  /** Maintenance mode is on and the caller is not a platform admin (A-025). */
  | { action: 'maintenance' }
  /** Admin without 2FA past the grace period (A-041) → /auth/two-factor-setup. */
  | { action: 'setup_2fa' }

/**
 * Decide a page request. `next` for pages outside the map, public pages and
 * allowed callers. Fails closed: a DB error shows the locked page ("couldn't
 * check access") rather than the page.
 */
export async function gatePageRequest(input: {
  pathname: string
  sessionCookie?: string | null
  authorization?: string | null
}): Promise<PageGateResult> {
  const access = resolveRouteAccess(input.pathname)
  if (!access || access.auth === 'public') return { action: 'next', user: null }
  if (!input.sessionCookie && !input.authorization?.startsWith('Bearer ')) return { action: 'login' }

  let user: APIUser | null
  try {
    user = await getUserFromCredentials({ sessionCookie: input.sessionCookie, authorization: input.authorization })
  } catch {
    return { action: 'deny', reason: 'unavailable' }
  }
  if (!user) return { action: 'login' }

  // Platform policies that apply before route permissions.
  try {
    const [{ getGeneralSettingsCached }, { maintenanceBlocksPage }, { getAdmin2faState }] = await Promise.all([
      import('@/lib/platform-general-settings-server'),
      import('@/lib/auth-policy'),
      import('@/lib/admin-2fa'),
    ])
    if (maintenanceBlocksPage(await getGeneralSettingsCached(), user.role)) return { action: 'maintenance' }
    if ((await getAdmin2faState(user.id, user.role)).status === 'required') return { action: 'setup_2fa' }
  } catch (e) {
    console.error('[page-access] policy check failed — denying:', e)
    return { action: 'deny', reason: 'unavailable' }
  }

  if (user.role === 'superadmin') return { action: 'next', user }

  let decision: RouteDecision
  try {
    const [pages, permissions] = await Promise.all([lockedPages(), getMergedPermissionsForRole(user.role)])
    const base = { pathname: input.pathname, user: { role: user.role, tenantId: user.tenantId ?? null }, lockedPages: pages, permissions }
    decision = decideRouteAccess(base)
    if (decision.ok && decision.access?.planFeature) {
      decision = decideRouteAccess({ ...base, hasPlanFeature: await planFeatureCheck(user) })
    }
  } catch (e) {
    console.error('[page-access] gate failed — denying:', e)
    return { action: 'deny', reason: 'unavailable' }
  }
  if (decision.ok) return { action: 'next', user }
  if (decision.reason === 'unauthenticated') return { action: 'login' }
  return { action: 'deny', reason: decision.reason, feature: decision.feature }
}

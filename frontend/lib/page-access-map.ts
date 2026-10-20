/**
 * Route → access map for every signed-in page (feature #10).
 *
 * Generated from the route lists in lib/page-permissions.ts (ADMIN_ONLY_ROUTES,
 * TENANT_ADMIN_ROUTES, JUDGE_ROUTES, ALL_USER_ROUTES) plus a few routes that
 * are not permission-managed (EXTRA_ROUTES below), so there is one list.
 * Pure and client-safe: the proxy (server enforcement, lib/page-access-server),
 * the client guard (lib/use-page-guard) and the sidebar all call
 * `decideRouteAccess` on the same entries.
 *
 * Adding a page: put its route in the right array of lib/page-permissions.ts.
 * tests/page-access-map.test.ts fails for a page.tsx that has no entry.
 */
import {
  ADMIN_ONLY_ROUTES,
  TENANT_ADMIN_ROUTES,
  JUDGE_ROUTES,
  ALL_USER_ROUTES,
  ROUTE_LABELS,
  isPlatformAdminRoute,
} from '@/lib/page-permissions'
import { getDefaultRolePermissions } from '@/lib/permissions-db'
import type { UserRole } from '@/lib/types/rbac-types'

/** Shape of a role permission row (lib/permissions-db ResourcePermission or a my-permissions entry). */
export type PagePermissionLike = { resource: string; actions: readonly string[] }

export type AccessRole = 'user' | 'judge' | 'tenant_admin' | 'superadmin'

export interface RouteAccess {
  /** Registered route key (may contain `[param]` segments). */
  route: string
  label: string
  /** Lowest role that can open the page. */
  role: AccessRole
  /** Lowest role the sidebar lists it for (differs only for the judge console). */
  navRole: AccessRole
  /** Tenant admin pages: the caller must belong to an (active) organisation; APIs scope to it. */
  tenantScoped: boolean
  /** Plan feature (lib/entitlements) the page needs, or null. */
  planFeature: string | null
  /** Whether the platform "locked pages" setting can lock it. */
  lockable: boolean
  /** Platform-operator console: only superadmin, DB grants never open it. */
  platformAdmin: boolean
  /** 'public' pages render for signed-out visitors too (e.g. a team invite). */
  auth: 'required' | 'public'
  /** Match only this exact path, not its sub-paths. */
  exact: boolean
}

/** Plan-gated pages → the plan feature whose API returns 402 without it. */
export const PAGE_PLAN_FEATURES: Readonly<Record<string, string>> = {
  '/dashboard/skill-analytics': 'analytics', // /api/analytics/skills → requirePlanFeature('analytics')
}

/**
 * Pages a lock must never hide: the lock screen itself and the ways out of it
 * (upgrade, pay, ask for help). `/dashboard` only locks the overview itself.
 */
export const NEVER_LOCKABLE: ReadonlySet<string> = new Set([
  '/dashboard/locked',
  '/dashboard/billing',
  '/dashboard/pricing',
  '/dashboard/support',
])

type Extra = { route: string; role: AccessRole; auth?: 'required' | 'public'; exact?: boolean; label: string }

/** Signed-in pages that are not managed in the permission matrix. */
export const EXTRA_ROUTES: readonly Extra[] = [
  { route: '/dashboard/locked', role: 'user', label: 'Locked' },
  { route: '/dashboard/analytics', role: 'user', label: 'Skill analytics (legacy link)' },
  // Invite landing: shows the invite and a sign-in button to signed-out visitors.
  { route: '/dashboard/team/invites', role: 'user', auth: 'public', label: 'Team invite' },
  // Other signed-in areas outside /dashboard (pages call usePageGuard('user')).
  { route: '/assessment', role: 'user', exact: true, label: 'Assessments' },
  { route: '/assessment/demo/cad', role: 'user', label: 'CAD demo' },
  { route: '/assessment/[id]/cad', role: 'user', label: 'CAD assessment' },
  { route: '/users', role: 'user', label: 'Public profile' },
  { route: '/qr', role: 'user', label: 'QR check-in' },
]

/**
 * User-list pages that also render for signed-out visitors (sidebar entry for
 * users, but public marketing pages in the sitemap and footer). Without this
 * the proxy bounced visitors from /companies to sign-in (wave 5 crawl).
 */
export const PUBLIC_USER_ROUTES: ReadonlySet<string> = new Set(['/companies'])

let _map: RouteAccess[] | null = null
const _defaults = new Map<string, Set<string>>()

/** Pages a role can read by default (lib/permissions-db role defaults). */
function defaultPagesFor(role: string): Set<string> {
  let set = _defaults.get(role)
  if (!set) {
    set = new Set(
      getDefaultRolePermissions(role as UserRole)
        .filter((p) => p.resourceType === 'page' && (p.actions.includes('read') || p.actions.includes('manage')))
        .map((p) => p.resource),
    )
    _defaults.set(role, set)
  }
  return set
}

/** All entries, built lazily (page-permissions imports this module back). */
export function getPageAccessMap(): readonly RouteAccess[] {
  if (_map) return _map
  const byRoute = new Map<string, RouteAccess>()
  const add = (route: string, role: AccessRole, extra: Partial<RouteAccess> = {}) => {
    if (byRoute.has(route)) return // first list wins: tenant > admin > judge > user (as before)
    byRoute.set(route, {
      route,
      label: ROUTE_LABELS[route] || route,
      role,
      navRole: role,
      tenantScoped: role === 'tenant_admin',
      planFeature: PAGE_PLAN_FEATURES[route] ?? null,
      lockable: !NEVER_LOCKABLE.has(route),
      platformAdmin: role === 'superadmin' || (route.startsWith('/dashboard') && isPlatformAdminRoute(route)),
      auth: 'required',
      exact: false,
      ...extra,
    })
  }
  for (const r of TENANT_ADMIN_ROUTES) add(r, 'tenant_admin')
  for (const r of ADMIN_ONLY_ROUTES) add(r, 'superadmin')
  // Per-event judges can be any user (assigned on the event's Judges tab); the
  // judge API returns only the events the caller judges. Sidebar: judges only.
  for (const r of JUDGE_ROUTES) add(r, 'user', { navRole: 'judge' })
  for (const r of ALL_USER_ROUTES) add(r, 'user', PUBLIC_USER_ROUTES.has(r) ? { auth: 'public' } : {})
  for (const e of EXTRA_ROUTES) add(e.route, e.role, { label: e.label, auth: e.auth ?? 'required', exact: !!e.exact })
  _map = [...byRoute.values()]
  return _map
}

function segs(p: string): string[] {
  return p.split('?')[0].split('#')[0].replace(/\/+$/, '').split('/').filter(Boolean)
}

function keyMatches(entry: RouteAccess, pathSegs: string[]): boolean {
  const k = segs(entry.route)
  if (k.length > pathSegs.length) return false
  if (entry.exact && k.length !== pathSegs.length) return false
  for (let i = 0; i < k.length; i++) {
    if (/^\[.+\]$/.test(k[i])) continue
    if (k[i] !== pathSegs[i]) return false
  }
  return true
}

/**
 * The most specific entry for `pathname` (more segments first, then more
 * literal segments). Any /dashboard path resolves (at worst to `/dashboard`);
 * other paths resolve only when an entry matches, else null (not a signed-in
 * page: marketing pages, token links like /assessment/invite/[token]).
 */
export function resolveRouteAccess(pathname: string): RouteAccess | null {
  const s = segs(pathname)
  let best: RouteAccess | null = null
  let bestScore = -1
  for (const e of getPageAccessMap()) {
    if (!keyMatches(e, s)) continue
    const k = segs(e.route)
    const score = k.length * 100 + k.filter((x) => !/^\[.+\]$/.test(x)).length
    if (score > bestScore) { best = e; bestScore = score }
  }
  return best
}

/** Registered ancestors of a route key (closest first), excluding the `/dashboard` root. */
function ancestorKeys(route: string): string[] {
  const k = segs(route)
  const out: string[] = []
  for (let i = k.length - 1; i >= 2; i--) out.push('/' + k.slice(0, i).join('/'))
  return out
}

export function roleMeets(role: string, required: AccessRole): boolean {
  if (role === 'superadmin') return true
  switch (required) {
    case 'user': return role === 'user' || role === 'judge' || role === 'tenant_admin'
    case 'judge': return role === 'judge' || role === 'tenant_admin'
    case 'tenant_admin': return role === 'tenant_admin'
    default: return false
  }
}

/** Does a platform lock list lock this page? (superadmin bypass is the caller's job.) */
export function isLockedByPlatform(access: RouteAccess, pathname: string, lockedPages: readonly string[]): boolean {
  if (!access.lockable) return false
  const path = '/' + segs(pathname).join('/')
  return lockedPages.some((p) => {
    if (typeof p !== 'string' || !p.startsWith('/')) return false
    const base = '/' + segs(p).join('/')
    if (base === '/dashboard') return path === '/dashboard' // never a lock-everything switch
    if (NEVER_LOCKABLE.has(base)) return false
    return path === base || path.startsWith(base + '/')
  })
}

export type PageDenyReason = 'unauthenticated' | 'forbidden' | 'locked' | 'plan'

export type RouteDecision =
  | { ok: true; access: RouteAccess | null }
  | { ok: false; reason: PageDenyReason; access: RouteAccess; feature?: string }

export interface RouteAccessInput {
  pathname: string
  /** Effective role/tenant from the DB (route-auth), null when signed out. */
  user: { role: string | null | undefined; tenantId?: string | null } | null
  lockedPages: readonly string[]
  /**
   * The role's page permissions (stored merged with defaults). An exact entry
   * with read/manage grants a page beyond the static role (never a platform
   * page); an entry without read on the page or a registered ancestor revokes it.
   */
  permissions?: readonly PagePermissionLike[]
  /** Plan check; omit to skip (the server always passes it for plan-gated pages). */
  hasPlanFeature?: (feature: string) => boolean
}

/** Deny by default: no role ⇒ unauthenticated; tenant pages need a tenant. */
export function decideRouteAccess(input: RouteAccessInput): RouteDecision {
  const access = resolveRouteAccess(input.pathname)
  if (!access) return { ok: true, access: null }
  if (access.auth === 'public') return { ok: true, access }
  const role = input.user?.role
  if (!role) return { ok: false, reason: 'unauthenticated', access }
  if (role === 'superadmin') return { ok: true, access }
  if (access.platformAdmin || access.role === 'superadmin') return { ok: false, reason: 'forbidden', access }
  if (isLockedByPlatform(access, input.pathname, input.lockedPages)) return { ok: false, reason: 'locked', access }

  const perms = new Map<string, readonly string[]>()
  for (const p of input.permissions ?? []) if (p && typeof p.resource === 'string') perms.set(p.resource, p.actions ?? [])
  const canRead = (a: readonly string[]) => a.includes('read') || a.includes('manage')
  // A `[]` row revokes the page, or a parent page, only when the role has that
  // page by default. Saved role docs also carry `[]` rows for pages the role
  // never had (e.g. `/dashboard/admin` for tenant admins); those revoke nothing.
  const defaults = defaultPagesFor(role)
  const revoked = [access.route, ...ancestorKeys(access.route)]
    .some((r) => perms.has(r) && !canRead(perms.get(r)!) && defaults.has(r))
  if (revoked) return { ok: false, reason: 'forbidden', access }
  const granted = perms.has(access.route) && canRead(perms.get(access.route)!)
  if (!roleMeets(role, access.role) && !granted) return { ok: false, reason: 'forbidden', access }
  if (access.tenantScoped && !input.user?.tenantId) return { ok: false, reason: 'forbidden', access }

  if (access.planFeature && input.hasPlanFeature && !input.hasPlanFeature(access.planFeature)) {
    return { ok: false, reason: 'plan', access, feature: access.planFeature }
  }
  return { ok: true, access }
}

/** Sidebar rule: listed only when the page opens for this user and the role is in its nav audience. */
export function canShowInNav(input: RouteAccessInput): boolean {
  const d = decideRouteAccess(input)
  if (!d.ok && d.reason !== 'plan') return false // plan-gated pages stay visible and open an upgrade prompt
  const access = d.access ?? resolveRouteAccess(input.pathname)
  const role = input.user?.role
  if (!access || !role) return false
  if (role === 'superadmin') return true
  if (access.navRole === access.role) return true
  const granted = (input.permissions ?? []).some((p) => p.resource === access.route && (p.actions.includes('read') || p.actions.includes('manage')))
  return roleMeets(role, access.navRole) || granted
}

/** Where the proxy sends a denied request (keeps the URL; renders the branded page). */
export function lockedPagePath(reason: Exclude<PageDenyReason, 'unauthenticated'> | 'unavailable', from: string, feature?: string): string {
  const q = new URLSearchParams({ reason, from })
  if (feature) q.set('feature', feature)
  return `/dashboard/locked?${q.toString()}`
}

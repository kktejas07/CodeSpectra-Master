/**
 * Route → access map (lib/page-access-map.ts): every signed-in page.tsx must
 * resolve to an explicit entry, and the resolved table is snapshotted so a new
 * page (or a changed rule) shows up in review.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  canShowInNav,
  decideRouteAccess,
  getPageAccessMap,
  resolveRouteAccess,
  roleMeets,
  type RouteAccessInput,
} from '@/lib/page-access-map'
import { getRequiredRoleForRoute } from '@/lib/page-permissions'

const APP = path.resolve(__dirname, '../app')

function pageRoutes(dir: string): string[] {
  const out: string[] = []
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name)
      if (e.isDirectory()) walk(full)
      else if (e.name === 'page.tsx' || e.name === 'page.ts') {
        const rel = path.relative(APP, path.dirname(full)).split(path.sep)
          .filter((s) => !/^\(.+\)$/.test(s)) // route groups
        out.push('/' + rel.join('/'))
      }
    }
  }
  walk(dir)
  return out.sort()
}

const DASHBOARD_PAGES = pageRoutes(path.join(APP, 'dashboard'))
const OTHER_SIGNED_IN = ['assessment', 'users', 'qr'].flatMap((d) => pageRoutes(path.join(APP, d)))

const T = 'tenant-1'
const as = (role: string | null, tenantId: string | null = role === 'tenant_admin' ? T : null) =>
  (pathname: string, extra: Partial<RouteAccessInput> = {}) =>
    decideRouteAccess({ pathname, user: role ? { role, tenantId } : null, lockedPages: [], ...extra })

describe('route → access map coverage', () => {
  it('finds the dashboard pages', () => {
    expect(DASHBOARD_PAGES.length).toBeGreaterThan(100)
    expect(DASHBOARD_PAGES).toContain('/dashboard/mock-tests/history')
    expect(DASHBOARD_PAGES).toContain('/dashboard/calendar')
    expect(DASHBOARD_PAGES).toContain('/dashboard/locked')
  })

  it('every dashboard page has its own entry (no fall-through to /dashboard)', () => {
    const missing = DASHBOARD_PAGES.filter((p) => {
      const a = resolveRouteAccess(p)
      return !a || (a.route === '/dashboard' && p !== '/dashboard')
    })
    expect(missing).toEqual([])
  })

  it('guarded pages outside /dashboard resolve; token links stay public', () => {
    expect(resolveRouteAccess('/assessment')?.role).toBe('user')
    expect(resolveRouteAccess('/assessment/demo/cad')?.role).toBe('user')
    expect(resolveRouteAccess('/assessment/abc/cad')?.route).toBe('/assessment/[id]/cad')
    expect(resolveRouteAccess('/users/jane')?.role).toBe('user')
    expect(resolveRouteAccess('/qr/tok')?.role).toBe('user')
    expect(resolveRouteAccess('/assessment/abc')).toBeNull()
    expect(resolveRouteAccess('/assessment/invite/tok')).toBeNull()
    expect(resolveRouteAccess('/pricing')).toBeNull()
    expect(resolveRouteAccess('/')).toBeNull()
  })

  it('has no duplicate keys', () => {
    const keys = getPageAccessMap().map((e) => e.route)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('matches the snapshot (add new pages to lib/page-permissions.ts)', () => {
    const table = Object.fromEntries(
      [...DASHBOARD_PAGES, ...OTHER_SIGNED_IN].map((p) => {
        const a = resolveRouteAccess(p)
        if (!a) return [p, null]
        const flags = [
          a.tenantScoped && 'tenant',
          a.planFeature && `plan:${a.planFeature}`,
          !a.lockable && 'unlockable',
          a.platformAdmin && 'platform',
          a.auth === 'public' && 'public',
          a.navRole !== a.role && `nav:${a.navRole}`,
        ].filter(Boolean).join(' ')
        return [p, `${a.route} → ${a.role}${flags ? ' [' + flags + ']' : ''}`]
      }),
    )
    expect(table).toMatchSnapshot()
  })
})

describe('role and tenant resolution (every page)', () => {
  const all = [...DASHBOARD_PAGES, ...OTHER_SIGNED_IN].filter((p) => resolveRouteAccess(p))
  it.each(all)('%s', (p) => {
    const a = resolveRouteAccess(p)!
    // Signed out: only public pages render.
    expect(as(null)(p).ok).toBe(a.auth === 'public')
    // Superadmin opens everything.
    expect(as('superadmin')(p).ok).toBe(true)
    if (a.auth === 'public') return
    for (const role of ['user', 'judge', 'tenant_admin'] as const) {
      const expected = !a.platformAdmin && roleMeets(role, a.role)
      expect({ role, ok: as(role)(p).ok }).toEqual({ role, ok: expected })
    }
    // A tenant admin without an organisation is denied every tenant page.
    if (a.tenantScoped) expect(as('tenant_admin', null)(p)).toMatchObject({ ok: false, reason: 'forbidden' })
  })
})

describe('specific routes', () => {
  it('tenant admins open hiring analytics, events admin and team pages; users do not', () => {
    for (const p of [
      '/dashboard/admin/predictive-validity',
      '/dashboard/admin/hiring-manager-report',
      '/dashboard/admin/hackathons',
      '/dashboard/admin/hackathons/abc/report',
      '/dashboard/admin/hackathons/edit/abc',
      '/dashboard/admin/codeathons',
      '/dashboard/admin/team',
    ]) {
      expect(as('tenant_admin')(p).ok).toBe(true)
      expect(as('user')(p)).toMatchObject({ ok: false, reason: 'forbidden' })
    }
  })

  it('platform pages stay superadmin-only, even with a DB grant', () => {
    const grant = { permissions: [{ resource: '/dashboard/admin/users', actions: ['read'] }] }
    expect(as('tenant_admin')('/dashboard/admin/users', grant)).toMatchObject({ ok: false, reason: 'forbidden' })
    expect(as('tenant_admin')('/dashboard/admin/unknown-new-page')).toMatchObject({ ok: false, reason: 'forbidden' })
    expect(as('tenant_admin')('/dashboard/admin/assessments/bulk')).toMatchObject({ ok: false, reason: 'forbidden' })
    expect(as('tenant_admin')('/dashboard/admin/assessments/abc/results').ok).toBe(true)
  })

  it('learner routes are open to every signed-in role', () => {
    for (const p of ['/dashboard/mock-tests/history', '/dashboard/mock-tests/history/a1', '/dashboard/calendar', '/dashboard/judge']) {
      expect(as('user')(p).ok).toBe(true)
    }
    expect(as(null)('/dashboard/calendar')).toMatchObject({ ok: false, reason: 'unauthenticated' })
    expect(as(null)('/dashboard/team/invites/tok').ok).toBe(true)
  })

  it('DB grants open an extra non-platform page; revokes cascade to sub-pages but not from the root', () => {
    const grant = { permissions: [{ resource: '/dashboard/recruiter-analytics', actions: ['read'] }] }
    expect(as('user', T)('/dashboard/recruiter-analytics', grant).ok).toBe(true)
    // tenant pages still need an organisation
    expect(as('user', null)('/dashboard/recruiter-analytics', grant).ok).toBe(false)
    // a covering grant on /dashboard/interviews never opens the tenant-only feedback page
    const parent = { permissions: [{ resource: '/dashboard/interviews', actions: ['read'] }, { resource: '/dashboard', actions: ['read'] }] }
    expect(as('user')('/dashboard/interviews/feedback', parent).ok).toBe(false)

    const revoke = { permissions: [{ resource: '/dashboard/courses', actions: [] }] }
    expect(as('user')('/dashboard/courses', revoke)).toMatchObject({ ok: false, reason: 'forbidden' })
    expect(as('user')('/dashboard/courses/my', revoke)).toMatchObject({ ok: false, reason: 'forbidden' })
    // Stale `[]` rows for pages the role never had revoke nothing.
    const stale = { permissions: [{ resource: '/dashboard/admin', actions: [] }, { resource: '/dashboard/judge', actions: [] }] }
    expect(as('tenant_admin')('/dashboard/admin/team/activity', stale).ok).toBe(true)
    expect(as('user')('/dashboard/judge', stale).ok).toBe(true)
    const root = { permissions: [{ resource: '/dashboard', actions: [] }] }
    expect(as('user')('/dashboard', root).ok).toBe(false)
    expect(as('user')('/dashboard/problems', root).ok).toBe(true)
  })

  it('platform locks: lock sub-paths, never the escape hatches, never everything; superadmin bypasses', () => {
    const locked = { lockedPages: ['/dashboard/scanner', '/dashboard', '/dashboard/billing'] }
    expect(as('user')('/dashboard/scanner', locked)).toMatchObject({ ok: false, reason: 'locked' })
    expect(as('user')('/dashboard/scanner/x', locked)).toMatchObject({ ok: false, reason: 'locked' })
    expect(as('user')('/dashboard', locked)).toMatchObject({ ok: false, reason: 'locked' })
    expect(as('user')('/dashboard/problems', locked).ok).toBe(true)
    expect(as('user')('/dashboard/billing', locked).ok).toBe(true)
    expect(as('user')('/dashboard/locked', locked).ok).toBe(true)
    expect(as('superadmin')('/dashboard/scanner', locked).ok).toBe(true)
  })

  it('plan-gated pages ask for an upgrade; superadmin bypasses', () => {
    const no = { hasPlanFeature: () => false }
    expect(as('user')('/dashboard/skill-analytics', no)).toMatchObject({ ok: false, reason: 'plan', feature: 'analytics' })
    expect(as('user')('/dashboard/skill-analytics', { hasPlanFeature: (f) => f === 'analytics' }).ok).toBe(true)
    expect(as('superadmin')('/dashboard/skill-analytics', no).ok).toBe(true)
    // forbidden beats plan
    expect(as('user')('/dashboard/admin/team', no)).toMatchObject({ reason: 'forbidden' })
  })
})

describe('sidebar uses the same rule', () => {
  const nav = (role: string, pathname: string, extra: Partial<RouteAccessInput> = {}) =>
    canShowInNav({ pathname, user: { role, tenantId: role === 'tenant_admin' ? T : null }, lockedPages: [], ...extra })
  it('shows only pages the user can open', () => {
    expect(nav('user', '/dashboard/problems')).toBe(true)
    expect(nav('user', '/dashboard/admin/team')).toBe(false)
    expect(nav('tenant_admin', '/dashboard/admin/predictive-validity')).toBe(true)
    expect(nav('tenant_admin', '/dashboard/admin/system')).toBe(false)
    expect(nav('user', '/dashboard/scanner', { lockedPages: ['/dashboard/scanner'] })).toBe(false)
    expect(nav('user', '/dashboard/courses', { permissions: [{ resource: '/dashboard/courses', actions: [] }] })).toBe(false)
    expect(nav('superadmin', '/dashboard/admin/system')).toBe(true)
  })
  it('lists the judge console for judges and admins only; keeps plan-gated pages', () => {
    expect(nav('user', '/dashboard/judge')).toBe(false)
    expect(nav('judge', '/dashboard/judge')).toBe(true)
    expect(nav('tenant_admin', '/dashboard/judge')).toBe(true)
    expect(nav('user', '/dashboard/skill-analytics', { hasPlanFeature: () => false })).toBe(true)
  })
  it('getRequiredRoleForRoute reads the same map', () => {
    expect(getRequiredRoleForRoute('/dashboard/admin/predictive-validity')).toBe('tenant_admin')
    expect(getRequiredRoleForRoute('/dashboard/admin/hackathons/abc')).toBe('tenant_admin')
    expect(getRequiredRoleForRoute('/dashboard/admin/question-bank')).toBe('superadmin')
    expect(getRequiredRoleForRoute('/dashboard/judge')).toBe('judge')
    expect(getRequiredRoleForRoute('/dashboard/mock-tests/history')).toBe('user')
  })
})

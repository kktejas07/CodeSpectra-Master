/**
 * Mobile manifest contract tests (anti-rot).
 * The app shell renders tabs from buildTabs() — if web RBAC changes
 * (page-permissions.ts) or a tab's backing route is removed, these tests
 * fail HERE instead of shipping a broken/privileged app.
 * Run: npx vitest run tests/mobile-manifest.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  buildTabs,
  buildBootstrap,
  MOBILE_TAB_CATALOG,
  MOBILE_THEMES,
} from '@/lib/mobile/manifest'
import { ADMIN_ONLY_ROUTES, TENANT_ADMIN_ROUTES } from '@/lib/page-permissions'

describe('mobile tab visibility', () => {
  it('user role sees learner tabs only (no judge/admin)', () => {
    const ids = buildTabs('user').map((t) => t.id)
    expect(ids).toEqual(expect.arrayContaining(['home', 'problems', 'courses', 'assessments', 'leaderboard', 'profile']))
    expect(ids).not.toContain('judge')
    expect(ids).not.toContain('admin')
  })

  it('judge role gains the judge tab but not admin', () => {
    const ids = buildTabs('judge').map((t) => t.id)
    expect(ids).toContain('judge')
    expect(ids).not.toContain('admin')
  })

  it('superadmin sees every tab', () => {
    const ids = buildTabs('superadmin').map((t) => t.id)
    expect(ids).toEqual(MOBILE_TAB_CATALOG.map((t) => t.id))
  })

  it('DB denied list hides matching tabs (permissions UI parity)', () => {
    const ids = buildTabs('user', ['/dashboard/problems']).map((t) => t.id)
    expect(ids).not.toContain('problems')
    expect(ids).toContain('courses')
  })

  it('admin tab mirrors an ADMIN_ONLY route, judge tab a non-admin route', () => {
    const adminTab = MOBILE_TAB_CATALOG.find((t) => t.id === 'admin')!
    const judgeTab = MOBILE_TAB_CATALOG.find((t) => t.id === 'judge')!
    const adminRoutes = [...ADMIN_ONLY_ROUTES, ...TENANT_ADMIN_ROUTES]
    // ponytail: prefix match — /dashboard/admin/* pages are superadmin by
    // default even when only the parent is listed.
    expect(adminRoutes.some((r) => adminTab.webRoute === r || adminTab.webRoute.startsWith(r + '/'))).toBe(true)
    expect(adminRoutes.includes(judgeTab.webRoute)).toBe(false)
  })

  it('tab catalog has unique ids/routes/icons', () => {
    const ids = MOBILE_TAB_CATALOG.map((t) => t.id)
    const routes = MOBILE_TAB_CATALOG.map((t) => t.route)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(routes).size).toBe(routes.length)
    for (const t of MOBILE_TAB_CATALOG) {
      expect(t.icon).toBeTruthy()
      expect(t.route.startsWith('/(tabs)/')).toBe(true)
    }
  })
})

describe('mobile theme tokens', () => {
  it('dark and light themes are complete hex palettes', () => {
    for (const mode of ['dark', 'light'] as const) {
      const th = MOBILE_THEMES[mode]
      expect(th.mode).toBe(mode)
      for (const k of ['primary', 'background', 'card', 'text', 'muted', 'border'] as const) {
        expect(th[k]).toMatch(/^#[0-9A-Fa-f]{6}$/)
      }
    }
    expect(MOBILE_THEMES.dark.background).not.toBe(MOBILE_THEMES.light.background)
  })
})

describe('buildBootstrap', () => {
  it('assembles a complete bootstrap doc with dark default', () => {
    const doc = buildBootstrap({
      user: { id: 'u1', email: 'a@b.c', name: 'A', role: 'user' },
    })
    expect(doc.user.role).toBe('user')
    expect(doc.tabs.length).toBeGreaterThan(0)
    expect(doc.theme.mode).toBe('dark')
    expect(doc.flags.faceEnrollmentRequired).toBe(false)
  })
})

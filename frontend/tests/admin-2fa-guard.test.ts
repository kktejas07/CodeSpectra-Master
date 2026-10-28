/**
 * SEC-029: admin tools must not work for an admin who still owes two-factor.
 *
 * Two layers, both checked here:
 *  1. Routes use a shared guard that enforces admin 2FA (requireAdmin /
 *     requireSuperAdmin / gates built on them), or the 2FA-aware helpers
 *     isAdminCaller / isSuperAdminCaller for routes that also serve users.
 *     A hand-written `user.role === 'superadmin'` check fails this test.
 *  2. The proxy refuses /api/admin/** for a session that owes admin 2FA.
 *
 * Run: npx vitest run tests/admin-2fa-guard.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = join(__dirname, '..')

function routeFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...routeFiles(p))
    else if (name === 'route.ts' || name === 'route.tsx') out.push(p)
  }
  return out
}
const rel = (p: string) => relative(ROOT, p).split('\\').join('/')

/** Gates that call requireAdmin / requireSuperAdmin (verified below). */
const ADMIN_GATE = /\b(requireAdmin|requireSuperAdmin|requireAgentCaller|hiringAgentsGate|knowledgeGate|adminGate|botAdmin)\(|gate\([^)]*admin: true/
/** Anything that makes a hand-built role check 2FA-aware. */
const TFA_AWARE = /\b(requireAdmin|requireSuperAdmin|requireAgentCaller|hiringAgentsGate|knowledgeGate|adminGate|botAdmin|isAdminCaller|isSuperAdminCaller|admin2faRequiredError|adminTwoFactorRequired)\b/
/** A role comparison written by hand. */
const RAW_ROLE = /\brole\s*(===|!==)\s*['"](superadmin|tenant_admin)['"]|\[\s*['"]superadmin['"]\s*,\s*['"]tenant_admin['"]\s*\]\.includes\(/
/** Lines that only narrow access (scoping / safety blocks) say so explicitly. */
const ROLE_SCOPE_MARK = /role-scope:/

/** A top-level declaration starts a new chunk (exported handler or helper). */
const TOP_LEVEL = /^(export\s+)?(default\s+)?(async\s+)?function\b|^(export\s+)?(const|let)\s+\w+\s*[:=]/
/** [start, end) line ranges, one per top-level function / const, so checks run per handler. */
function topLevelChunks(lines: string[]): Array<[number, number]> {
  const out: Array<[number, number]> = []
  let start = 0
  lines.forEach((l, i) => {
    if (i > start && TOP_LEVEL.test(l)) { out.push([start, i]); start = i }
  })
  out.push([start, lines.length])
  return out
}

/** /api/admin routes allowed without one of the gates above — with the reason. */
const ADMIN_ROUTE_EXCEPTIONS: Record<string, string> = {
  'app/api/admin/impersonate/stop/route.ts': 'restores the admin session from the impersonator cookie; grants nothing',
  'app/api/admin/contests/route.ts': 'contest staff list; lib/contests/service canCreate / saveContestSettings use isAdminCaller / isSuperAdminCaller',
}

describe('SEC-029: routes use 2FA-enforcing guards', () => {
  const all = routeFiles(join(ROOT, 'app/api'))

  it('every /api/admin route goes through a shared admin guard', () => {
    const missing = all
      .filter((f) => rel(f).startsWith('app/api/admin/'))
      .filter((f) => !ADMIN_GATE.test(readFileSync(f, 'utf8')) && !ADMIN_ROUTE_EXCEPTIONS[rel(f)])
      .map(rel)
    expect(missing, 'use requireSuperAdmin()/requireAdmin() (lib/route-auth) — they enforce admin 2FA').toEqual([])
  })

  it('no handler compares the admin role by hand without a 2FA-aware check', () => {
    // Checked per top-level function (each exported handler and each helper),
    // not per file: a file whose POST uses requireAdmin() must not hide a
    // PATCH that compares `user.role` by hand (audit-7 SEC-029).
    const offenders: string[] = []
    for (const f of all) {
      const lines = readFileSync(f, 'utf8').split('\n')
      for (const [a, b] of topLevelChunks(lines)) {
        if (TFA_AWARE.test(lines.slice(a, b).join('\n'))) continue
        for (let i = a; i < b; i++) {
          // The marker may sit on the line itself or on the comment line above it.
          if (RAW_ROLE.test(lines[i]) && !ROLE_SCOPE_MARK.test(lines[i]) && !ROLE_SCOPE_MARK.test(lines[i - 1] || '')) {
            offenders.push(`${rel(f)}:${i + 1}: ${lines[i].trim()}`)
          }
        }
      }
    }
    expect(offenders, 'use isAdminCaller()/isSuperAdminCaller() or a shared guard in that handler; mark pure scoping with "// role-scope: <why>"').toEqual([])
  })

  it('splits a route file into one chunk per top-level function', () => {
    const src = [
      "import x from 'y'",
      'export async function GET() {',
      "  const g = await requireAdmin()",
      '}',
      'export async function PATCH() {',
      "  if (user.role !== 'superadmin') return",
      '}',
    ]
    const chunks = topLevelChunks(src).map(([a, b]) => src.slice(a, b).join('\n'))
    const patch = chunks.find((c) => c.includes('PATCH'))!
    expect(patch).not.toMatch(TFA_AWARE)
    expect(patch).toMatch(RAW_ROLE)
  })

  it('the audit-7 handlers outside /api/admin use the 2FA-aware guards', () => {
    const want: Record<string, RegExp> = {
      'app/api/jobs/[id]/route.ts': /isSuperAdminCaller\(user\)[\s\S]*requireAdmin\(\)[\s\S]*requireAdmin\(\)/,
      'app/api/jobs/route.ts': /isStaff = isAdminCaller\(user\)/,
      'app/api/exams/[id]/links/route.ts': /(requireAdmin\(\)[\s\S]*){4}/,
      'app/api/resources/ebooks/route.ts': /isSa = isSuperAdminCaller\(user\)/,
      'app/api/resources/ebooks/[slug]/route.ts': /!isSuperAdminCaller\(user\)/,
      'app/api/problems/route.ts': /export async function POST[\s\S]*?requireAdmin\(\)/,
    }
    for (const [f, re] of Object.entries(want)) expect(readFileSync(join(ROOT, f), 'utf8'), f).toMatch(re)
  })

  it('the routes from the audit no longer hand-check roles', () => {
    const fixed = [
      'app/api/admin/settings/kyc/route.ts', 'app/api/admin/settings/kyc/test/route.ts', 'app/api/admin/cdn/purge/route.ts',
      'app/api/admin/cloudflare-analytics/route.ts', 'app/api/admin/courses/route.ts', 'app/api/admin/courses/worker/route.ts',
      'app/api/admin/courses/generate-curriculum/route.ts', 'app/api/ai-inventory/route.ts', 'app/api/ai-inventory/audit/route.ts',
      'app/api/support/tickets/[id]/route.ts', 'app/api/hackathons/[id]/screening/route.ts', 'app/api/kyc/didit/session/[sessionId]/route.ts',
    ]
    for (const f of fixed) {
      const src = readFileSync(join(ROOT, f), 'utf8')
      expect(src, f).not.toMatch(/role\s*(===|!==)\s*'superadmin'/)
      expect(src, f).toMatch(TFA_AWARE)
    }
  })

  it('the named gates really delegate to requireAdmin / requireSuperAdmin', () => {
    const defs: Record<string, string> = {
      'lib/agent/http.ts': 'requireAgentCaller',
      'lib/agent/hiring-loops/http.ts': 'hiringAgentsGate',
      'lib/rag/route-helpers.ts': 'knowledgeGate',
      'lib/marketplace/seller-api.ts': 'adminGate',
      'lib/community/http.ts': 'adminGate',
      'lib/question-bot/http.ts': 'botAdmin',
      'lib/study-plan/http.ts': 'gate',
    }
    for (const [file, fn] of Object.entries(defs)) {
      const src = readFileSync(join(ROOT, file), 'utf8')
      const start = src.indexOf(`export async function ${fn}(`)
      expect(start, `${file} ${fn}`).toBeGreaterThan(-1)
      const body = src.slice(start, start + 600)
      expect(body, `${file} ${fn}`).toMatch(/require(Super)?Admin\(\)|requireAgentCaller\(\)/)
    }
  })

  it('the proxy wires the /api/admin 2FA gate', () => {
    const src = readFileSync(join(ROOT, 'proxy.ts'), 'utf8')
    expect(src).toMatch(/isAdminApiPath\(pathname\)/)
    expect(src).toMatch(/adminApi2faBlocked\(/)
  })
})

describe('SEC-029: 2FA-aware role helpers', () => {
  it('treat an admin who owes 2FA as a non-admin', async () => {
    vi.resetModules()
    vi.doMock('@/lib/mongodb', () => ({ getMongoDb: async () => ({}) }))
    const { isAdminCaller, isSuperAdminCaller, gateErrorBody } = await import('@/lib/route-auth')
    expect(isSuperAdminCaller({ role: 'superadmin' })).toBe(true)
    expect(isSuperAdminCaller({ role: 'superadmin', adminTwoFactorRequired: true })).toBe(false)
    expect(isSuperAdminCaller({ role: 'tenant_admin', tenantId: 't1' })).toBe(false)
    expect(isSuperAdminCaller(null)).toBe(false)
    expect(isAdminCaller({ role: 'tenant_admin', tenantId: 't1' })).toBe(true)
    expect(isAdminCaller({ role: 'tenant_admin', tenantId: null })).toBe(false)
    expect(isAdminCaller({ role: 'tenant_admin', tenantId: 't1', adminTwoFactorRequired: true })).toBe(false)
    expect(isAdminCaller({ role: 'superadmin', adminTwoFactorRequired: true })).toBe(false)
    expect(isAdminCaller({ role: 'user', tenantId: 't1' })).toBe(false)
    expect(gateErrorBody({ error: 'x', status: 403, code: 'admin_2fa_required' }).code).toBe('admin_2fa_required')
    expect(gateErrorBody({ error: 'x', status: 401 }).code).toBe('unauthorized')
    expect(gateErrorBody({ error: 'x', status: 403 }).code).toBe('forbidden')
    vi.doUnmock('@/lib/mongodb')
  })
})

describe('SEC-029: proxy /api/admin gate', () => {
  const who: { user: Record<string, unknown> | null; throws?: boolean } = { user: null }
  beforeEach(() => {
    vi.resetModules()
    who.user = null
    who.throws = false
    vi.doMock('@/lib/route-auth', () => ({
      getUserFromCredentials: async () => {
        if (who.throws) throw new Error('db down')
        return who.user
      },
    }))
  })

  it('covers /api/admin/** except the impersonation stop', async () => {
    const { isAdminApiPath } = await import('@/lib/admin-api-2fa')
    expect(isAdminApiPath('/api/admin/settings/kyc')).toBe(true)
    expect(isAdminApiPath('/api/admin/courses/generate-curriculum')).toBe(true)
    expect(isAdminApiPath('/api/admin')).toBe(true)
    expect(isAdminApiPath('/api/admin/impersonate/stop')).toBe(false)
    expect(isAdminApiPath('/api/administrator')).toBe(false)
    expect(isAdminApiPath('/api/support/tickets')).toBe(false)
  })

  it('blocks only an admin who owes 2FA; fails open to the route guard', async () => {
    const { adminApi2faBlocked } = await import('@/lib/admin-api-2fa')
    expect(await adminApi2faBlocked({})).toBe(false)
    who.user = { id: 'a', role: 'superadmin', adminTwoFactorRequired: true }
    expect(await adminApi2faBlocked({ sessionCookie: 'jwt' })).toBe(true)
    expect(await adminApi2faBlocked({ authorization: 'Bearer t' })).toBe(true)
    who.user = { id: 'a', role: 'superadmin' }
    expect(await adminApi2faBlocked({ sessionCookie: 'jwt' })).toBe(false)
    who.throws = true
    expect(await adminApi2faBlocked({ sessionCookie: 'jwt' })).toBe(false)
  })
})

describe('SEC-029: a converted route answers admin_2fa_required', () => {
  it('POST /api/admin/settings/kyc refuses a superadmin who owes 2FA', async () => {
    vi.resetModules()
    const tfa = { error: 'Turn on two-factor authentication to use admin tools (Account → Security).', status: 403 as const, code: 'admin_2fa_required' as const }
    vi.doMock('@/lib/route-auth', () => ({
      requireSuperAdmin: async () => tfa,
      gateErrorBody: (g: { error: string; status: number; code?: string }) => ({ error: g.error, code: g.code ?? 'forbidden' }),
    }))
    vi.doMock('@/lib/mongodb', () => ({ getMongoDb: async () => { throw new Error('must not reach the DB') } }))
    const { POST } = await import('@/app/api/admin/settings/kyc/route')
    const res = await POST(new Request('http://x/api/admin/settings/kyc', { method: 'POST', body: '{}' }) as never)
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('admin_2fa_required')
  })
})

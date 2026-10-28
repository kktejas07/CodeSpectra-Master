/**
 * Route-level authz: call real handlers with a mocked caller per role/tenant.
 * Covers cron auth (Bearer only), codeathon analytics (staff only),
 * collab docs (interview participants only) and the audit-log write
 * (tenant admin allowed, tenant stamped; plain users denied).
 * Run: npx vitest run tests/route-authz.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

type Caller = { id: string; email: string; role: string; tenantId?: string | null } | null
const who: { user: Caller } = { user: null }
const written: Record<string, unknown>[] = []

const fakeDb = {
  docs: {} as Record<string, Record<string, unknown> | null>,
  collection(name: string) {
    return {
      findOne: async () => fakeDb.docs[name] ?? null,
      find: () => ({ toArray: async () => [], sort: () => ({ limit: () => ({ toArray: async () => [] }) }) }),
      countDocuments: async () => 0,
      insertOne: async () => ({}),
    }
  },
  command: async () => ({ ok: 1 }),
}

vi.mock('@/lib/mongodb', () => ({ getMongoDb: async () => fakeDb }))
vi.mock('@/lib/cron-heartbeat', () => ({ withCronHeartbeat: (_n: string, fn: unknown) => fn }))
vi.mock('@/lib/db/interviews', () => ({ interviewSessions: async () => fakeDb.collection('interview_sessions') }))
vi.mock('@/lib/db/collab', () => ({
  collabDocuments: async () => fakeDb.collection('collab_documents'),
  getOrCreateDocument: async () => null,
  nowIso: () => new Date().toISOString(),
  newId: () => 'id',
}))
vi.mock('@/lib/db/misc', () => ({
  writeAuditLog: async (e: Record<string, unknown>) => { written.push(e) },
  adminAuditLogs: async () => fakeDb.collection('admin_audit_logs'),
}))
vi.mock('@/lib/route-auth', () => {
  const unauth = { error: 'Unauthorized', status: 401 as const }
  return {
    getAPIUser: async () => who.user,
    requireAuth: async () => (who.user ? { user: who.user } : unauth),
    requireAdmin: async () => {
      const u = who.user
      if (!u) return unauth
      if (u.role === 'superadmin' || (u.role === 'tenant_admin' && u.tenantId)) return { user: u }
      return { error: 'Forbidden - Admin access required', status: 403 as const }
    },
    requireSuperAdmin: async () => {
      const u = who.user
      if (!u) return unauth
      return u.role === 'superadmin' ? { user: u } : { error: 'Forbidden', status: 403 as const }
    },
  }
})

const params = <T,>(p: T) => ({ params: Promise.resolve(p) })

beforeEach(() => {
  who.user = null
  written.length = 0
  fakeDb.docs = {}
})

describe('cron: Bearer only', () => {
  const OLD = process.env.CRON_SECRET
  beforeEach(() => { process.env.CRON_SECRET = 'cron-s3cret' })
  afterEach(() => { process.env.CRON_SECRET = OLD })

  it('security-scan rejects ?secret= and accepts the Bearer header', async () => {
    const { POST } = await import('@/app/api/cron/security-scan/route')
    const viaQuery = await POST(new Request('http://x/api/cron/security-scan?secret=cron-s3cret', { method: 'POST', body: '{}' }) as never)
    expect(viaQuery.status).toBe(403)
    const viaHeader = await POST(new Request('http://x/api/cron/security-scan', {
      method: 'POST', body: '{}', headers: { authorization: 'Bearer cron-s3cret' },
    }) as never)
    expect(viaHeader.status).toBe(400) // past auth: body validation
  })

  it('status-check answers POST (admin "Run now") and requires auth', async () => {
    const mod = await import('@/app/api/cron/status-check/route')
    expect(typeof mod.POST).toBe('function')
    const res = await mod.POST(new Request('http://x/api/cron/status-check?secret=cron-s3cret', { method: 'POST' }) as never)
    expect(res.status).toBe(401) // no Bearer, no session
  })
})

describe('codeathon analytics: staff only', () => {
  it('denies a participant and another tenant\'s admin; allows own tenant admin', async () => {
    const { GET } = await import('@/app/api/codeathons/[id]/analytics/route')
    fakeDb.docs.codeathons = { id: 'c1', tenant_id: 't1', problems: [] }
    const req = new Request('http://x') as never

    who.user = { id: 'u1', email: 'u@x', role: 'user' }
    expect((await GET(req, params({ id: 'c1' }))).status).toBe(403)

    who.user = { id: 'a2', email: 'a@x', role: 'tenant_admin', tenantId: 't2' }
    expect((await GET(req, params({ id: 'c1' }))).status).toBe(403)

    who.user = { id: 'a1', email: 'a@x', role: 'tenant_admin', tenantId: 't1' }
    expect((await GET(req, params({ id: 'c1' }))).status).toBe(200)
  })
})

describe('collab docs: interview participants only', () => {
  it('denies a signed-in stranger and allows the candidate', async () => {
    const { GET } = await import('@/app/api/collab/[session]/route')
    fakeDb.docs.interview_sessions = { id: 'iv1', interviewer_id: 'int1', candidate_id: 'cand1', tenant_id: 't1' }
    const req = { nextUrl: new URL('http://x/api/collab/iv1') } as never

    who.user = { id: 'stranger', email: 's@x', role: 'user' }
    expect((await GET(req, params({ session: 'iv1' }))).status).toBe(403)

    who.user = { id: 'cand1', email: 'c@x', role: 'user' }
    expect((await GET(req, params({ session: 'iv1' }))).status).toBe(200)
  })

  it('denies when the interview does not exist', async () => {
    const { GET } = await import('@/app/api/collab/[session]/route')
    who.user = { id: 'u', email: 'u@x', role: 'superadmin' }
    const req = { nextUrl: new URL('http://x/api/collab/none') } as never
    expect((await GET(req, params({ session: 'none' }))).status).toBe(403)
  })
})

describe('audit-log write', () => {
  const post = (body: unknown) =>
    new Request('http://x/api/admin/audit-log', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }) as never

  it('lets a tenant admin record an action, stamped with their tenant', async () => {
    const { POST } = await import('@/app/api/admin/audit-log/route')
    who.user = { id: 'a1', email: 'a@x', role: 'tenant_admin', tenantId: 't1' }
    const res = await POST(post({ action: 'release_scores', target: 'exam1', details: 'ok' }))
    expect(res.status).toBe(200)
    expect(written[0]).toMatchObject({ action: 'release_scores', resource: 'exam1', tenant_id: 't1', user_id: 'a1' })
  })

  it('denies a plain user and rejects a malformed action', async () => {
    const { POST } = await import('@/app/api/admin/audit-log/route')
    who.user = { id: 'u1', email: 'u@x', role: 'user' }
    expect((await POST(post({ action: 'x', target: 'y' }))).status).toBe(403)
    who.user = { id: 's', email: 's@x', role: 'superadmin' }
    expect((await POST(post({ action: 'Bad Action!', target: 'y' }))).status).toBe(400)
    expect(written).toHaveLength(0)
  })
})

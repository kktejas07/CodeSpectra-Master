import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  computeCodeathonStandings,
  countUnscored,
  certificateKindFor,
  codeathonCertificateWording,
  releaseWarnings,
  sanitizeCertificatePolicy,
  ordinal,
  publicName,
  type CodeathonEntrantInfo,
} from '@/lib/codeathon-results'
import { eventListTenantFilter, canUseProblem, canEditProblemAsAdmin, unusableProblemSlugs } from '@/lib/hackathons/tenant-scope'
import { getRequiredRoleForRoute, isPlatformAdminRoute } from '@/lib/page-permissions'

// ─── Tiny in-memory Mongo (enough for the release route) ─────────────────────

type Doc = Record<string, any>
function matches(doc: Doc, filter: Doc): boolean {
  return Object.entries(filter || {}).every(([k, cond]) => {
    if (k === '$or') return (cond as Doc[]).some((f) => matches(doc, f))
    if (k === '$and') return (cond as Doc[]).every((f) => matches(doc, f))
    const v = doc[k]
    if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
      if ('$ne' in cond) return v !== cond.$ne
      if ('$in' in cond) return (cond.$in as unknown[]).includes(v)
      if ('$exists' in cond) return (v !== undefined) === cond.$exists
    }
    if (cond === null) return v === null || v === undefined
    return v === cond
  })
}
function makeDb() {
  const data = new Map<string, Doc[]>()
  const col = (name: string) => {
    if (!data.has(name)) data.set(name, [])
    const rows = data.get(name)!
    return {
      rows,
      createIndex: async () => 'ok',
      findOne: async (f: Doc) => {
        const r = rows.find((d) => matches(d, f))
        return r ? { ...r } : null
      },
      find: (f: Doc) => ({ toArray: async () => rows.filter((d) => matches(d, f)).map((d) => ({ ...d })) }),
      countDocuments: async (f: Doc) => rows.filter((d) => matches(d, f)).length,
      insertOne: async (d: Doc) => { rows.push({ ...d }); return { insertedId: 'x' } },
      updateOne: async (f: Doc, u: Doc, opts?: { upsert?: boolean }) => {
        const r = rows.find((d) => matches(d, f))
        if (r) {
          if (u.$set) Object.assign(r, u.$set)
          return { matchedCount: 1, modifiedCount: u.$set ? 1 : 0, upsertedCount: 0 }
        }
        if (opts?.upsert) {
          const eq = Object.fromEntries(Object.entries(f).filter(([, v]) => v === null || typeof v !== 'object'))
          rows.push({ ...eq, ...(u.$setOnInsert || {}), ...(u.$set || {}) })
          return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 }
        }
        return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 }
      },
    }
  }
  return { collection: col, data }
}

let fakeDb = makeDb()
const who: { user: Doc | null } = { user: null }
const xpEvents: Doc[] = []
const notes: Doc[] = []

vi.mock('@/lib/mongodb', () => ({ getMongoDb: async () => fakeDb }))
vi.mock('@/lib/route-auth', () => ({ getAPIUser: async () => who.user }))
vi.mock('@/lib/db/admin', () => ({ users: async () => fakeDb.collection('user') }))
vi.mock('@/lib/notifications', () => ({ notify: async (n: Doc) => { notes.push(n); return { id: 'n' } } }))
vi.mock('@/lib/db/leaderboard', () => ({
  awardXp: async (a: Doc) => {
    if (xpEvents.some((e) => e.userId === a.userId && e.submissionId === a.submissionId && e.reason === a.reason)) return null
    xpEvents.push(a)
    return 'xp'
  },
}))

// ─── Pure rules ──────────────────────────────────────────────────────────────

const ent = (id: string, name = id): [string, CodeathonEntrantInfo] => [id, { entrant_id: id, kind: 'user', name, member_ids: [id] }]

describe('computeCodeathonStandings', () => {
  it('sums the best score per problem, shares ranks on ties and leaves zero totals unranked', () => {
    const subs = [
      { user_id: 'a', problem_id: 'p1', score: 50, status: 'wrong_answer' },
      { user_id: 'a', problem_id: 'p1', score: 100, status: 'accepted' },
      { user_id: 'a', problem_id: 'p1', score: 100, status: 'accepted' }, // resubmit: no inflation
      { user_id: 'b', problem_id: 'p1', score: 100, status: 'accepted' },
      { user_id: 'c', problem_id: 'p1', score: 40, status: 'wrong_answer' },
      { user_id: 'd', problem_id: 'p1', score: 0, status: 'wrong_answer' },
    ]
    const rows = computeCodeathonStandings(subs, new Map([ent('a'), ent('b'), ent('c'), ent('d')]), false)
    expect(rows.map((r) => [r.entrant_id, r.rank, r.tied, r.total_score])).toEqual([
      ['a', 1, true, 100],
      ['b', 1, true, 100],
      ['c', 3, false, 40],
      ['d', null, false, 0],
    ])
    expect(rows[0].problems_solved).toBe(1)
  })

  it('ignores judge-rejected and still-grading submissions but keeps the entrant', () => {
    const subs = [
      { user_id: 'a', problem_id: 'p1', score: 100, status: 'rejected' },
      { user_id: 'a', problem_id: 'p2', score: 30, status: 'running' },
      { user_id: 'b', problem_id: 'p1', score: 10, status: 'wrong_answer' },
    ]
    const rows = computeCodeathonStandings(subs, new Map([ent('a'), ent('b')]), false)
    expect(rows.find((r) => r.entrant_id === 'a')).toMatchObject({ total_score: 0, rank: null })
    expect(rows.find((r) => r.entrant_id === 'b')).toMatchObject({ total_score: 10, rank: 1 })
    expect(countUnscored(subs)).toBe(1)
  })

  it('groups by team in team mode', () => {
    const subs = [
      { user_id: 'u1', team_id: 't1', problem_id: 'p1', score: 100, status: 'accepted' },
      { user_id: 'u2', team_id: 't1', problem_id: 'p2', score: 50, status: 'accepted' },
      { user_id: 'u3', team_id: 't2', problem_id: 'p1', score: 100, status: 'accepted' },
    ]
    const teams = new Map<string, CodeathonEntrantInfo>([
      ['t1', { entrant_id: 't1', kind: 'team', name: 'Alpha', member_ids: ['u1', 'u2'] }],
      ['t2', { entrant_id: 't2', kind: 'team', name: 'Beta', member_ids: ['u3'] }],
    ])
    const rows = computeCodeathonStandings(subs, teams, true)
    expect(rows.map((r) => [r.name, r.rank, r.total_score])).toEqual([['Alpha', 1, 150], ['Beta', 2, 100]])
  })
})

describe('certificate policy and wording', () => {
  it('sanitizes the policy', () => {
    expect(sanitizeCertificatePolicy(undefined)).toEqual({ audience: 'all', top_n: 3 })
    expect(sanitizeCertificatePolicy({ audience: 'top_n', top_n: 0 })).toEqual({ audience: 'top_n', top_n: 1 })
    expect(sanitizeCertificatePolicy({ audience: 'bogus', top_n: 9999 })).toEqual({ audience: 'all', top_n: 100 })
  })

  it('gives rank wording to the top N, participation to the rest (or nothing)', () => {
    const all = { audience: 'all' as const, top_n: 3 }
    const top = { audience: 'top_n' as const, top_n: 3 }
    expect(certificateKindFor({ rank: 1 }, all)).toBe('rank')
    expect(certificateKindFor({ rank: 3 }, all)).toBe('rank')
    expect(certificateKindFor({ rank: 4 }, all)).toBe('participation')
    expect(certificateKindFor({ rank: null }, all)).toBe('participation')
    expect(certificateKindFor({ rank: 4 }, top)).toBeNull()
    expect(certificateKindFor({ rank: 1 }, { audience: 'none', top_n: 3 })).toBeNull()
  })

  it('words ranked and participation certificates without a percentage', () => {
    expect(codeathonCertificateWording('rank', { rank: 2, tied: true }, 40)).toEqual({ level: '2nd place (tied)', scoreLabel: 'Ranked #2 (tied) of 40' })
    expect(codeathonCertificateWording('participation', { rank: null, tied: false }, 40).level).toBe('Participant')
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '101st'])
  })

  it('never shows an email as a public name', () => {
    expect(publicName('a@b.com')).toBe('Participant')
    expect(publicName('  Ada  ')).toBe('Ada')
  })

  it('warns before an early or partly graded release', () => {
    expect(releaseWarnings({ ended: true, unscored: 0, entrants: 3 })).toEqual([])
    expect(releaseWarnings({ ended: false, unscored: 2, entrants: 3 })).toHaveLength(2)
  })
})

describe('event admin tenant scope', () => {
  it('scopes company admins to their tenant and denies a missing tenant', () => {
    expect(eventListTenantFilter({ role: 'tenant_admin', tenantId: 't1' })).toEqual({ tenant_id: 't1' })
    expect(eventListTenantFilter({ role: 'tenant_admin', tenantId: null }, 't2')).toEqual({ _id: null })
    expect(eventListTenantFilter({ role: 'tenant_admin', tenantId: 't1' }, 't2')).toEqual({ tenant_id: 't1' })
  })

  it('lets superadmin filter by tenant or platform events', () => {
    expect(eventListTenantFilter({ role: 'superadmin' })).toEqual({})
    expect(eventListTenantFilter({ role: 'superadmin' }, 'global')).toEqual({ tenant_id: null })
    expect(eventListTenantFilter({ role: 'superadmin' }, 't9')).toEqual({ tenant_id: 't9' })
    expect(eventListTenantFilter({ role: 'superadmin' }, '{"$ne":1}')).toEqual({})
  })

  it('company admins use platform + own problems and edit only their own', () => {
    const me = { role: 'tenant_admin', tenantId: 't1', id: 'u1' }
    expect(canUseProblem(me, { tenant_id: null })).toBe(true)
    expect(canUseProblem(me, { tenant_id: 't1' })).toBe(true)
    expect(canUseProblem(me, { tenant_id: 't2' })).toBe(false)
    expect(canEditProblemAsAdmin(me, { tenant_id: null })).toBe(false)
    expect(canEditProblemAsAdmin(me, { tenant_id: 't1' })).toBe(true)
    expect(canUseProblem({ role: 'user' }, { tenant_id: null })).toBe(false)
    expect(unusableProblemSlugs(me, ['a', 'b', 'c'], [{ slug: 'a' }, { slug: 'b', tenant_id: 't2' }])).toEqual(['b', 'c'])
    expect(unusableProblemSlugs({ role: 'superadmin' }, ['x'], [])).toEqual([])
  })

  it('opens hackathon and codeathon admin pages to tenant admins', () => {
    for (const r of ['/dashboard/admin/hackathons', '/dashboard/admin/hackathons/abc', '/dashboard/admin/hackathons/abc/report', '/dashboard/admin/hackathons/edit/abc', '/dashboard/admin/codeathons']) {
      expect(getRequiredRoleForRoute(r)).toBe('tenant_admin')
      expect(isPlatformAdminRoute(r)).toBe(false)
    }
    expect(getRequiredRoleForRoute('/dashboard/admin/question-bank')).toBe('superadmin')
  })
})

// ─── Release route: claim once, certificates and XP once ─────────────────────

describe('POST /api/codeathons/[id]/release', () => {
  const past = new Date(Date.now() - 3600_000).toISOString()
  beforeEach(() => {
    fakeDb = makeDb()
    xpEvents.length = 0
    notes.length = 0
    const c = (n: string) => fakeDb.collection(n).rows
    c('codeathons').push({ id: 'c1', title: 'Spring codeathon', tenant_id: 't1', startDate: past, endDate: past, status: 'active', event_type: 'individual' })
    c('user').push({ id: 'a', fullName: 'Ada', email: 'ada@x.com' }, { id: 'b', name: 'Bob' }, { id: 'c', name: 'cy@x.com' })
    c('codeathon_submissions').push(
      { codeathon_id: 'c1', user_id: 'a', problem_id: 'p1', score: 100, status: 'accepted' },
      { codeathon_id: 'c1', user_id: 'b', problem_id: 'p1', score: 60, status: 'wrong_answer' },
      { codeathon_id: 'c1', user_id: 'c', problem_id: 'p1', score: 0, status: 'wrong_answer' },
    )
  })

  async function call(body: Doc, method: 'POST' | 'GET' = 'POST') {
    const mod = await import('@/app/api/codeathons/[id]/release/route')
    const req = new Request('http://x/api/codeathons/c1/release', method === 'POST' ? { method, body: JSON.stringify(body) } : { method })
    const ctx = { params: Promise.resolve({ id: 'c1' }) }
    const res = method === 'POST' ? await mod.POST(req, ctx) : await mod.GET(req, ctx)
    return { status: res.status, json: (await res.json()) as Doc }
  }

  it('denies another tenant’s admin and a tenant admin without a tenant', async () => {
    who.user = { id: 'x', role: 'tenant_admin', tenantId: 't2' }
    expect((await call({})).status).toBe(403)
    who.user = { id: 'x', role: 'tenant_admin', tenantId: null }
    expect((await call({})).status).toBe(403)
    who.user = { id: 'x', role: 'user', tenantId: 't1' }
    expect((await call({})).status).toBe(403)
  })

  it('releases once: freezes standings, issues certificates and XP exactly once', async () => {
    who.user = { id: 'admin', role: 'tenant_admin', tenantId: 't1' }
    const first = await call({ certificate_policy: { audience: 'all', top_n: 1 } })
    expect(first.status).toBe(200)
    expect(first.json.certificates_issued).toBe(3)

    const certs = fakeDb.collection('certification_attempts').rows
    expect(certs).toHaveLength(3)
    const ada = certs.find((c) => c.user_id === 'a')!
    expect(ada.cert_snapshot.level).toBe('1st place')
    expect(ada.issue_key).toBe('codeathon:c1:a')
    expect(certs.find((c) => c.user_id === 'b')!.cert_snapshot.level).toBe('Participant')
    // Email-looking names never reach the certificate.
    expect(certs.find((c) => c.user_id === 'c')!.snapshot.name).toBe('Participant')
    expect(certs.every((c) => c.passed === true && typeof c.verify_token === 'string')).toBe(true)

    expect(fakeDb.collection('codeathons').rows[0]).toMatchObject({ results_released: true, status: 'completed' })
    const snap = fakeDb.collection('codeathon_results').rows[0]
    expect(snap.standings.map((s: Doc) => s.rank)).toEqual([1, 2, null])
    expect(xpEvents.map((e) => [e.userId, e.amount])).toEqual([['a', 100], ['b', 60]])
    expect(notes).toHaveLength(3)

    // A second release is refused and changes nothing.
    const again = await call({ force: true })
    expect(again.status).toBe(409)
    expect(again.json.code).toBe('already_released')

    // Re-issue is idempotent: no new certificates, XP or notifications.
    const re = await call({ reissue: true })
    expect(re.status).toBe(200)
    expect(re.json).toMatchObject({ certificates_issued: 0, certificates_existing: 3 })
    expect(certs).toHaveLength(3)
    expect(xpEvents).toHaveLength(2)
    expect(notes).toHaveLength(3)
  })

  it('asks for confirmation before the end and only top-N certificates when configured', async () => {
    fakeDb.collection('codeathons').rows[0].endDate = new Date(Date.now() + 3600_000).toISOString()
    fakeDb.collection('codeathons').rows[0].status = 'active'
    who.user = { id: 'root', role: 'superadmin' }
    const warn = await call({})
    expect(warn.status).toBe(409)
    expect(warn.json.code).toBe('confirm_release')
    expect(fakeDb.collection('codeathons').rows[0].results_released).toBeUndefined()

    const ok = await call({ force: true, certificate_policy: { audience: 'top_n', top_n: 1 } })
    expect(ok.status).toBe(200)
    expect(fakeDb.collection('certification_attempts').rows.map((c) => c.user_id)).toEqual(['a'])
  })
})

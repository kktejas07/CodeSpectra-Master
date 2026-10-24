/**
 * SEC-037 follow-up: learner-published problems go back to review (one-time
 * sweep), and only a superadmin (with admin 2FA) can approve one.
 *
 * Run: npx vitest run tests/problems-learner-review.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { auditDetail, creatorIds, problemKnowledgeId, selectLearnerProblems, type ProblemAuthorRow } from '@/lib/problems/learner-review-core'

const row = (o: Partial<ProblemAuthorRow>): ProblemAuthorRow => ({ _id: o.id ?? 'x', is_published: true, ...o })

describe('selectLearnerProblems', () => {
  const roles = new Map<string, string | null>([
    ['admin', 'superadmin'], ['org', 'tenant_admin'], ['judge', 'judge'], ['learner', 'user'], ['norole', null], ['weird', 'recruiter'],
  ])
  it('picks learner, role-less, unknown-role and deleted creators only', () => {
    const rows = [
      row({ id: 'p1', created_by: 'admin' }),
      row({ id: 'p2', created_by: 'org' }),
      row({ id: 'p3', created_by: 'judge' }),
      row({ id: 'p4', created_by: 'learner' }),
      row({ id: 'p5', created_by: 'norole' }),
      row({ id: 'p6', created_by: 'gone' }),
      row({ id: 'p7', created_by: 'weird' }),
    ]
    expect(selectLearnerProblems(rows, roles).map((r) => r.id)).toEqual(['p4', 'p5', 'p6', 'p7'])
  })
  it('leaves seed problems (no created_by), unpublished and hackathon-only problems alone', () => {
    const rows = [
      row({ id: 's1' }),
      row({ id: 's2', created_by: '' }),
      row({ id: 's3', created_by: null }),
      row({ id: 'u1', created_by: 'learner', is_published: false }),
      row({ id: 'h1', created_by: 'learner', visibility: 'hackathon_only' }),
    ]
    expect(selectLearnerProblems(rows, roles)).toEqual([])
  })
  it('is idempotent: once unpublished, a second pass selects nothing', () => {
    const rows = [row({ id: 'p4', created_by: 'learner' })]
    const first = selectLearnerProblems(rows, roles)
    const after = rows.map((r) => (first.includes(r) ? { ...r, is_published: false } : r))
    expect(selectLearnerProblems(after, roles)).toEqual([])
  })
  it('helpers: creator ids de-duplicated, knowledge id falls back to slug, audit detail is ids only and capped', () => {
    expect(creatorIds([row({ created_by: 'a' }), row({ created_by: 'a' }), row({ created_by: ' ' }), row({})])).toEqual(['a'])
    expect(problemKnowledgeId({ id: null, slug: 'two-sum' })).toBe('two-sum')
    expect(auditDetail([])).toBe('count=0')
    expect(auditDetail(['a', 'b', 'c'], 2)).toBe('count=3 ids=a,b +1 more')
  })
})

// ─── Sweep (fake db) ─────────────────────────────────────────────────────────

describe('runLearnerProblemSweep', () => {
  beforeEach(() => vi.resetModules())

  it('unpublishes learner problems, de-indexes, audits the count, sets the done flag, then skips', async () => {
    const problemsRows = [
      { _id: 1, id: 'p1', created_by: 'admin', is_published: true },
      { _id: 2, id: 'p2', created_by: 'learner', is_published: true },
      { _id: 3, slug: 'p3', created_by: 'gone', is_published: true },
    ]
    const flags = new Map<string, unknown>()
    const updates: unknown[] = []
    const indexed: string[][] = []
    const audits: { detail?: string }[] = []
    const db = {
      collection: (name: string) => ({
        find: () => ({ toArray: async () => (name === 'problems' ? problemsRows : [{ _id: 'admin', role: 'superadmin' }, { _id: 'learner', role: 'user' }]) }),
        findOne: async (q: { _id: string }) => (name === 'one_time_jobs' && flags.has(q._id) ? { _id: q._id } : null),
        updateMany: async (f: unknown, u: unknown) => { updates.push({ f, u }) },
        updateOne: async (q: { _id: string }, u: unknown) => { flags.set(q._id, u) },
      }),
    }
    vi.doMock('@/lib/mongodb', () => ({ getMongoDb: async () => db }))
    vi.doMock('@/lib/db/misc', () => ({ writeAuditLog: async (e: { detail?: string }) => { audits.push(e) } }))
    vi.doMock('@/lib/rag/hooks', () => ({ knowledgeOnLibraryChange: (_t: string, ids: string[]) => { indexed.push(ids) } }))
    const m = await import('@/lib/problems/learner-review')
    const r = await m.runLearnerProblemSweep(new Date('2026-10-24T00:00:00Z'))
    expect(r).toEqual({ count: 2, skipped: false })
    const u = updates[0] as { f: { _id: { $in: unknown[] } }; u: { $set: Record<string, unknown> } }
    expect(u.f._id.$in).toEqual([2, 3])
    expect(u.u.$set).toMatchObject({ is_published: false, review_status: 'pending_review' })
    expect(indexed).toEqual([['p2', 'p3']])
    expect(audits[0].detail).toBe('count=2 ids=p2,p3')
    expect(flags.size).toBe(1)
    m.__resetLearnerSweepCache()
    expect(await m.runLearnerProblemSweep()).toEqual({ count: 0, skipped: true })
    expect(updates).toHaveLength(1)
  })
})

// ─── Approve route guard ─────────────────────────────────────────────────────

describe('POST /api/admin/problems/[id]/approve', () => {
  const state: { caller: Record<string, unknown> | null; approved: string[]; pending: Set<string> } = { caller: null, approved: [], pending: new Set() }

  beforeEach(() => {
    vi.resetModules()
    state.caller = null
    state.approved = []
    state.pending = new Set(['p2'])
    vi.doMock('@/lib/route-auth', async () => {
      const real = await vi.importActual<typeof import('@/lib/route-auth')>('@/lib/route-auth')
      return {
        gateErrorBody: real.gateErrorBody,
        requireSuperAdmin: async () => {
          const c = state.caller
          if (!c) return { error: 'Unauthorized', status: 401 }
          if (c.role !== 'superadmin') return { error: 'Forbidden', status: 403 }
          if (c.adminTwoFactorRequired) return { error: 'Set up two-factor', status: 403, code: 'admin_2fa_required' }
          return { user: c }
        },
      }
    })
    vi.doMock('@/lib/admin-audit', () => ({ auditAdmin: async () => undefined }))
    vi.doMock('@/lib/problems/learner-review', () => ({
      approvePendingProblem: async (id: string) => {
        if (!state.pending.has(id)) return null
        state.pending.delete(id)
        state.approved.push(id)
        return id
      },
    }))
  })

  const call = async (id: string) => {
    const { POST } = await import('@/app/api/admin/problems/[id]/approve/route')
    return POST(new Request(`http://x/api/admin/problems/${id}/approve`, { method: 'POST' }), { params: Promise.resolve({ id }) })
  }

  it('401 signed out, 403 for a learner, a tenant admin and a superadmin who owes 2FA', async () => {
    expect((await call('p2')).status).toBe(401)
    state.caller = { id: 'u1', role: 'user' }
    expect((await call('p2')).status).toBe(403)
    state.caller = { id: 't1', role: 'tenant_admin', tenantId: 't' }
    expect((await call('p2')).status).toBe(403)
    state.caller = { id: 'a1', role: 'superadmin', adminTwoFactorRequired: true }
    const res = await call('p2')
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('admin_2fa_required')
    expect(state.approved).toEqual([])
  })

  it('superadmin approves a pending problem; a second approve or a bad id fails', async () => {
    state.caller = { id: 'a1', role: 'superadmin' }
    const ok = await call('p2')
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual({ ok: true, id: 'p2' })
    expect((await call('p2')).status).toBe(404)
    expect((await call('bad id!')).status).toBe(400)
  })
})

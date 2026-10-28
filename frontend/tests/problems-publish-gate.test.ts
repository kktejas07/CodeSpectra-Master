/**
 * SEC-037: only admins add problems to the public practice library and the
 * platform knowledge index. A learner can't create one, and a learner who
 * authored a problem earlier can't publish it (edits keep it a private draft).
 *
 * Run: npx vitest run tests/problems-publish-gate.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const state: {
  caller: Record<string, unknown> | null
  inserted: Record<string, unknown>[]
  updates: Record<string, unknown>[]
  indexed: string[]
  doc: Record<string, unknown> | null
} = { caller: null, inserted: [], updates: [], indexed: [], doc: null }

const learner = { id: 'u1', email: 'l@x.test', role: 'user' }
const admin = { id: 'a1', email: 'a@x.test', role: 'superadmin' }

beforeEach(() => {
  vi.resetModules()
  state.caller = null
  state.inserted = []
  state.updates = []
  state.indexed = []
  state.doc = null
  vi.doMock('@/lib/route-auth', async () => {
    const real = await vi.importActual<typeof import('@/lib/route-auth')>('@/lib/route-auth')
    return {
      gateErrorBody: real.gateErrorBody,
      isAdminCaller: real.isAdminCaller,
      isSuperAdminCaller: real.isSuperAdminCaller,
      getAPIUser: async () => state.caller,
      requireAuth: async () => (state.caller ? { user: state.caller } : { error: 'Unauthorized', status: 401 }),
      requireAdmin: async () => {
        if (!state.caller) return { error: 'Unauthorized', status: 401 }
        if (!real.isAdminCaller(state.caller as never)) return { error: 'Forbidden - Admin access required', status: 403 }
        return { user: state.caller }
      },
      requireSuperAdmin: async () => ({ error: 'Forbidden', status: 403 }),
    }
  })
  vi.doMock('@/lib/db/problems', () => ({
    nowIso: () => '2026-10-24T00:00:00.000Z',
    newId: () => 'p_new',
    problems: async () => ({
      findOne: async (q: Record<string, unknown>) => ('slug' in q ? null : state.doc),
      insertOne: async (d: Record<string, unknown>) => { state.inserted.push(d) },
      updateOne: async (_f: unknown, u: { $set: Record<string, unknown> }) => { state.updates.push(u.$set) },
    }),
  }))
  vi.doMock('@/lib/rag/hooks', () => ({ knowledgeOnLibraryChange: (_t: string, id: string) => { state.indexed.push(id) } }))
  vi.doMock('@/lib/db/seed-problems', () => ({ SEED_PROBLEMS: [] }))
  vi.doMock('@/scripts/seed-problems-bulk', () => ({ SEED_PROBLEMS_BULK: [] }))
  vi.doMock('@/lib/entitlements', () => ({ accessFor: () => ({ packIds: [] }), getPackContext: async () => null, checkProblemAccess: async () => ({ ok: true }), packLockedError: () => null }))
  vi.doMock('@/lib/db/qr-events', () => ({ hackathons: async () => ({ find: () => ({ toArray: async () => [] }) }), hackathonTeams: async () => ({ findOne: async () => null }) }))
})

const post = (body: unknown) => new Request('http://x/api/problems', { method: 'POST', body: JSON.stringify(body) })

describe('SEC-037: POST /api/problems', () => {
  it('refuses a learner and writes nothing', async () => {
    state.caller = learner
    const { POST } = await import('@/app/api/problems/route')
    const res = await POST(post({ title: 'Spam', statement_md: 'x', is_published: true }) as never)
    expect(res.status).toBe(403)
    expect(state.inserted).toEqual([])
    expect(state.indexed).toEqual([])
  })

  it('refuses an admin who still owes two-factor', async () => {
    state.caller = { ...admin, adminTwoFactorRequired: true }
    const { POST } = await import('@/app/api/problems/route')
    const res = await POST(post({ title: 'Two Sum' }) as never)
    expect(res.status).toBe(403)
    expect(state.inserted).toEqual([])
  })

  it('lets an admin publish, and indexes only published problems', async () => {
    state.caller = admin
    const { POST } = await import('@/app/api/problems/route')
    const res = await POST(post({ title: 'Two Sum' }) as never)
    expect(res.status).toBe(201)
    expect(state.inserted[0]).toMatchObject({ is_published: true, created_by: 'a1' })
    expect(state.indexed).toEqual(['p_new'])

    const draft = await POST(post({ title: 'Draft one', is_published: false }) as never)
    expect(draft.status).toBe(201)
    expect(state.indexed).toEqual(['p_new'])
  })
})

describe('SEC-037: PATCH /api/problems/[slug]', () => {
  const patch = (body: unknown) => new Request('http://x/api/problems/mine', { method: 'PATCH', body: JSON.stringify(body) })
  const ctx = { params: Promise.resolve({ slug: 'mine' }) }

  it("a learner's own problem stays a private draft even when they ask to publish", async () => {
    state.caller = learner
    state.doc = { _id: 1, id: 'p1', slug: 'mine', created_by: 'u1', is_published: true }
    const { PATCH } = await import('@/app/api/problems/[slug]/route')
    const res = await PATCH(patch({ title: 'Mine', is_published: true }), ctx)
    expect(res.status).toBe(200)
    expect(state.updates[0]).toMatchObject({ is_published: false })
  })

  it('an admin can publish', async () => {
    state.caller = admin
    state.doc = { _id: 1, id: 'p1', slug: 'mine', created_by: 'u1', is_published: false }
    const { PATCH } = await import('@/app/api/problems/[slug]/route')
    const res = await PATCH(patch({ is_published: true }), ctx)
    expect(res.status).toBe(200)
    expect(state.updates[0]).toMatchObject({ is_published: true })
  })
})

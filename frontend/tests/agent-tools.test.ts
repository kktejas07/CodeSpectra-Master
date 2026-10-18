/**
 * Admin agent tools: arg parsing, permission / tenant checks, propose never
 * writes, execute is idempotent per action, plan limits read as a friendly
 * message. Services are mocked (they are the same functions the API routes
 * call); the idempotency ledger runs against the in-memory Mongo stand-in.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FakeDb } from './helpers/fake-mongo'

const h = vi.hoisted(() => {
  const okR = (data: unknown, status = 200) => ({ ok: true, status, data })
  return {
    db: null as unknown as import('./helpers/fake-mongo').FakeDb,
    okR,
    exams: {
      checkAssessmentLimit: vi.fn(async () => okR(null)),
      buildExamQuestionList: vi.fn(async (i: { count: number }) =>
        Array.from({ length: i.count }, (_, k) => ({ id: `q${Math.random().toString(36).slice(2, 8)}${k}`, type: 'mcq', title: `Q${k}`, prompt: 'p', answer: 'A', score: 10 }))),
      createExam: vi.fn(async (_u: unknown, b: Record<string, unknown>) => okR({ id: `exam_${Math.random().toString(36).slice(2, 8)}`, ...b }, 201)),
      updateExam: vi.fn(async () => okR({ ok: true })),
    },
    invites: {
      createCandidateInvite: vi.fn(async (_u: unknown, i: { email: string }) => okR({ invite_id: `inv_${i.email}`, welcomeEmailSent: true })),
      pendingInvitesForExam: vi.fn(async () => [] as Array<Record<string, unknown>>),
      sendExamInviteReminders: vi.fn(async () => okR({ sent: 1, total: 1 })),
    },
    release: {
      previewExamRelease: vi.fn(async () => okR({ cutoff: 60, unreleased: 3, releasable: 3, pass: 2, fail: 1, skipped_pending: 0, certificates_estimate: 2, issue_certificates: true })),
      releaseExamScores: vi.fn(async () => okR({ released: 3, passed: 2, failed: 1, skipped_pending: 0, cutoff: 60, certificates_issued: 2 })),
    },
    hackathons: {
      createHackathon: vi.fn(), updateHackathon: vi.fn(async () => okR({ status: 'open' })), previewHackathonRelease: vi.fn(), releaseHackathonResults: vi.fn(),
      computeHackathonStatus: vi.fn(),
    },
  }
})

vi.mock('@/lib/mongodb', () => ({ getMongoDb: async () => h.db }))
vi.mock('@/lib/rag/search', () => ({ searchKnowledge: vi.fn(async () => []) }))
vi.mock('@/lib/rag/store', () => ({ ragUploads: async () => h.db.collection('rag_uploads') }))
vi.mock('@/lib/services/exams', () => ({
  ...h.exams,
  screeningTypeOf: (r: unknown) => (['aptitude', 'technical', 'coding', 'mixed'].includes(String(r)) ? r : 'mixed'),
  TYPE_POOL_BY_SCREENING: { aptitude: ['mcq'], technical: ['mcq'], coding: ['coding'], mixed: ['mcq'] },
}))
vi.mock('@/lib/services/invites', () => ({ ...h.invites, EMAIL_RE: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ }))
vi.mock('@/lib/services/exam-release', () => h.release)
vi.mock('@/lib/services/hackathons', () => h.hackathons)
vi.mock('@/lib/services/codeathons', () => ({ createCodeathon: vi.fn(), previewCodeathonRelease: vi.fn(), releaseCodeathonResults: vi.fn(), codeathonProblemFromLibrary: vi.fn() }))
vi.mock('@/lib/services/problems', () => ({ generateCodingProblem: vi.fn(), logGeneratedProblem: vi.fn(), saveGeneratedProblem: vi.fn(), shapeGeneratedProblem: vi.fn() }))
vi.mock('@/lib/services/outcomes', () => ({ recordHiringOutcomes: vi.fn(async () => h.okR({ ok: true, updated: ['u1'], skipped: [] })) }))
vi.mock('@/lib/services/exam-results', () => ({ getExamResults: vi.fn() }))
vi.mock('@/lib/services/certificates', () => ({ findRevocableCertificate: vi.fn(), revokeCertificate: vi.fn(), revokeInputProblem: () => null, CERT_ID_RE: /^[A-Za-z0-9_-]{1,100}$/ }))
vi.mock('@/lib/services/validity', () => ({ getPredictiveValidity: vi.fn() }))

import { ToolInputError, ToolPermissionError, type AgentCaller, type ToolContext } from '@/lib/agent/contract'
import { toolsFor, getTool, ALL_TOOLS } from '@/lib/agent/tools'
import { __setDraftKeyForTests } from '@/lib/agent/tools/seal'
import { fitForModel } from '@/lib/agent/tools/output'
import { friendlyServiceError } from '@/lib/agent/tools/scope'
import { planRecipients, recipientsFromText, pickShortlist } from '@/lib/agent/tools/write/candidates'
import { inviteState, rankResults } from '@/lib/agent/tools/read/tests'
import { applyQuestionChanges } from '@/lib/agent/tools/write/tests'

const A: AgentCaller = { userId: 'admin-a', role: 'tenant_admin', tenantId: 'tenant-a', email: 'a@a.test' }
const B: AgentCaller = { userId: 'admin-b', role: 'tenant_admin', tenantId: 'tenant-b', email: 'b@b.test' }
const SUPER: AgentCaller = { userId: 'root', role: 'superadmin', tenantId: null }
const ctx = (caller: AgentCaller, conversationId = 'c1'): ToolContext => ({ caller, conversationId })

const tool = (name: string) => {
  const t = getTool(name)
  if (!t) throw new Error(`missing tool ${name}`)
  return t
}

/** propose the way the runtime does: parse → propose, args object stored as-is → parse again → execute. */
async function proposeThenConfirm(name: string, raw: unknown, caller: AgentCaller) {
  const t = tool(name)
  const args = await t.parse(raw, ctx(caller))
  const preview = await t.propose!(args, ctx(caller))
  const stored = JSON.parse(JSON.stringify(args))
  return {
    preview,
    stored,
    confirm: async () => t.execute!(await t.parse(stored, ctx(caller)), ctx(caller)),
  }
}

beforeEach(() => {
  h.db = new FakeDb()
  __setDraftKeyForTests(new Uint8Array(32).fill(7))
  vi.clearAllMocks()
  h.db.collection('exams').docs.push(
    { id: 'exam-a', title: 'Backend A', tenant_id: 'tenant-a', published: false, questionList: [{ id: 'q1', type: 'mcq', title: 'One', score: 10, answer: 'secret' }], updatedAt: 't0' },
    { id: 'exam-b', title: 'Backend B', tenant_id: 'tenant-b', published: false, questionList: [{ id: 'q9', type: 'mcq', title: 'Nine', score: 5 }] },
  )
  h.db.collection('hackathons').docs.push({ id: 'hk-a', slug: 'hk-a', name: 'Hack A', tenant_id: 'tenant-a', status: 'draft', tasks: [], judges: [], starts_at: '2030-01-01T00:00:00Z', ends_at: '2030-01-02T00:00:00Z' })
})

describe('registry', () => {
  it('exposes every tool with unique snake_case names and no payment/user-deletion tools', () => {
    const names = ALL_TOOLS.map((t) => t.name)
    expect(new Set(names).size).toBe(names.length)
    for (const n of names) expect(n).toMatch(/^[a-z]+(_[a-z]+)*$/)
    expect(names.some((n) => /pay|refund|charge|delete_user|remove_user/.test(n))).toBe(false)
    for (const t of ALL_TOOLS) {
      expect(t.parameters.type).toBe('object')
      expect(t.kind === 'read' ? t.risk === 'none' && !!t.run : t.risk !== 'none' && !!t.propose && !!t.execute).toBe(true)
    }
  })

  it('toolsFor gives admins the tools and nobody else anything', () => {
    expect(toolsFor(A).length).toBe(ALL_TOOLS.length)
    expect(toolsFor(SUPER).length).toBe(ALL_TOOLS.length)
    expect(toolsFor({ userId: 'x', role: 'tenant_admin', tenantId: null })).toEqual([])
    expect(toolsFor({ userId: 'x', role: 'user' as never, tenantId: 't' })).toEqual([])
    expect(getTool('nope')).toBeUndefined()
  })
})

describe('arg parsing', () => {
  it('rejects unknown keys and bad values with clear messages', async () => {
    const t = tool('create_test')
    await expect(async () => t.parse({ title: 'Backend', colour: 'red' }, ctx(A))).rejects.toThrow(/Unknown argument: colour/)
    await expect(async () => t.parse({ title: 'Backend', experience_band: 'guru' }, ctx(A))).rejects.toThrow(/experience_band.*one of/)
    await expect(async () => t.parse({ title: 'Backend', sections: [{ title: 'MCQ', count: 0 }] }, ctx(A))).rejects.toThrow(/sections\[0\].*count/)
    await expect(async () => t.parse({}, ctx(A))).rejects.toThrow(ToolInputError)
    await expect(async () => tool('update_test').parse({ test_id: 'exam-a' }, ctx(A))).rejects.toThrow(/Nothing to change/)
    await expect(async () => tool('invite_candidates').parse({ test_id: 'exam-a' }, ctx(A))).rejects.toThrow(/candidates/)
    await expect(async () => tool('get_test').parse({ test_id: 'bad id!' }, ctx(A))).rejects.toThrow(/doesn't look like an id/)
    await expect(async () => tool('record_outcomes').parse({ test_id: 'exam-a', candidate_ids: ['u1'], status: 'promoted' }, ctx(A))).rejects.toThrow(/status/)
  })

  it('write args re-parse to the same shape (the runtime re-parses stored args on confirm)', async () => {
    for (const [name, raw] of [
      ['create_test', { title: 'Backend engineer', experience_band: 'mid', skills: ['SQL', 'Go'], sections: [{ title: 'MCQ', count: 3, types: ['mcq'] }], starts_at: '2030-01-01' }],
      ['invite_candidates', { test_id: 'exam-a', candidates: [{ email: 'x@y.co', name: 'X' }], message: 'Hi' }],
      ['record_outcomes', { test_id: 'exam-a', candidate_ids: ['u1', 'u1', 'u2'], status: 'hired' }],
      ['update_test', { test_id: 'exam-a', settings: { pass_mark: 70, experience_band: 'senior' }, remove_question_ids: ['q1'] }],
    ] as const) {
      const t = tool(name)
      const once = await t.parse(raw, ctx(A))
      const twice = await t.parse(JSON.parse(JSON.stringify(once)), ctx(A))
      expect(twice).toEqual(once)
    }
  })

  it('plans recipients: valid, deduped, skips people already invited', () => {
    const list = recipientsFromText('name,email\nAda,ADA@x.io\nada@x.io\nbob@x.io\nnot-an-email\n"Cy, Jr",cy@x.io')
    expect(list.map((r) => r.email.toLowerCase())).toEqual(['ada@x.io', 'ada@x.io', 'bob@x.io', 'cy@x.io'])
    const plan = planRecipients([...list, { email: 'bad' }], new Set(['bob@x.io']))
    expect(plan.send.map((r) => r.email)).toEqual(['ada@x.io', 'cy@x.io'])
    expect(plan.skipped.map((s) => s.reason)).toEqual(['Duplicate in this list', 'Already invited and not submitted', 'Invalid email'])
  })

  it('classifies invites and ranks results', () => {
    const now = Date.parse('2030-01-10T00:00:00Z')
    expect(inviteState({ status: 'pending', expires_at: '2030-02-01' }, false, now)).toBe('pending')
    expect(inviteState({ status: 'used', expires_at: '2030-02-01' }, false, now)).toBe('started')
    expect(inviteState({ status: 'pending', expires_at: '2030-01-01' }, false, now)).toBe('expired')
    expect(inviteState({ status: 'expired' }, true, now)).toBe('submitted')
    const rows = [
      { userId: 'a', score: 50, status: 'completed', released: true, needsReview: false },
      { userId: 'b', score: 90, status: 'completed', released: false, needsReview: false },
      { userId: 'c', score: 90, status: 'completed', released: true, needsReview: false },
      { userId: 'd', score: null, status: 'pending', released: false, needsReview: false },
      { userId: 'e', score: 99, status: 'completed', released: true, needsReview: true },
    ] as never[]
    expect(rankResults(rows).map((r: { rank: number | null }) => r.rank)).toEqual([1, 2, 2, 4, null])
    expect(pickShortlist(rows, { top_n: 2 })).toEqual(['b', 'c'])
    expect(pickShortlist(rows, { min_score: 60, released_only: true })).toEqual(['c'])
  })

  it('applies question adds/removes to sections', () => {
    const exam = { questionList: [{ id: 'q1' }, { id: 'q2' }], sections: [{ id: 's1', title: 'A', question_ids: ['q1', 'q2'] }] }
    const r = applyQuestionChanges(exam, [{ id: 'q3' }], ['q1'], undefined, 'Coding')
    expect(r.questionList.map((q) => q.id)).toEqual(['q2', 'q3'])
    expect(r.sections?.map((s) => [s.title, s.question_ids])).toEqual([['A', ['q2']], ['Coding', ['q3']]])
  })
})

describe('permissions and tenant scope', () => {
  it('tenant_admin cannot read or change another tenant\'s test', async () => {
    const get = tool('get_test')
    await expect(get.run!(await get.parse({ test_id: 'exam-a' }, ctx(B)), ctx(B))).rejects.toThrow(ToolPermissionError)
    const pub = tool('publish_test')
    const args = await pub.parse({ test_id: 'exam-a' }, ctx(B))
    await expect(pub.propose!(args, ctx(B))).rejects.toThrow(/another organisation/)
    const res = await pub.execute!(args, ctx(B))
    expect(res.ok).toBe(false)
    expect(res.message).toMatch(/another organisation/)
    expect(h.exams.updateExam).not.toHaveBeenCalled()
  })

  it('tenant_admin cannot touch another tenant\'s hackathon', async () => {
    const t = tool('get_hackathon')
    await expect(t.run!(await t.parse({ hackathon_id: 'hk-a' }, ctx(B)), ctx(B))).rejects.toThrow(ToolPermissionError)
    const pub = tool('publish_hackathon')
    const args = await pub.parse({ hackathon_id: 'hk-a' }, ctx(B))
    await expect(pub.propose!(args, ctx(B))).rejects.toThrow(ToolPermissionError)
    expect((await pub.execute!(args, ctx(B))).ok).toBe(false)
    expect(h.hackathons.updateHackathon).not.toHaveBeenCalled()
  })

  it('own tenant and superadmin can; answer keys never reach the model', async () => {
    const get = tool('get_test')
    for (const c of [A, SUPER]) {
      const out = await get.run!(await get.parse({ test_id: 'exam-a' }, ctx(c)), ctx(c))
      expect(JSON.stringify(out.data)).not.toContain('secret')
      expect((out.data as { id: string }).id).toBe('exam-a')
    }
  })

  it('denies a tenant_admin without an organisation in every phase', async () => {
    const orphan: AgentCaller = { userId: 'o', role: 'tenant_admin', tenantId: null }
    const t = tool('publish_test')
    await expect(async () => t.parse({ test_id: 'exam-a' }, ctx(orphan))).rejects.toThrow(ToolPermissionError)
    await expect(t.execute!({ test_id: 'exam-a' } as never, ctx(orphan))).rejects.toThrow(ToolPermissionError)
  })
})

describe('propose never writes', () => {
  it('create_test, invite_candidates and release_scores only read', async () => {
    const exams = h.db.collection('exams')
    const writes = ['insertOne', 'updateOne', 'updateMany', 'deleteOne', 'findOneAndUpdate'] as const
    const spies = writes.map((m) => vi.spyOn(exams, m))
    const ledger = vi.spyOn(h.db.collection('agent_tool_executions'), 'insertOne')

    const ct = tool('create_test')
    const p1 = await ct.propose!(await ct.parse({ title: 'Backend engineer', question_count: 4 }, ctx(A)), ctx(A))
    expect((p1.preview.totals as { questions: number }).questions).toBe(4)
    expect(JSON.stringify(p1.preview)).not.toContain('"answer"')

    const inv = tool('invite_candidates')
    const p2 = await inv.propose!(await inv.parse({ test_id: 'exam-a', candidates: [{ email: 'a@x.io' }, { email: 'A@x.io' }, { email: 'b@x.io' }] }, ctx(A)), ctx(A))
    expect(p2.preview.fields).toMatchObject({ Recipients: 2 })

    const rel = tool('release_scores')
    const p3 = await rel.propose!(await rel.parse({ test_id: 'exam-a' }, ctx(A)), ctx(A))
    expect(String(p3.preview.certificates)).toMatch(/2 certificates/)

    for (const s of spies) expect(s).not.toHaveBeenCalled()
    expect(ledger).not.toHaveBeenCalled()
    expect(h.exams.createExam).not.toHaveBeenCalled()
    expect(h.invites.createCandidateInvite).not.toHaveBeenCalled()
    expect(h.release.releaseExamScores).not.toHaveBeenCalled()
  })
})

describe('execute', () => {
  it('saves exactly the previewed draft, once per action', async () => {
    const flow = await proposeThenConfirm('create_test', { title: 'Backend engineer', question_count: 3 }, A)
    const previewIds = (flow.preview.preview.sections as Array<{ questions: Array<{ id: string }> }>)[0].questions.map((q) => q.id)
    const first = await flow.confirm()
    const second = await flow.confirm()
    expect(first.ok).toBe(true)
    expect(h.exams.createExam).toHaveBeenCalledTimes(1)
    expect(h.exams.buildExamQuestionList).toHaveBeenCalledTimes(1) // propose only — confirm reused the sealed draft
    const saved = (h.exams.createExam.mock.calls[0] as unknown as [unknown, Record<string, unknown>, { questionList: Array<{ id: string }> }])[2].questionList.map((q) => q.id)
    expect(saved).toEqual(previewIds)
    expect(second).toMatchObject({ ok: true, replayed: true, data: first.data })
    // created as unpublished, tenant from the session (not from args)
    expect(h.exams.createExam.mock.calls[0][1]).toMatchObject({ published: false })
    expect(h.exams.createExam.mock.calls[0][1]).not.toHaveProperty('tenant_id')
  })

  it('two separate proposals with identical args do not replay each other', async () => {
    const one = await proposeThenConfirm('send_reminders', { test_id: 'exam-a' }, A).catch((e) => e)
    expect(one).toBeInstanceOf(ToolInputError) // nobody pending yet
    h.invites.pendingInvitesForExam.mockResolvedValue([{ id: 'i1', email: 'p@x.io', status: 'pending' }])
    const a1 = await proposeThenConfirm('send_reminders', { test_id: 'exam-a' }, A)
    const a2 = await proposeThenConfirm('send_reminders', { test_id: 'exam-a' }, A)
    await a1.confirm(); await a1.confirm(); await a2.confirm()
    expect(h.invites.sendExamInviteReminders).toHaveBeenCalledTimes(2)
  })

  it('ignores a forged or tampered draft and rebuilds instead', async () => {
    const flow = await proposeThenConfirm('create_test', { title: 'Backend engineer', question_count: 2 }, A)
    flow.stored._draft.data.questionList = [{ id: 'evil', type: 'mcq', title: 'Injected', score: 999 }]
    await flow.confirm()
    const saved = (h.exams.createExam.mock.calls[0] as unknown as [unknown, unknown, { questionList: Array<{ id: string }> }])[2].questionList
    expect(saved.some((q) => q.id === 'evil')).toBe(false)
    expect(h.exams.buildExamQuestionList).toHaveBeenCalledTimes(2)
  })

  it('a draft sealed for one admin is not valid for another', async () => {
    const t = tool('create_test')
    const args = await t.parse({ title: 'Backend engineer', question_count: 2 }, ctx(A))
    await t.propose!(args, ctx(A))
    const other: AgentCaller = { ...A, userId: 'admin-a2' }
    await t.execute!(await t.parse(JSON.parse(JSON.stringify(args)), ctx(other)), ctx(other))
    expect(h.exams.buildExamQuestionList).toHaveBeenCalledTimes(2)
  })
})

describe('plan limits', () => {
  const limitErr = { ok: false, status: 402, error: 'Your organisation has reached its assessments limit for this month. Upgrade your plan to create more.', body: { error: 'x', code: 'plan_limit', limit: 3, plan: 'free' } }

  it('surface as a friendly message in propose and execute', async () => {
    h.exams.checkAssessmentLimit.mockResolvedValueOnce(limitErr as never)
    const t = tool('create_test')
    const err = await t.propose!(await t.parse({ title: 'Backend engineer' }, ctx(A)), ctx(A)).catch((e) => e)
    expect(err).toBeInstanceOf(ToolPermissionError)
    expect(err.message).toMatch(/assessments limit.*\(limit 3 on the free plan\)/)
    expect(h.exams.buildExamQuestionList).not.toHaveBeenCalled()

    const flow = await proposeThenConfirm('create_test', { title: 'Backend engineer', question_count: 1 }, A)
    h.exams.createExam.mockResolvedValueOnce(limitErr as never)
    const res = await flow.confirm()
    expect(res.ok).toBe(false)
    expect(res.message).toMatch(/Upgrade your plan/)
    expect(res.message).not.toMatch(/402|plan_limit/)
  })

  it('maps other service errors to plain language', () => {
    expect(friendlyServiceError({ ok: false, status: 403, error: 'Forbidden - resource belongs to another tenant' })).toBe('That belongs to another organisation.')
    expect(friendlyServiceError({ ok: false, status: 500, error: 'MongoServerError: boom' })).not.toMatch(/Mongo/)
  })
})

describe('output trimming', () => {
  it('keeps model output under the size cap', () => {
    const big = { rows: Array.from({ length: 500 }, (_, i) => ({ i, text: 'x'.repeat(300) })) }
    const out = fitForModel(big)
    expect(JSON.stringify(out).length).toBeLessThanOrEqual(6000)
    expect((out as { _truncated?: boolean })._truncated).toBe(true)
    expect(fitForModel({ a: 1 })).toEqual({ a: 1 })
  })
})

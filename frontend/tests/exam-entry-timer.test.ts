import { describe, expect, it } from 'vitest'
import type { Db } from 'mongodb'
import {
  attemptDeadlineMs,
  attemptTimeState,
  candidateExamView,
  checkExamEntry,
  checkInviteTargets,
  examIdFromTargetUrl,
  examProctoringMode,
  extensionRequired,
  inviteIsForExam,
  isRiskProctorEvent,
  normalizeProctoringFields,
  sanitizeProctorMeta,
  EXAM_SUBMIT_GRACE_MS,
} from '@/lib/exam-access'
import { sanitizeTestCases } from '@/lib/grading'
import { interviewPatch, interviewRole } from '@/lib/interview-access'

// ─── Minimal in-memory Mongo stand-in (only what checkExamEntry touches) ─────

type Doc = Record<string, any>

function matches(doc: Doc, filter: Doc): boolean {
  return Object.entries(filter).every(([k, v]) => {
    if (k === '$or') return (v as Doc[]).some((f) => matches(doc, f))
    if (k === '$expr') return true // the claim test checks the size cap itself
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      if ('$ne' in v) return Array.isArray(doc[k]) ? !doc[k].includes(v.$ne) : doc[k] !== v.$ne
      if ('$in' in v) return (v.$in as unknown[]).includes(doc[k])
    }
    return doc[k] === v
  })
}

function fakeDb(data: Record<string, Doc[]>): Db {
  const collection = (name: string) => {
    const rows = (data[name] ||= [])
    return {
      findOne: async (f: Doc) => rows.find((r) => matches(r, f)) ?? null,
      countDocuments: async (f: Doc) => rows.filter((r) => matches(r, f)).length,
      updateOne: async (f: Doc, u: Doc) => {
        const row = rows.find((r) => matches(r, f))
        if (!row) return { matchedCount: 0, modifiedCount: 0 }
        // the link-claim $expr: size(used_by) < max_uses
        if (f.$expr && (row.used_by?.length ?? 0) >= Number(row.max_uses)) return { matchedCount: 0, modifiedCount: 0 }
        for (const [k, v] of Object.entries(u.$addToSet || {})) row[k] = [...new Set([...(row[k] || []), v])]
        for (const [k, v] of Object.entries(u.$inc || {})) row[k] = (row[k] || 0) + (v as number)
        Object.assign(row, u.$set || {})
        return { matchedCount: 1, modifiedCount: 1 }
      },
      find: (f: Doc) => ({ toArray: async () => rows.filter((r) => matches(r, f)) }),
    }
  }
  return { collection } as unknown as Db
}

const candidate = { id: 'u1', email: 'ana@example.com' }
const baseExam = { id: 'exam1', published: true, access_type: 'invite_only', duration: 60, tenant_id: 't1' }

// ─── Timer / deadline ────────────────────────────────────────────────────────

describe('attempt deadline', () => {
  const start = Date.parse('2026-10-18T10:00:00Z')

  it('is start + duration', () => {
    expect(attemptDeadlineMs({ duration: 30 }, start)).toBe(start + 30 * 60_000)
  })
  it('is capped at the exam end date', () => {
    const ends = '2026-10-18T10:10:00Z'
    expect(attemptDeadlineMs({ duration: 60, ends_at: ends }, start)).toBe(Date.parse(ends))
  })
  it('is null for an untimed exam with no end date', () => {
    expect(attemptDeadlineMs({ duration: 0 }, start)).toBeNull()
    expect(attemptDeadlineMs({}, start)).toBeNull()
  })
})

describe('attemptTimeState', () => {
  const exam = { duration: 10 }
  const startedAt = '2026-10-18T10:00:00.000Z'
  const t0 = Date.parse(startedAt)
  const draft = { attempt_no: 1, attempt_started_at: startedAt }

  it('not started without a draft or for another attempt', () => {
    expect(attemptTimeState(exam, null, 1).status).toBe('not_started')
    expect(attemptTimeState(exam, { ...draft, attempt_no: 1 }, 2).status).toBe('not_started')
  })
  it('running with the remaining time from the server start', () => {
    const s = attemptTimeState(exam, draft, 1, t0 + 4 * 60_000)
    expect(s.status).toBe('running')
    if (s.status === 'running') expect(s.remainingMs).toBe(6 * 60_000)
  })
  it('still accepted inside the grace window, expired after it', () => {
    const deadline = t0 + 10 * 60_000
    expect(attemptTimeState(exam, draft, 1, deadline + EXAM_SUBMIT_GRACE_MS - 1).status).toBe('running')
    expect(attemptTimeState(exam, draft, 1, deadline + EXAM_SUBMIT_GRACE_MS + 1).status).toBe('expired')
  })
  it('a refresh never restarts the clock (state depends only on the stored start)', () => {
    const later = t0 + 9 * 60_000
    const a = attemptTimeState(exam, draft, 1, later)
    const b = attemptTimeState(exam, { ...draft }, 1, later)
    expect(a).toEqual(b)
  })
})

// ─── Entry checks ────────────────────────────────────────────────────────────

describe('checkExamEntry', () => {
  it('invite-only exam without a token is rejected', async () => {
    const r = await checkExamEntry(fakeDb({}), baseExam, candidate, {})
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(403)
  })

  it('unpublished and not-yet-open exams are rejected', async () => {
    expect((await checkExamEntry(fakeDb({}), { ...baseExam, published: false, access_type: 'open' }, candidate, {})).ok).toBe(false)
    const future = new Date(Date.now() + 3600_000).toISOString()
    expect((await checkExamEntry(fakeDb({}), { ...baseExam, access_type: 'open', starts_at: future }, candidate, {})).ok).toBe(false)
  })

  it('closed window is rejected unless the caller enforces the attempt deadline instead', async () => {
    const exam = { ...baseExam, access_type: 'open', ends_at: new Date(Date.now() - 60_000).toISOString() }
    expect((await checkExamEntry(fakeDb({}), exam, candidate, {})).ok).toBe(false)
    expect((await checkExamEntry(fakeDb({}), exam, candidate, {}, { ignoreWindowClose: true })).ok).toBe(true)
  })

  it('invite for another account, another exam, or revoked is rejected', async () => {
    const inv = { token: 'tok', email: 'ana@example.com', exam_id: 'exam1', status: 'pending' }
    const other = await checkExamEntry(fakeDb({ candidate_invites: [{ ...inv, email: 'bob@example.com' }] }), baseExam, candidate, { inviteToken: 'tok' })
    expect(other.ok).toBe(false)
    const wrongExam = await checkExamEntry(fakeDb({ candidate_invites: [{ ...inv, exam_id: 'exam2' }] }), baseExam, candidate, { inviteToken: 'tok' })
    expect(wrongExam.ok).toBe(false)
    const revoked = await checkExamEntry(fakeDb({ candidate_invites: [{ ...inv, status: 'revoked' }] }), baseExam, candidate, { inviteToken: 'tok' })
    expect(revoked.ok).toBe(false)
  })

  it('a used invite still opens a retake when attempts remain (and not after the last one)', async () => {
    const exam = { ...baseExam, allow_retake: true, max_attempts: 2 }
    const data = () => ({
      candidate_invites: [{ token: 'tok', email: 'ana@example.com', exam_id: 'exam1', status: 'used' }],
      exam_submissions: [{ exam_id: 'exam1', user_id: 'u1', attempt_no: 1 }],
    })
    const second = await checkExamEntry(fakeDb(data()), exam, candidate, { inviteToken: 'tok' })
    expect(second.ok).toBe(true)
    if (second.ok) expect(second.attemptNo).toBe(2)
    const d = data()
    d.exam_submissions[0].attempt_no = 2
    expect((await checkExamEntry(fakeDb(d), exam, candidate, { inviteToken: 'tok' })).ok).toBe(false)
  })

  it('open exam that requires personal links rejects a bare entry', async () => {
    const r = await checkExamEntry(fakeDb({}), { ...baseExam, access_type: 'open', require_token_links: true }, candidate, {})
    expect(r.ok).toBe(false)
  })

  it('link max_uses counts distinct accounts, claimed on start', async () => {
    const db = fakeDb({ assessment_links: [{ id: 'l1', exam_id: 'exam1', token: 'lt', max_uses: 1, used_by: [] }] })
    expect((await checkExamEntry(db, baseExam, candidate, { linkToken: 'lt' }, { claimLinkUse: true })).ok).toBe(true)
    // same account again (refresh / resume): still fine
    expect((await checkExamEntry(db, baseExam, candidate, { linkToken: 'lt' }, { claimLinkUse: true })).ok).toBe(true)
    // a second account is over the limit, on start and on submit
    const bob = { id: 'u2', email: 'bob@example.com' }
    expect((await checkExamEntry(db, baseExam, bob, { linkToken: 'lt' }, { claimLinkUse: true })).ok).toBe(false)
    expect((await checkExamEntry(db, baseExam, bob, { linkToken: 'lt' })).ok).toBe(false)
  })
})

describe('invite targets', () => {
  it('parses exam ids from invite links', () => {
    expect(examIdFromTargetUrl('/assessment/abc-123')).toBe('abc-123')
    expect(examIdFromTargetUrl('/assessment/abc-123/cad?x=1')).toBe('abc-123')
    expect(examIdFromTargetUrl('https://codespectra.ai/assessment/abc')).toBe('abc')
    expect(examIdFromTargetUrl('/assessment')).toBeNull()
  })

  it('an invite naming no exam is never a key to one', () => {
    expect(inviteIsForExam({ target_url: '/assessment', assigned_assessments: [] }, 'exam1')).toBe(false)
    expect(inviteIsForExam({ target_url: '/assessment/exam1' }, 'exam1')).toBe(true)
    expect(inviteIsForExam({ target_url: '/assessment/exam10' }, 'exam1')).toBe(false)
    expect(inviteIsForExam({ assigned_assessments: [{ target_url: '/assessment/exam1/cad' }] }, 'exam1')).toBe(true)
  })

  it("tenant admins can only invite to their own tenant's exams", async () => {
    const db = fakeDb({ exams: [{ id: 'mine', tenant_id: 't1' }, { id: 'theirs', tenant_id: 't2' }] })
    const admin = { role: 'tenant_admin' as const, tenantId: 't1' }
    const ok = await checkInviteTargets(db, admin, { target_url: '/assessment/mine' })
    expect(ok).toEqual({ ok: true, examId: 'mine', examIds: ['mine'] })
    const other = await checkInviteTargets(db, admin, { target_url: '/assessment/theirs' })
    expect(other.ok).toBe(false)
    const viaStep = await checkInviteTargets(db, admin, { target_url: '/assessment/mine', assigned_assessments: [{ target_url: '/assessment/theirs' }] })
    expect(viaStep.ok).toBe(false)
    const noTenant = await checkInviteTargets(db, { role: 'tenant_admin', tenantId: null }, { target_url: '/assessment/mine' })
    expect(noTenant.ok).toBe(false)
    expect((await checkInviteTargets(db, admin, { target_url: 'https://evil.example/x' })).ok).toBe(false)
  })
})

// ─── Hidden tests / proctoring settings ──────────────────────────────────────

describe('hidden test cases end to end', () => {
  it('the sanitizer keeps the hidden flag and the candidate view drops hidden cases', () => {
    const cases = sanitizeTestCases([{ input: '1', output: '1' }, { input: '2', output: '4', hidden: true }])
    expect(cases).toEqual([{ input: '1', output: '1' }, { input: '2', output: '4', hidden: true }])
    const view = candidateExamView({ questionList: [{ id: 'q', type: 'coding', test_cases: cases, answer: 'x' }] })
    const q = (view.questionList as Doc[])[0]
    expect(q.test_cases).toEqual([{ input: '1', output: '1' }])
    expect(q.answer).toBeUndefined()
  })
})

describe('proctoring mode', () => {
  it('extension is required only in strict mode (default standard)', () => {
    expect(examProctoringMode({})).toBe('standard')
    expect(extensionRequired({})).toBe(false)
    expect(extensionRequired({ proctoring_mode: 'strict' })).toBe(true)
    const d: Doc = { proctoring_mode: 'lockdown', kind: 'weird', cad_points: '5000' }
    normalizeProctoringFields(d)
    expect(d).toEqual({ proctoring_mode: 'standard', kind: 'standard', cad_points: 1000 })
  })
  it('informational events are not integrity flags; meta is flattened and capped', () => {
    expect(isRiskProctorEvent('tab_blur')).toBe(true)
    expect(isRiskProctorEvent('timer_warning_30min')).toBe(false)
    const m = sanitizeProctorMeta({ 'a.b': 'x'.repeat(900), nested: { $gt: 1 }, n: 3 })
    expect(m.a_b).toHaveLength(500)
    expect(m.nested).toBe('{"$gt":1}')
    expect(m.n).toBe(3)
  })
})

// ─── Interviews ──────────────────────────────────────────────────────────────

describe('interview access', () => {
  const session = { interviewer_id: 'i1', candidate_id: 'c1', tenant_id: 't1' }
  it('participants and own-tenant staff only', () => {
    expect(interviewRole({ id: 'i1', role: 'user', tenantId: null }, session)).toBe('interviewer')
    expect(interviewRole({ id: 'c1', role: 'user', tenantId: null }, session)).toBe('candidate')
    expect(interviewRole({ id: 'x', role: 'tenant_admin', tenantId: 't1' }, session)).toBe('staff')
    expect(interviewRole({ id: 'x', role: 'tenant_admin', tenantId: 't2' }, session)).toBeNull()
    expect(interviewRole({ id: 'x', role: 'tenant_admin', tenantId: null }, { ...session, tenant_id: null })).toBeNull()
    expect(interviewRole({ id: 'x', role: 'user', tenantId: null }, session)).toBeNull()
  })
  it('a candidate can start the session but not grade it', () => {
    expect('error' in interviewPatch('candidate', { overall_score: 100 }, 'now')).toBe(true)
    expect('error' in interviewPatch('candidate', { status: 'completed' }, 'now')).toBe(true)
    const ok = interviewPatch('candidate', { status: 'in_progress' }, 'now')
    expect('set' in ok && ok.set.status).toBe('in_progress')
  })
  it('interviewer values are type-checked', () => {
    const r = interviewPatch('interviewer', { overall_score: 250, feedback: [{ dimension: 'x', score: 'abc' }, { dimension: 'Comms', score: 80 }], notes: { $set: 1 } }, 'now')
    expect('set' in r).toBe(true)
    if ('set' in r) {
      expect(r.set.overall_score).toBe(100)
      expect(r.set.feedback).toEqual([{ dimension: 'Comms', score: 80, feedback: '', suggestions: [] }])
      expect(r.set.notes).toBeUndefined()
    }
  })
})

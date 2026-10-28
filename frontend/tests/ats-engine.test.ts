import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FakeDb } from './helpers/fake-mongo'
import type { AtsApplication, AtsCandidate, AtsJob, PipelineStage } from '@/lib/ats/contract'

const db = { current: new FakeDb() }
vi.mock('@/lib/mongodb', () => ({ getMongoDb: async () => db.current }))
// Other parts' handlers (bot screen, interviews) are not under test here.
vi.mock('@/lib/ats/handlers/index', () => ({}))
const notified: { stage: string; app: string }[] = []
vi.mock('@/lib/ats/notify', () => ({
  notifyStageEntry: vi.fn(async (ctx: { stage: PipelineStage; app: AtsApplication }) => { notified.push({ stage: ctx.stage.id, app: ctx.app.id }) }),
}))
const invites: { email: string; target_url: string; expires_at?: string }[] = []
vi.mock('@/lib/services/invites', () => ({
  createCandidateInvite: vi.fn(async (_actor: unknown, input: { email: string; target_url: string; expires_at?: string }) => {
    invites.push(input)
    return { ok: true, status: 200, data: { invite_id: `inv-${invites.length}`, user: { id: 'user-42' } } }
  }),
}))

import { __resetAtsIndexes, atsApplications, atsCandidates, atsJobs, atsStageRuns } from '@/lib/ats/db'
import { getStageHandler, registerStageHandler } from '@/lib/ats/handlers'
import '@/lib/ats/handlers/screening' // applied + screening
import { onAssessmentScored, sweepAssessmentDeadlines } from '@/lib/ats/handlers/assessment'
import { createCandidateInvite } from '@/lib/services/invites'
import * as engine from '@/lib/ats/engine'
import { createApplication, upsertCandidate } from '@/lib/ats/intake'
import { defaultCriteria } from '@/lib/ats/pipeline'

let customEntries = 0
registerStageHandler({ type: 'custom', async onEnter() { customEntries++ } })

function stage(id: string, type: PipelineStage['type'], extra: Partial<PipelineStage> = {}): PipelineStage {
  return { id, type, name: id, advance: 'auto', on_fail: 'reject', ...extra }
}

async function seed(pipeline: PipelineStage[], opts: { openings?: number; must?: string[] } = {}): Promise<AtsJob> {
  const job: AtsJob = {
    id: `job-${Math.random().toString(36).slice(2)}`,
    tenant_id: 't1', client_id: null, title: 'Backend engineer', openings: opts.openings ?? 1, description: '', skills: [],
    status: 'open', is_public: false, recruiter_ids: [], hiring_manager_ids: [],
    criteria: { ...defaultCriteria(), must_have_skills: opts.must ?? ['python'], must_have_required: true, pass_score: 50 },
    pipeline, created_by: 'u1', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  }
  await (await atsJobs()).insertOne(job)
  return job
}

async function candidate(text: string, email = `c${Math.random().toString(36).slice(2)}@x.com`): Promise<AtsCandidate> {
  const c: AtsCandidate = {
    id: `cand-${Math.random().toString(36).slice(2)}`, tenant_id: 't1', name: 'Asha', email, phone: null, tags: [], source: 'manual',
    resume: { file_name: 'cv.txt', text, uploaded_at: '2026-01-01T00:00:00Z' }, parsed: null, created_at: '', updated_at: '',
  }
  await (await atsCandidates()).insertOne(c)
  return c
}

const getApp = async (id: string) => (await (await atsApplications()).findOne({ id })) as AtsApplication
const getJob = async (id: string) => (await (await atsJobs()).findOne({ id })) as AtsJob
const recruiter = { userId: 'rec-1', tenantId: 't1', role: 'recruiter' as const, clientId: null, email: 'r@x.com' }

beforeEach(() => {
  db.current = new FakeDb()
  __resetAtsIndexes()
  notified.length = 0
  invites.length = 0
  customEntries = 0
})

describe('engine transitions', () => {
  const pipe = () => [
    stage('s_applied', 'applied'),
    stage('s_screen', 'screening', { config: { kind: 'screening' } }),
    stage('s_custom', 'custom', { advance: 'approval', on_fail: 'review' }),
    stage('s_hired', 'hired'),
    stage('s_rejected', 'rejected'),
  ]

  it('auto stages advance on pass; approval stages wait for a recruiter; hired decrements openings and fills the job', async () => {
    const job = await seed(pipe(), { openings: 1 })
    const { application } = await createApplication(job, await candidate('Senior Python developer'), 'manual')
    let app = await getApp(application.id)
    expect(app.stage_id).toBe('s_custom') // applied → screening → custom, all automatic
    expect(app.history.map((h) => h.to)).toEqual(['s_applied', 's_screen', 's_custom'])
    expect(app.history.slice(1).every((h) => h.auto && h.by === 'system')).toBe(true)
    expect(app.match?.score).toBe(100)
    expect(customEntries).toBe(1)

    app = await engine.recordStageResult(app.id, { stage_id: 's_custom', outcome: 'pass', score: 80, at: new Date().toISOString() })
    expect(app.stage_id).toBe('s_custom')
    expect(app.pending_move).toMatchObject({ to: 's_hired', reason: 'Passed s_custom (80/100)' })

    app = await engine.approvePendingMove(recruiter, app.id, true)
    expect(app.stage_id).toBe('s_hired')
    expect(app.status).toBe('hired')
    expect(app.history.at(-1)).toMatchObject({ from: 's_custom', to: 's_hired', by: 'rec-1', auto: false })
    const filled = await getJob(job.id)
    expect(filled.openings).toBe(0)
    expect(filled.status).toBe('filled')
    expect(notified.map((n) => n.stage)).toEqual(['s_applied', 's_screen', 's_custom', 's_hired'])

    // Moving out of hired gives the opening back.
    await engine.moveApplication(recruiter, app.id, 's_custom')
    expect((await getJob(job.id)).openings).toBe(1)
  })

  it('failed screening with on_fail=reject rejects with a reason', async () => {
    const job = await seed(pipe())
    const { application } = await createApplication(job, await candidate('Java and Spring developer'), 'manual')
    const app = await getApp(application.id)
    expect(app.stage_id).toBe('s_rejected')
    expect(app.status).toBe('rejected')
    expect(app.rejection_reason).toMatch(/^Did not pass s_screen/)
    expect(app.match?.missing_must).toEqual(['python'])
    expect(customEntries).toBe(0)
  })

  it('on_fail=hold puts the application on hold; on_fail=review suggests rejection', async () => {
    const job = await seed([stage('s_applied', 'applied'), stage('s_screen', 'screening', { on_fail: 'hold' }), stage('s_hired', 'hired'), stage('s_rejected', 'rejected')])
    const a = (await createApplication(job, await candidate('Rust only'), 'manual')).application
    const held = await getApp(a.id)
    expect(held).toMatchObject({ stage_id: 's_screen', status: 'on_hold' })
    expect(held.history.at(-1)?.reason).toMatch(/^On hold: Did not pass s_screen/)

    const job2 = await seed([stage('s_applied', 'applied'), stage('s_screen', 'screening', { on_fail: 'review' }), stage('s_hired', 'hired'), stage('s_rejected', 'rejected')])
    const b = (await createApplication(job2, await candidate('Rust only'), 'manual')).application
    const reviewed = await getApp(b.id)
    expect(reviewed.stage_id).toBe('s_screen')
    expect(reviewed.pending_move?.to).toBe('s_rejected')
    // A recruiter declines the suggestion: it clears and is logged.
    const kept = await engine.approvePendingMove(recruiter, b.id, false)
    expect(kept.pending_move).toBeNull()
    expect(kept.history.at(-1)?.reason).toMatch(/^Declined suggestion/)
    await expect(engine.approvePendingMove(recruiter, b.id, true)).rejects.toMatchObject({ status: 409 })
  })

  it('onEnter runs once per stage entry (ledger), again on a new entry', async () => {
    const job = await seed([stage('s_applied', 'applied', { advance: 'approval' }), stage('s_custom', 'custom'), stage('s_hired', 'hired'), stage('s_rejected', 'rejected')])
    const a = (await createApplication(job, await candidate('python'), 'manual')).application
    expect((await getApp(a.id)).pending_move?.to).toBe('s_custom')
    let app = await engine.moveApplication(recruiter, a.id, 's_custom')
    expect(customEntries).toBe(1)
    // Replaying the same entry's effects is a no-op.
    const again = await engine.runOnce(engine.stageKey(app), { app, stage: job.pipeline[1] }, () => getStageHandler('custom')!.onEnter!({} as never))
    expect(again).toBe(false)
    expect(customEntries).toBe(1)
    expect(await (await atsStageRuns()).countDocuments({ application_id: a.id, key: engine.stageKey(app) })).toBe(1)
    // Leave and come back: a new entry runs the handler again.
    await engine.moveApplication(recruiter, a.id, 's_applied')
    app = await engine.moveApplication(recruiter, a.id, 's_custom')
    expect(customEntries).toBe(2)
  })

  it('results are idempotent and stale results move nothing', async () => {
    const job = await seed([stage('s_applied', 'applied', { advance: 'approval' }), stage('s_custom', 'custom', { advance: 'approval' }), stage('s_hired', 'hired'), stage('s_rejected', 'rejected')])
    const a = (await createApplication(job, await candidate('python'), 'manual')).application
    await engine.moveApplication(recruiter, a.id, 's_custom')
    const r = { stage_id: 's_custom', outcome: 'pass' as const, score: 70, ref: { kind: 'interview' as const, id: 'i1' }, at: new Date().toISOString() }
    await engine.recordStageResult(a.id, r)
    const once = await getApp(a.id)
    await engine.recordStageResult(a.id, { ...r, at: new Date().toISOString() })
    expect((await getApp(a.id)).results.filter((x) => x.stage_id === 's_custom')).toHaveLength(1)
    expect(once.pending_move?.to).toBe('s_hired')
    // Result for a stage it already left: stored, but no move.
    await engine.moveApplication(recruiter, a.id, 's_applied')
    const after = await engine.recordStageResult(a.id, { stage_id: 's_custom', outcome: 'fail', at: new Date().toISOString() })
    expect(after.stage_id).toBe('s_applied')
    expect(after.status).toBe('active')
  })

  it('rejects concurrent moves and unknown stages; tenant scoped', async () => {
    const job = await seed([stage('s_applied', 'applied', { advance: 'approval' }), stage('s_custom', 'custom'), stage('s_hired', 'hired'), stage('s_rejected', 'rejected')])
    const a = (await createApplication(job, await candidate('python'), 'manual')).application
    await expect(engine.moveApplication(recruiter, a.id, 'nope')).rejects.toMatchObject({ status: 400 })
    await expect(engine.moveApplication({ ...recruiter, tenantId: 't2' }, a.id, 's_custom')).rejects.toMatchObject({ status: 404 })
  })
})

describe('assessment stage', () => {
  it('invites on entry and records pass/fail when the exam result is final', async () => {
    await db.current.collection('exams').insertOne({ id: 'exam-1', tenant_id: 't1', title: 'Python test' })
    const job = await seed([
      stage('s_applied', 'applied'),
      stage('s_test', 'assessment', { config: { kind: 'assessment', exam_id: 'exam-1', pass_score: 60, deadline_days: 5 } }),
      stage('s_custom', 'custom', { advance: 'approval' }),
      stage('s_hired', 'hired'),
      stage('s_rejected', 'rejected'),
    ])
    const c = await candidate('python', 'asha@x.com')
    const a = (await createApplication(job, c, 'manual')).application
    expect(invites).toEqual([expect.objectContaining({ email: 'asha@x.com', target_url: '/assessment/exam-1' })])
    let app = await getApp(a.id)
    expect(app.stage_id).toBe('s_test')
    expect(app.results.at(-1)).toMatchObject({ stage_id: 's_test', outcome: 'pending' })

    expect(await onAssessmentScored({ id: 'sub-1', exam_id: 'exam-1', email: 'other@x.com', score: 9, max_score: 10 })).toBe(0)
    expect(await onAssessmentScored({ id: 'sub-1', exam_id: 'exam-1', email: 'ASHA@x.com', score: 9, max_score: 10, has_pending_review: true })).toBe(0)
    expect(await onAssessmentScored({ id: 'sub-1', exam_id: 'exam-1', user_id: 'user-42', score: 9, max_score: 10 })).toBe(1)
    app = await getApp(a.id)
    expect(app.stage_id).toBe('s_custom')
    expect(app.results.find((r) => r.stage_id === 's_test')).toMatchObject({ outcome: 'pass', score: 90, ref: { kind: 'exam_submission', id: 'sub-1' } })
    // A second hook call for the same submission does nothing.
    expect(await onAssessmentScored({ id: 'sub-1', exam_id: 'exam-1', email: 'asha@x.com', score: 9, max_score: 10 })).toBe(0)

    const b = (await createApplication(job, await candidate('python', 'bo@x.com'), 'manual')).application
    await onAssessmentScored({ id: 'sub-2', exam_id: 'exam-1', email: 'bo@x.com', score: 3, max_score: 10 })
    expect(await getApp(b.id)).toMatchObject({ stage_id: 's_rejected', status: 'rejected' })
  })
})

describe('review fixes', () => {
  const examJob = () => seed([
    stage('s_applied', 'applied'),
    stage('s_test', 'assessment', { config: { kind: 'assessment', exam_id: 'exam-1', pass_score: 60, deadline_days: 5 } }),
    stage('s_custom', 'custom', { advance: 'approval' }),
    stage('s_hired', 'hired'),
    stage('s_rejected', 'rejected'),
  ])

  it('an on-time submit waiting for manual grading is not failed by the deadline sweep; the grade decides', async () => {
    await db.current.collection('exams').insertOne({ id: 'exam-1', tenant_id: 't1', title: 'Python test' })
    const job = await examJob()
    const a = (await createApplication(job, await candidate('python', 'asha@x.com'), 'manual')).application
    expect(await onAssessmentScored({ id: 'sub-1', exam_id: 'exam-1', email: 'asha@x.com', score: 2, max_score: 10, has_pending_review: true })).toBe(0)
    const run = await (await atsStageRuns()).findOne({ application_id: a.id, type: 'assessment' })
    expect(run?.status).toBe('submitted')
    // Way past the deadline: the sweep leaves it alone.
    expect(await sweepAssessmentDeadlines(new Date(Date.now() + 30 * 86_400_000))).toBe(0)
    expect((await getApp(a.id)).stage_id).toBe('s_test')
    // Grading finishes → recorded once; a racing second hook finds nothing to claim.
    expect(await onAssessmentScored({ id: 'sub-1', exam_id: 'exam-1', email: 'asha@x.com', score: 8, max_score: 10 })).toBe(1)
    expect(await onAssessmentScored({ id: 'sub-1', exam_id: 'exam-1', email: 'asha@x.com', score: 8, max_score: 10 })).toBe(0)
    expect((await getApp(a.id)).stage_id).toBe('s_custom')
  })

  it('a failed assessment invite leaves a pending result with the error', async () => {
    await db.current.collection('exams').insertOne({ id: 'exam-1', tenant_id: 't1', title: 'Python test' })
    vi.mocked(createCandidateInvite).mockResolvedValueOnce({ ok: false, status: 500, error: 'mail server down' } as never)
    const job = await examJob()
    const a = (await createApplication(job, await candidate('python', 'asha@x.com'), 'manual')).application
    const app = await getApp(a.id)
    expect(app.results.at(-1)).toMatchObject({ stage_id: 's_test', outcome: 'pending', summary: expect.stringMatching(/Could not send the assessment invite: mail server down/) })
    expect((await (await atsStageRuns()).findOne({ key: engine.stageKey(app) }))?.status).toBe('failed')
  })

  it('a result from an older entry of the same stage is dropped', async () => {
    const job = await seed([stage('s_applied', 'applied', { advance: 'approval' }), stage('s_custom', 'custom', { advance: 'approval' }), stage('s_hired', 'hired'), stage('s_rejected', 'rejected')])
    const a = (await createApplication(job, await candidate('python'), 'manual')).application
    const first = await engine.moveApplication(recruiter, a.id, 's_custom')
    const oldKey = engine.stageKey(first)
    await engine.moveApplication(recruiter, a.id, 's_applied')
    const second = await engine.moveApplication(recruiter, a.id, 's_custom')
    expect(engine.isCurrentEntry(second, oldKey)).toBe(false)
    expect(engine.isCurrentEntry(second, `${engine.stageKey(second)}:r2`)).toBe(true)
    const r = await engine.recordStageResult(a.id, { stage_id: 's_custom', outcome: 'fail', at: new Date().toISOString() }, { entryKey: `${oldKey}:r1` })
    expect(r.pending_move ?? null).toBeNull()
    expect((await getApp(a.id)).results.filter((x) => x.stage_id === 's_custom')).toHaveLength(0)
    await engine.recordStageResult(a.id, { stage_id: 's_custom', outcome: 'pass', at: new Date().toISOString() }, { entryKey: engine.stageKey(second) })
    expect((await getApp(a.id)).pending_move?.to).toBe('s_hired')
  })

  it('openings: an un-hire only gives back an opening its hire took, and reopens a filled job', async () => {
    const pipe = [stage('s_applied', 'applied', { advance: 'approval' }), stage('s_hired', 'hired'), stage('s_rejected', 'rejected')]
    const job = await seed(pipe, { openings: 1 })
    const a = (await createApplication(job, await candidate('python'), 'manual')).application
    const b = (await createApplication(job, await candidate('python'), 'manual')).application
    await engine.moveApplication(recruiter, a.id, 's_hired')
    expect(await getJob(job.id)).toMatchObject({ openings: 0, status: 'filled' })
    await engine.moveApplication(recruiter, b.id, 's_hired') // no opening left to take
    expect((await getJob(job.id)).openings).toBe(0)
    await engine.moveApplication(recruiter, b.id, 's_applied') // took none → gives none back
    expect(await getJob(job.id)).toMatchObject({ openings: 0, status: 'filled' })
    await engine.moveApplication(recruiter, a.id, 's_applied')
    expect(await getJob(job.id)).toMatchObject({ openings: 1, status: 'open' })
  })

  it('client review decisions record the stage result and follow the stage rules', async () => {
    const job = await seed([
      stage('s_applied', 'applied', { advance: 'approval' }),
      stage('s_client', 'client_review', { advance: 'approval', on_fail: 'review', client_visible: true }),
      stage('s_offer', 'offer'),
      stage('s_hired', 'hired'),
      stage('s_rejected', 'rejected'),
    ])
    const a = (await createApplication(job, await candidate('python'), 'manual')).application
    await expect(engine.recordClientDecision(recruiter, a.id, 'approve')).rejects.toMatchObject({ status: 409 })
    await engine.moveApplication(recruiter, a.id, 's_client')
    const client = { userId: 'cl-1', tenantId: 't1', role: 'client' as const, clientId: 'c1', email: 'c@x.com' }
    let app = await engine.recordClientDecision(client, a.id, 'approve', 'Strong profile')
    expect(app.pending_move?.to).toBe('s_offer')
    expect(app.results.at(-1)).toMatchObject({ stage_id: 's_client', outcome: 'pass', summary: 'Client approved the candidate: Strong profile' })
    app = await engine.recordClientDecision(client, a.id, 'reject')
    expect(app.pending_move?.to).toBe('s_rejected')
    expect((await getApp(a.id)).results.filter((r) => r.stage_id === 's_client')).toHaveLength(1)
  })

  it('guest (unverified) intake never writes contact details onto an existing candidate', async () => {
    const existing = await candidate('python', 'asha@x.com')
    const r = await upsertCandidate('t1', { name: 'Asha', email: 'asha@x.com', phone: '+919876543210', source: 'apply_page', verified: false })
    expect(r.created).toBe(false)
    const stored = (await (await atsCandidates()).findOne({ id: existing.id })) as AtsCandidate & { unverified_contact?: { phone: string | null } }
    expect(stored.phone).toBeNull()
    expect(stored.unverified_contact?.phone).toBe('+919876543210')
    // A guest with someone else's phone but a new email gets their own record.
    await (await atsCandidates()).updateOne({ id: existing.id }, { $set: { phone: '+919876543210' } })
    const other = await upsertCandidate('t1', { name: 'Mallory', email: 'm@x.com', phone: '+919876543210', source: 'apply_page', verified: false })
    expect(other.created).toBe(true)
    expect(other.candidate.id).not.toBe(existing.id)
    // Trusted intake still fills missing contact fields.
    await upsertCandidate('t1', { email: 'z@x.com', source: 'manual' })
    const trusted = await upsertCandidate('t1', { email: 'z@x.com', phone: '+14155550100', source: 'manual' })
    expect(trusted.candidate.phone).toBe('+14155550100')
  })
})

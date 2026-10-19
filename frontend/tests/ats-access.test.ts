/**
 * ATS access rules (lib/ats/access-rules.ts) and invite tokens (lib/ats/invite-token.ts).
 */
import { describe, it, expect } from 'vitest'
import {
  ATS_ACTIONS,
  ATS_ROLES,
  can,
  canActOnStage,
  canEditJob,
  applicationViewFor,
  canSeeApplication,
  canSeeJob,
  jobViewFor,
  candidateViewFor,
  clientApplicationFilter,
  clientVisibleStageIds,
  parseInviteInput,
  pickMembership,
  type AtsAction,
} from '@/lib/ats/access-rules'
import { decideInviteAccept, signInviteToken, verifyInviteToken } from '@/lib/ats/invite-token'
import type { AtsActor, AtsApplication, AtsCandidate, AtsJob, AtsRole, PipelineStage, StageType } from '@/lib/ats/contract'
import { matches } from './helpers/fake-mongo'

const T = 't1'
const actor = (role: AtsRole, extra: Partial<AtsActor> = {}): AtsActor => ({ userId: `u-${role}`, tenantId: T, role, clientId: role === 'client' ? 'c1' : null, email: `${role}@x.io`, ...extra })

const stage = (id: string, type: StageType, extra: Partial<PipelineStage> = {}): PipelineStage => ({ id, type, name: id, advance: 'auto', on_fail: 'reject', ...extra })
const PIPELINE: PipelineStage[] = [
  stage('s_applied', 'applied'),
  stage('s_screen', 'screening'),
  stage('s_vi', 'virtual_interview'),
  stage('s_client', 'client_review', { client_visible: true, advance: 'approval' }),
  stage('s_offer', 'offer', { client_visible: true }),
  stage('s_hired', 'hired'),
  stage('s_rej', 'rejected'),
]
const job = (extra: Partial<AtsJob> = {}): AtsJob => ({
  id: 'j1', tenant_id: T, client_id: 'c1', title: 'Engineer', openings: 1, description: '', skills: [], status: 'open', is_public: false,
  recruiter_ids: ['u-recruiter'], hiring_manager_ids: ['u-hiring_manager'],
  criteria: { must_have_skills: [], nice_to_have_skills: [], keywords: [], pass_score: 50, use_ai_match: false, must_have_required: false },
  pipeline: PIPELINE, created_by: 'x', created_at: '', updated_at: '', ...extra,
})
const app = (extra: Partial<AtsApplication> = {}): AtsApplication => ({
  id: 'a1', tenant_id: T, job_id: 'j1', candidate_id: 'cand1', client_id: 'c1', stage_id: 's_client', stage_entered_at: '', status: 'active',
  results: [], history: [], source: 'manual', created_at: '', updated_at: '', ...extra,
})

describe('permission matrix (role × action)', () => {
  const Y = (...a: AtsAction[]) => new Set(a)
  const expected: Record<AtsRole, Set<AtsAction>> = {
    admin: new Set(ATS_ACTIONS),
    recruiter: Y('job.view', 'job.create', 'job.edit', 'application.view', 'application.move', 'application.status', 'application.approve',
      'candidate.add', 'candidate.contact', 'candidate.salary', 'interview.schedule', 'interview.view', 'scorecard.submit',
      'comment.internal', 'comment.client', 'analytics.view', 'clients.view', 'team.view'),
    hiring_manager: Y('job.view', 'application.view', 'application.approve', 'candidate.contact', 'candidate.salary', 'interview.view', 'scorecard.submit', 'comment.internal', 'team.view'),
    interviewer: Y('application.view', 'interview.view', 'scorecard.submit'),
    client: Y('job.view', 'application.view', 'application.approve', 'comment.client'),
  }
  for (const role of ATS_ROLES) {
    for (const action of ATS_ACTIONS) {
      it(`${role} ${expected[role].has(action) ? 'can' : 'cannot'} ${action}`, () => {
        expect(can(actor(role), action)).toBe(expected[role].has(action))
      })
    }
  }
  it('client contact details follow the tenant setting', () => {
    expect(can(actor('client'), 'candidate.contact')).toBe(false)
    expect(can(actor('client'), 'candidate.contact', { settings: { client_sees_contacts: true } })).toBe(true)
    expect(can(actor('interviewer'), 'candidate.contact', { settings: { client_sees_contacts: true } })).toBe(false)
  })
})

describe('job scope', () => {
  it('admin sees all tenant jobs, never another tenant', () => {
    expect(canSeeJob(actor('admin'), job())).toBe(true)
    expect(canSeeJob(actor('admin'), job({ tenant_id: 't2' }))).toBe(false)
  })
  it('recruiter: assigned jobs, or all when the tenant allows it (default)', () => {
    const other = job({ recruiter_ids: [] })
    expect(canSeeJob(actor('recruiter'), other)).toBe(true)
    expect(canSeeJob(actor('recruiter'), other, { settings: { recruiters_see_all_jobs: false } })).toBe(false)
    expect(canSeeJob(actor('recruiter'), job(), { settings: { recruiters_see_all_jobs: false } })).toBe(true)
    expect(canEditJob(actor('recruiter'), other, { settings: { recruiters_see_all_jobs: false } })).toBe(false)
  })
  it('hiring manager: only their jobs; cannot edit', () => {
    expect(canSeeJob(actor('hiring_manager'), job())).toBe(true)
    expect(canSeeJob(actor('hiring_manager'), job({ hiring_manager_ids: ['someone'] }))).toBe(false)
    expect(canEditJob(actor('hiring_manager'), job())).toBe(false)
  })
  it('client: only jobs of their client', () => {
    expect(canSeeJob(actor('client'), job())).toBe(true)
    expect(canSeeJob(actor('client'), job({ client_id: 'c2' }))).toBe(false)
    expect(canSeeJob(actor('client', { clientId: null }), job())).toBe(false)
    expect(canSeeJob(actor('client'), job({ status: 'draft' }))).toBe(false)
    expect(canSeeJob(actor('admin'), job({ status: 'draft' }))).toBe(true)
  })
  it('interviewer: only through an assigned interview', () => {
    expect(canSeeJob(actor('interviewer'), job())).toBe(false)
    expect(canSeeJob(actor('interviewer'), job(), { interviewerAssigned: true })).toBe(true)
  })
})

describe('application visibility', () => {
  it('rejects tenant / job mismatches for every role', () => {
    for (const r of ATS_ROLES) {
      expect(canSeeApplication(actor(r), app({ tenant_id: 't2' }), job(), { interviewerAssigned: true })).toBe(false)
      expect(canSeeApplication(actor(r), app({ job_id: 'j2' }), job(), { interviewerAssigned: true })).toBe(false)
    }
  })
  it('client sees only client-visible stages (+ hired) of their client', () => {
    const c = actor('client')
    expect(canSeeApplication(c, app({ stage_id: 's_client' }), job())).toBe(true)
    expect(canSeeApplication(c, app({ stage_id: 's_offer' }), job())).toBe(true)
    expect(canSeeApplication(c, app({ stage_id: 's_hired', status: 'hired' }), job())).toBe(true)
    expect(canSeeApplication(c, app({ stage_id: 's_screen' }), job())).toBe(false)
    expect(canSeeApplication(c, app({ stage_id: 's_vi' }), job())).toBe(false)
    expect(canSeeApplication(c, app({ stage_id: 's_rej' }), job())).toBe(false)
    expect(canSeeApplication(c, app({ client_id: 'c2' }), job())).toBe(false)
    // app without its own client_id falls back to the job's
    expect(canSeeApplication(c, app({ client_id: null }), job())).toBe(true)
  })
  it('interviewer only with an assigned interview', () => {
    expect(canSeeApplication(actor('interviewer'), app({ stage_id: 's_vi' }), job())).toBe(false)
    expect(canSeeApplication(actor('interviewer'), app({ stage_id: 's_vi' }), job(), { interviewerAssigned: true })).toBe(true)
  })
  it('hiring manager follows job scope', () => {
    expect(canSeeApplication(actor('hiring_manager'), app({ stage_id: 's_screen' }), job())).toBe(true)
    expect(canSeeApplication(actor('hiring_manager'), app(), job({ hiring_manager_ids: [] }))).toBe(false)
  })
  it('client filter selects exactly the visible applications', () => {
    expect(clientVisibleStageIds(job())).toEqual(['s_client', 's_offer', 's_hired'])
    const f = clientApplicationFilter(actor('client'), job())!
    expect(f).not.toBeNull()
    const docs = [
      app({ id: 'x1', stage_id: 's_client' }),
      app({ id: 'x2', stage_id: 's_screen' }),
      app({ id: 'x3', stage_id: 's_hired', status: 'hired' }),
      app({ id: 'x4', stage_id: 's_client', tenant_id: 't2' }),
      app({ id: 'x5', stage_id: 's_client', job_id: 'j2' }),
    ]
    expect(docs.filter((d) => matches(d as never, f)).map((d) => d.id)).toEqual(['x1', 'x3'])
    expect(clientApplicationFilter(actor('recruiter'), job())).toBeNull()
    expect(clientApplicationFilter(actor('client'), job({ client_id: 'c2' }))).toBeNull()
  })
})

describe('canActOnStage', () => {
  const types: StageType[] = ['applied', 'screening', 'assessment', 'bot_screen', 'virtual_interview', 'f2f_interview', 'client_review', 'offer', 'hired', 'rejected', 'custom']
  it.each(types)('%s', (t) => {
    const s = stage('s', t, { client_visible: t === 'client_review' })
    expect(canActOnStage(actor('admin'), s)).toBe(true)
    expect(canActOnStage(actor('recruiter'), s)).toBe(true)
    expect(canActOnStage(actor('hiring_manager'), s)).toBe(true)
    expect(canActOnStage(actor('interviewer'), s)).toBe(t === 'virtual_interview' || t === 'f2f_interview')
    expect(canActOnStage(actor('client'), s)).toBe(t === 'client_review')
  })
  it('client cannot act on a client_review stage hidden from clients', () => {
    expect(canActOnStage(actor('client'), stage('s', 'client_review', { client_visible: false }))).toBe(false)
  })
})

describe('candidate redaction', () => {
  const cand: AtsCandidate = {
    id: 'cand1', tenant_id: T, name: 'Asha', email: 'asha@x.io', phone: '+911234567890', tags: ['vip'], source: 'manual',
    resume: { file_name: 'cv.pdf', text: 'full resume text', uploaded_at: '' },
    parsed: { skills: ['go'], titles: ['SDE'], companies: [], education: [], email: 'asha@x.io', phone: '+91', current_salary: 10, expected_salary: 20, summary: 'Backend dev', parser: 'ai' },
    created_at: '', updated_at: '',
  }
  it('interviewer: name + résumé, no contact or salary', () => {
    const v = candidateViewFor(actor('interviewer'), cand)
    expect(v.name).toBe('Asha')
    expect(v.resume?.text).toBe('full resume text')
    expect(v.email).toBeUndefined()
    expect(v.phone).toBeUndefined()
    expect(v.tags).toBeUndefined()
    expect(v.parsed?.email).toBeUndefined()
    expect(v.parsed?.expected_salary).toBeUndefined()
  })
  it('client: summary only; contact only with the setting; never salary', () => {
    const v = candidateViewFor(actor('client'), cand)
    expect(v.email).toBeUndefined()
    expect(v.resume?.text).toBe('')
    expect(v.parsed?.summary).toBe('Backend dev')
    expect(v.parsed?.current_salary).toBeUndefined()
    const w = candidateViewFor(actor('client'), cand, { settings: { client_sees_contacts: true } })
    expect(w.email).toBe('asha@x.io')
    expect(w.parsed?.expected_salary).toBeUndefined()
  })
  it('recruiter: everything', () => {
    const v = candidateViewFor(actor('recruiter'), cand)
    expect(v.email).toBe('asha@x.io')
    expect(v.parsed?.expected_salary).toBe(20)
  })
})

describe('membership resolution', () => {
  const m = (tenantId: string, role: AtsRole, at: string, orgAdmin = false) => ({ tenantId, role, clientId: null, at, orgAdmin })
  it('explicit tenant must match (superadmin excepted); cookie is only a preference', () => {
    const choices = [m('a', 'interviewer', '2026-01-01'), m('b', 'client', '2026-02-01')]
    expect(pickMembership(choices, { requested: 'a' })?.tenantId).toBe('a')
    expect(pickMembership(choices, { requested: 'zzz' })).toBeNull()
    expect(pickMembership(choices, { requested: 'zzz', superadmin: true })).toMatchObject({ tenantId: 'zzz', role: 'admin' })
    expect(pickMembership(choices, { cookie: 'a' })?.tenantId).toBe('a')
    expect(pickMembership(choices, { cookie: 'zzz' })?.tenantId).toBe('b') // most recent
    expect(pickMembership([], {})).toBeNull()
  })
  it('tenant_admin of a tenant is admin there and is the default', () => {
    const choices = [m('b', 'interviewer', '2026-09-01'), m('a', 'recruiter', '2026-01-01'), m('a', 'admin', '2025-01-01', true)]
    expect(pickMembership(choices, {})).toMatchObject({ tenantId: 'a', role: 'admin' })
    expect(pickMembership(choices, { requested: 'a' })?.role).toBe('admin')
  })
})

describe('invite input', () => {
  it('validates email, role and client', () => {
    expect(parseInviteInput({ email: 'bad', role: 'recruiter' }).ok).toBe(false)
    expect(parseInviteInput({ email: 'a@b.io', role: 'owner' }).ok).toBe(false)
    expect(parseInviteInput({ email: 'a@b.io', role: 'client' })).toMatchObject({ ok: false })
    expect(parseInviteInput({ email: 'a@b.io', role: 'client', client_id: '$where' })).toMatchObject({ ok: false })
    expect(parseInviteInput({ email: ' A@B.io ', role: 'client', client_id: 'c1' })).toEqual({ ok: true, value: { email: 'a@b.io', role: 'client', name: null, client_id: 'c1' } })
    // client_id is dropped for roles that don't use it
    expect(parseInviteInput({ email: 'a@b.io', role: 'recruiter', client_id: 'c1', name: ' Ravi ' })).toEqual({ ok: true, value: { email: 'a@b.io', role: 'recruiter', name: 'Ravi', client_id: null } })
  })
})

describe('invite tokens', () => {
  const key = new Uint8Array(32).fill(7)
  const now = Date.UTC(2026, 9, 19)
  const payload = { m: 'mem1', n: 'nonce1', e: now + 3600_000 }
  const tok = signInviteToken(key, payload)

  it('round-trips and rejects tampering, wrong key, expiry and junk', () => {
    expect(verifyInviteToken(key, tok, now)).toEqual(payload)
    const [body, sig] = tok.split('.')
    const forged = Buffer.from(JSON.stringify({ ...payload, m: 'other' })).toString('base64url')
    expect(verifyInviteToken(key, `${forged}.${sig}`, now)).toBeNull()
    expect(verifyInviteToken(key, `${body}.${sig.slice(0, -2)}AA`, now)).toBeNull()
    expect(verifyInviteToken(new Uint8Array(32).fill(8), tok, now)).toBeNull()
    expect(verifyInviteToken(key, tok, now + 7200_000)).toBeNull()
    for (const junk of [null, '', 'abc', 'a.b.c', 42, 'x'.repeat(600)]) expect(verifyInviteToken(key, junk, now)).toBeNull()
  })

  const member = { id: 'mem1', status: 'invited', email: 'asha@x.io', user_id: null, invite_nonce: 'nonce1' }
  const user = { id: 'u1', email: 'Asha@X.io' }
  it('accepts the invited email with the current nonce', () => {
    expect(decideInviteAccept({ payload, member, user, tenantActive: true })).toEqual({ ok: true })
  })
  it('rejects bad states', () => {
    expect(decideInviteAccept({ payload: null, member, user, tenantActive: true })).toMatchObject({ ok: false, status: 410 })
    expect(decideInviteAccept({ payload, member: null, user, tenantActive: true })).toMatchObject({ ok: false, status: 404 })
    expect(decideInviteAccept({ payload, member: { ...member, id: 'x' }, user, tenantActive: true })).toMatchObject({ ok: false, status: 404 })
    expect(decideInviteAccept({ payload, member: { ...member, status: 'disabled' }, user, tenantActive: true })).toMatchObject({ ok: false, status: 403 })
    // resend rotated the nonce
    expect(decideInviteAccept({ payload, member: { ...member, invite_nonce: 'nonce2' }, user, tenantActive: true })).toMatchObject({ ok: false, status: 410 })
    // already accepted by this user
    expect(decideInviteAccept({ payload, member: { ...member, status: 'active', user_id: 'u1', invite_nonce: null }, user, tenantActive: true })).toMatchObject({ ok: false, status: 409 })
    expect(decideInviteAccept({ payload, member, user, tenantActive: false })).toMatchObject({ ok: false, status: 400 })
    expect(decideInviteAccept({ payload, member, user: { id: 'u1', email: 'someone@else.io' }, tenantActive: true })).toMatchObject({ ok: false, status: 403 })
    expect(decideInviteAccept({ payload, member: { ...member, user_id: 'u9' }, user, tenantActive: true })).toMatchObject({ ok: false, status: 409 })
  })
})

describe('record redaction (application / job views)', () => {
  const full = app({
    match: { score: 72, breakdown: { must: 40 }, missing_must: ['go'], reasons: ['Expected 18 LPA'] },
    results: [{ stage_id: 's_bot', outcome: 'pass', score: 80, summary: 'Notice 90 days, expects 18 LPA', ref: { kind: 'screening_call', id: 'c1' }, at: '2026-01-01' }],
    history: [{ from: 's_screen', to: 's_vi', at: '2026-01-02', by: 'system', auto: true, reason: 'Passed bot screen (80/100)' }],
    pending_move: { to: 's_rej', reason: 'Low score', suggested_at: '' },
    rejection_reason: 'x',
  })

  it('staff see the whole record', () => {
    for (const r of ['admin', 'recruiter', 'hiring_manager'] as const) {
      expect(applicationViewFor(actor(r), full)).toBe(full)
      expect(jobViewFor(actor(r), job())).toEqual(job())
    }
  })

  it('interviewers: outcomes and scores, no summaries, match reasons or move reasons', () => {
    const v = applicationViewFor(actor('interviewer'), full)
    expect(v.match).toEqual({ score: 72, breakdown: {}, missing_must: [], reasons: [] })
    expect(v.results).toEqual([{ stage_id: 's_bot', outcome: 'pass', score: 80, at: '2026-01-01' }])
    expect(v.history[0]).not.toHaveProperty('reason')
    expect(v.pending_move).toBeNull()
    expect(JSON.stringify(v)).not.toMatch(/LPA|Low score|Notice/)
  })

  it('clients: stage + score only', () => {
    const v = applicationViewFor(actor('client'), full)
    expect(v).toMatchObject({ stage_id: 's_client', status: 'active', results: [], history: [], pending_move: null })
    expect(JSON.stringify(v)).not.toMatch(/LPA|Low score|Notice/)
  })

  it('jobs: no criteria, team ids or stage config for interviewers and clients; clients see visible stages only', () => {
    const j = job({ pipeline: [...PIPELINE.slice(0, 2), stage('s_vi', 'virtual_interview', { config: { kind: 'custom' } }), ...PIPELINE.slice(3)] })
    const iv = jobViewFor(actor('interviewer'), j)
    expect(iv).not.toHaveProperty('criteria')
    expect(iv).not.toHaveProperty('recruiter_ids')
    expect(iv.pipeline.map((s) => s.id)).toEqual(PIPELINE.map((s) => s.id))
    expect(iv.pipeline.every((s) => !('config' in s))).toBe(true)
    const cl = jobViewFor(actor('client'), j)
    expect(cl).not.toHaveProperty('hiring_manager_ids')
    expect(cl.pipeline.map((s) => s.id)).toEqual(['s_client', 's_offer', 's_hired'])
  })
})

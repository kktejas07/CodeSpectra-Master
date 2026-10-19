/**
 * HR round + compensation: validation (fresher / experienced), apply-form
 * mapping, CSV columns, pipeline sanitising for hr_round / bgv, the HR
 * decision gate, signed links, redaction, and the HR round end to end on the
 * fake DB (form → submit → decision).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FakeDb } from './helpers/fake-mongo'
import type { AtsActor, AtsApplication, AtsCandidate, AtsJob, PipelineStage } from '@/lib/ats/contract'

const db = { current: new FakeDb() }
vi.mock('@/lib/mongodb', () => ({ getMongoDb: async () => db.current }))
vi.mock('@/lib/ats/handlers/index', () => ({}))
vi.mock('@/lib/ats/notify', async (orig) => ({ ...(await orig<typeof import('@/lib/ats/notify')>()), notifyStageEntry: vi.fn(async () => {}) }))
vi.mock('@/lib/session', () => ({ deriveServerKey: async () => new Uint8Array(32).fill(7) }))
vi.mock('@/lib/app-origin', () => ({ getAppOrigin: () => 'https://app.test' }))
const emails: { to: string; html: string }[] = []
vi.mock('@/lib/send-email', () => ({ sendEmail: vi.fn(async (to: string, msg: { html: string }) => { emails.push({ to, html: msg.html }); return { success: true } }) }))
const whatsapps: string[] = []
vi.mock('@/lib/whatsapp', () => ({ sendWhatsAppText: vi.fn(async (to: string) => { whatsapps.push(to) }) }))
const pings: string[] = []
vi.mock('@/lib/notifications', () => ({ notifyMany: vi.fn(async (_ids: string[], n: { title: string }) => { pings.push(n.title); return 1 }) }))

import {
  applyFieldsToBody, canSeeCompensation, compensationToOverrides, currencyForCountry, parseCompensation, periodsFor, withCompensation,
} from '@/lib/ats/compensation'
import { parseCandidateCsv } from '@/lib/ats/intake'
import {
  BGV_CHECKS_BY_REGION, STAGE_TYPES, defaultPipeline, pipelineWarnings, sanitizePipeline, validatePipeline,
} from '@/lib/ats/pipeline'
import { hrDecisionGate, signHrToken, verifyHrToken, formTimes } from '@/lib/ats/hr/rules'
import { applicationViewFor } from '@/lib/ats/access-rules'
import { __resetAtsIndexes, atsApplications, atsCandidates, atsJobs } from '@/lib/ats/db'
import { __resetHrIndexes, atsHrForms } from '@/lib/ats/hr/db'
import { recordHrDecision, submitHrForm, sweepHrForms } from '@/lib/ats/hr/service'
import { recordStageResult } from '@/lib/ats/engine'
import '@/lib/ats/hr/handler'
import { PIPELINE_TEMPLATES, validatePipeline as validateClientPipeline } from '@/components/hiring/lib/pipeline-builder'

// ─── Compensation validation ─────────────────────────────────────────────────

describe('parseCompensation', () => {
  const opts = { source: 'apply' as const, country: 'IN' }

  it('requires the experience level', () => {
    const r = parseCompensation({ expected_ctc: 500000 }, opts)
    expect(r.ok).toBe(false)
  })

  it('fresher: expected CTC is required; current CTC and breakup are dropped', () => {
    expect(parseCompensation({ experience_level: 'fresher' }, opts)).toMatchObject({ ok: false, errors: ['Enter your expected CTC'] })
    const r = parseCompensation({ experience_level: 'fresher', expected_ctc: '6,00,000', current_ctc: 900000, breakup: { fixed: 1 }, notice_days: '15' }, opts)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).toMatchObject({ experience_level: 'fresher', currency: 'INR', period: 'year', expected_ctc: 600000, current_ctc: null, breakup: null, notice_days: 15, source: 'apply' })
  })

  it('experienced: current (or last drawn) CTC is required; expected is optional', () => {
    expect(parseCompensation({ experience_level: 'experienced', expected_ctc: 2000000 }, opts)).toMatchObject({ ok: false, errors: ['Enter your current CTC'] })
    expect(parseCompensation({ experience_level: 'experienced', currently_employed: 'false' }, opts)).toMatchObject({ ok: false, errors: ['Enter your last drawn CTC'] })
    const r = parseCompensation({ experience_level: 'experienced', current_ctc: 1800000, breakup: { fixed: 1500000, variable: 300000 }, notice_days: 60 }, opts)
    expect(r.ok && r.value).toMatchObject({ current_ctc: 1800000, currently_employed: true, breakup: { fixed: 1500000, variable: 300000 }, expected_ctc: null, notice_days: 60 })
  })

  it('not currently employed → notice defaults to 0', () => {
    const r = parseCompensation({ experience_level: 'experienced', current_ctc: 1200000, currently_employed: false }, opts)
    expect(r.ok && r.value.notice_days).toBe(0)
  })

  it('rejects a breakup larger than the CTC, junk numbers and out-of-range values', () => {
    expect(parseCompensation({ experience_level: 'experienced', current_ctc: 1000000, breakup: { fixed: 900000, variable: 200000 } }, opts).ok).toBe(false)
    expect(parseCompensation({ experience_level: 'fresher', expected_ctc: 'lots' }, opts).ok).toBe(false)
    expect(parseCompensation({ experience_level: 'fresher', expected_ctc: 5e9 }, opts).ok).toBe(false)
    expect(parseCompensation({ experience_level: 'fresher', expected_ctc: 0 }, opts).ok).toBe(false)
    expect(parseCompensation({ experience_level: 'fresher', expected_ctc: 500000, notice_days: 400 }, opts).ok).toBe(false)
  })

  it('currency defaults from the country; hourly only for USD contract roles', () => {
    expect(currencyForCountry('IN')).toBe('INR')
    expect(currencyForCountry('us')).toBe('USD')
    expect(parseCompensation({ experience_level: 'fresher', expected_ctc: 90000 }, { source: 'apply', country: 'US' })).toMatchObject({ ok: true, value: { currency: 'USD' } })
    expect(parseCompensation({ experience_level: 'fresher', expected_ctc: 60, period: 'hour', currency: 'USD' }, { source: 'apply', allowHourly: true }).ok).toBe(true)
    expect(parseCompensation({ experience_level: 'fresher', expected_ctc: 60, period: 'hour', currency: 'USD' }, { source: 'apply', allowHourly: false }).ok).toBe(false)
    expect(parseCompensation({ experience_level: 'fresher', expected_ctc: 600, period: 'hour', currency: 'INR' }, { source: 'apply' }).ok).toBe(false)
    // only the supported currencies
    expect(parseCompensation({ experience_level: 'fresher', expected_ctc: 600000, currency: 'XYZ' }, { source: 'apply' }).ok).toBe(false)
    expect(parseCompensation({ experience_level: 'fresher', expected_ctc: 600000, currency: 'eur' }, { source: 'apply' })).toMatchObject({ ok: true, value: { currency: 'EUR' } })
    expect(periodsFor('USD', true)).toContain('hour')
    expect(periodsFor('INR', true)).not.toContain('hour')
  })
})

// ─── Apply mapping ───────────────────────────────────────────────────────────

describe('apply form mapping', () => {
  const form = (fields: Record<string, string>) => (k: string) => fields[k] ?? ''

  it('reads the new fields, and maps the legacy salary names', () => {
    const body = applyFieldsToBody(form({ experience_level: 'experienced', current_salary: '1500000', expected_salary: '2000000', notice_days: '30' }))
    const r = parseCompensation(body, { source: 'apply', country: 'IN' })
    expect(r.ok && r.value).toMatchObject({ current_ctc: 1500000, expected_ctc: 2000000, notice_days: 30 })
    const r2 = parseCompensation(applyFieldsToBody(form({ experience_level: 'fresher', expected_ctc: '450000', expected_salary: '999' })), { source: 'apply', country: 'IN' })
    expect(r2.ok && r2.value.expected_ctc).toBe(450000)
  })

  it('annualises for the screening overrides (notice / current / expected salary)', () => {
    const r = parseCompensation({ experience_level: 'experienced', current_ctc: 100000, expected_ctc: 120000, period: 'month', notice_days: 30 }, { source: 'apply', country: 'IN' })
    expect(r.ok && compensationToOverrides(r.value)).toEqual({ notice_days: 30, current_salary: 1200000, expected_salary: 1440000 })
  })

  it('keeps a capped history, newest last', () => {
    const r = parseCompensation({ experience_level: 'fresher', expected_ctc: 1 }, { source: 'apply' })
    if (!r.ok) throw new Error('setup')
    let app: { compensation?: typeof r.value | null; compensation_history?: (typeof r.value)[] } = {}
    for (let i = 0; i < 25; i++) app = withCompensation(app, { ...r.value, expected_ctc: i + 1 })
    expect(app.compensation_history).toHaveLength(20)
    expect(app.compensation?.expected_ctc).toBe(25)
    expect(app.compensation_history?.at(-1)?.expected_ctc).toBe(25)
  })

  it('CSV: optional compensation columns', () => {
    const rows = parseCandidateCsv('name,email,experience,current_ctc,expected_ctc,notice_days\nAsha,a@x.com,experienced,1800000,2200000,60\nBen,b@x.com,fresher,,,\nCee,c@x.com,,,500000,')
    expect(rows[0].compensation).toMatchObject({ experience_level: 'experienced', current_ctc: 1800000, expected_ctc: 2200000, notice_days: 60, source: 'recruiter' })
    expect(rows[1].error).toMatch(/^Compensation: /)
    expect(rows[2].compensation).toMatchObject({ experience_level: 'fresher', expected_ctc: 500000 })
    expect(parseCandidateCsv('name,email\nDee,d@x.com')[0].compensation).toBeUndefined()
  })
})

// ─── Pipeline ────────────────────────────────────────────────────────────────

const base = (extra: Record<string, unknown>[]) => [
  { id: 's_applied', type: 'applied', name: 'Applied' },
  ...extra,
  { id: 's_hired', type: 'hired', name: 'Hired' },
  { id: 's_rejected', type: 'rejected', name: 'Rejected' },
]

describe('pipeline: hr_round + bgv', () => {
  it('knows the new stage types and puts them before the offer by default', () => {
    expect(STAGE_TYPES).toEqual(expect.arrayContaining(['hr_round', 'bgv']))
    const types = defaultPipeline().map((s) => s.type)
    expect(types.indexOf('hr_round')).toBeLessThan(types.indexOf('bgv'))
    expect(types.indexOf('bgv')).toBeLessThan(types.indexOf('offer'))
  })

  it('sanitises the HR round config', () => {
    const { stages, errors } = sanitizePipeline(base([{ id: 's_hr', type: 'hr_round', name: 'HR', config: { collect_compensation: 'false', form_deadline_days: 99, interview: { mode: 'virtual', provider: 'bogus', duration_min: 2, panel_ids: ['u1', 7] } } }]))
    expect(errors).toEqual([])
    expect(stages[1].config).toEqual({ kind: 'hr_round', collect_compensation: false, form_deadline_days: 30, interview: { mode: 'virtual', provider: 'livekit', duration_min: 10, panel_ids: ['u1'] } })
    const d = sanitizePipeline(base([{ id: 's_hr', type: 'hr_round', name: 'HR' }])).stages[1].config
    expect(d).toMatchObject({ collect_compensation: true, form_deadline_days: 3, interview: null })
  })

  it('validates the BGV region and its checks; critical ⊆ checks; numbers clamped', () => {
    const ok = sanitizePipeline(base([{ id: 's_bgv', type: 'bgv', name: 'BGV', config: { region: 'IN', checks: ['pan', 'uan_epfo', 'identity'], critical_checks: ['pan', 'ssn_trace'], vendor: 'Manual', employment_years: 40, references_count: 9, form_deadline_days: 0 } }]))
    expect(ok.errors).toEqual([])
    expect(ok.stages[1].config).toMatchObject({ kind: 'bgv', region: 'IN', checks: ['pan', 'uan_epfo', 'identity'], critical_checks: ['pan'], vendor: 'manual', employment_years: 15, references_count: 5, form_deadline_days: 1 })

    const wrong = sanitizePipeline(base([{ id: 's_bgv', type: 'bgv', name: 'BGV', config: { region: 'IN', checks: ['ssn_trace', 'pan'] } }]))
    expect(wrong.errors.join(' ')).toMatch(/ssn_trace is not available for India/)
    expect((wrong.stages[1].config as { checks: string[] }).checks).toEqual(['pan'])

    expect(sanitizePipeline(base([{ id: 's_bgv', type: 'bgv', name: 'BGV', config: { region: 'EU', checks: ['identity'] } }])).errors.join(' ')).toMatch(/region/)
    expect(sanitizePipeline(base([{ id: 's_bgv', type: 'bgv', name: 'BGV', config: { region: 'US', checks: [] } }])).errors.join(' ')).toMatch(/at least one check/)
    // Missing checks → the region's defaults (all allowed there)
    const us = sanitizePipeline(base([{ id: 's_bgv', type: 'bgv', name: 'BGV', config: { region: 'US' } }])).stages[1].config as { checks: string[] }
    expect(us.checks.length).toBeGreaterThan(0)
    expect(us.checks.every((c) => (BGV_CHECKS_BY_REGION.US as string[]).includes(c))).toBe(true)
  })

  it('at most one BGV stage; HR before BGV is advice, not an error', () => {
    const two = sanitizePipeline(base([{ id: 'b1', type: 'bgv', name: 'B1' }, { id: 'b2', type: 'bgv', name: 'B2' }])).stages
    expect(validatePipeline(two, { tenantExamIds: new Set(), requireRunnable: false })).toContain('The pipeline can only have one background verification stage')
    const bgvFirst = sanitizePipeline(base([{ id: 'b1', type: 'bgv', name: 'B' }, { id: 'h', type: 'hr_round', name: 'HR' }])).stages
    expect(validatePipeline(bgvFirst, { tenantExamIds: new Set(), requireRunnable: false })).toEqual([])
    expect(pipelineWarnings(bgvFirst)).toHaveLength(1)
    expect(pipelineWarnings(defaultPipeline())).toEqual([])
  })

  it('builder templates: India and US hiring are valid and region-specific', () => {
    const india = PIPELINE_TEMPLATES.find((t) => t.id === 'india')!.build()
    const us = PIPELINE_TEMPLATES.find((t) => t.id === 'us')!.build()
    for (const p of [india, us]) {
      // Only the per-job choices every template leaves open (which test, which office).
      expect(validateClientPipeline(p).filter((e) => !/pick a test|interview location/.test(e))).toEqual([])
      expect(pipelineWarnings(p)).toEqual([])
    }
    expect(india.find((s) => s.type === 'bgv')!.config).toMatchObject({ region: 'IN' })
    const usTypes = us.map((s) => s.type)
    expect(usTypes.indexOf('offer')).toBeLessThan(usTypes.indexOf('bgv'))
    expect(us.find((s) => s.type === 'bgv')!.config).toMatchObject({ region: 'US' })
    // round-trips through the server sanitiser without errors
    expect(sanitizePipeline(india).errors).toEqual([])
    expect(sanitizePipeline(us).errors).toEqual([])
  })
})

// ─── Decision gate + links ───────────────────────────────────────────────────

describe('HR decision gate', () => {
  const g = (o: Partial<Parameters<typeof hrDecisionGate>[0]>) =>
    hrDecisionGate({ decision: 'pass', stageType: 'hr_round', appStatus: 'active', collect: true, formSubmitted: false, ...o })

  it('blocks pass until the form is in, unless overridden with a reason', () => {
    expect(g({})).toMatchObject({ ok: false, status: 409 })
    expect(g({ override: { reason: 'ok' } })).toMatchObject({ ok: false, status: 400 })
    expect(g({ override: { reason: 'Confirmed on the call' } })).toEqual({ ok: true, decision: 'pass', overrideReason: 'Confirmed on the call' })
    expect(g({ formSubmitted: true })).toEqual({ ok: true, decision: 'pass', overrideReason: null })
    expect(g({ collect: false })).toMatchObject({ ok: true })
  })

  it('fail / hold never need the form; wrong stage, status or decision are refused', () => {
    expect(g({ decision: 'fail' })).toMatchObject({ ok: true, decision: 'fail' })
    expect(g({ decision: 'hold' })).toMatchObject({ ok: true, decision: 'hold' })
    expect(g({ decision: 'maybe' })).toMatchObject({ ok: false, status: 400 })
    expect(g({ stageType: 'offer', formSubmitted: true })).toMatchObject({ ok: false, status: 409 })
    expect(g({ appStatus: 'rejected', formSubmitted: true })).toMatchObject({ ok: false, status: 409 })
  })

  it('signed links verify, expire and reject tampering', () => {
    const key = new Uint8Array(32).fill(1)
    const t = signHrToken(key, { i: 'f1', n: 'abc', e: Date.now() + 60_000 })
    expect(verifyHrToken(key, t)).toMatchObject({ k: 'hr', i: 'f1', n: 'abc' })
    expect(verifyHrToken(new Uint8Array(32).fill(2), t)).toBeNull()
    expect(verifyHrToken(key, t, Date.now() + 120_000)).toBeNull()
    expect(verifyHrToken(key, t.slice(0, -2) + 'xx')).toBeNull()
    const ft = formTimes(new Date('2026-01-01T00:00:00Z'), 4)
    expect(ft.remind_at).toBe('2026-01-03T00:00:00.000Z')
    expect(ft.deadline).toBe('2026-01-05T00:00:00.000Z')
  })
})

// ─── Redaction ───────────────────────────────────────────────────────────────

describe('compensation redaction', () => {
  const app = {
    id: 'a1', tenant_id: 't1', job_id: 'j1', candidate_id: 'c1', client_id: null, stage_id: 's', stage_entered_at: 'x', status: 'active',
    results: [{ stage_id: 's_hr', outcome: 'pass', summary: 'Passed the HR round', at: 'x' }], history: [], source: 'apply_page', created_at: 'x', updated_at: 'x',
    compensation: { experience_level: 'fresher', currency: 'INR', period: 'year', expected_ctc: 600000, source: 'apply' },
    compensation_history: [{ experience_level: 'fresher', currency: 'INR', period: 'year', expected_ctc: 600000, source: 'apply' }],
  } as AtsApplication

  it('only admin / recruiter / hiring manager see compensation', () => {
    for (const role of ['admin', 'recruiter', 'hiring_manager'] as const) {
      expect(canSeeCompensation(role)).toBe(true)
      expect(applicationViewFor({ role }, app).compensation).toBeTruthy()
    }
    for (const role of ['interviewer', 'client'] as const) {
      expect(canSeeCompensation(role)).toBe(false)
      const v = applicationViewFor({ role }, app) as AtsApplication
      expect(v.compensation).toBeUndefined()
      expect(v.compensation_history).toBeUndefined()
      expect(JSON.stringify(v)).not.toContain('600000')
    }
  })
})

// ─── End to end on the fake DB ───────────────────────────────────────────────

describe('HR round flow', () => {
  beforeEach(() => {
    db.current = new FakeDb()
    __resetAtsIndexes()
    __resetHrIndexes()
    emails.length = 0
    whatsapps.length = 0
    pings.length = 0
  })

  const actor: AtsActor = { userId: 'u-rec', tenantId: 't1', role: 'recruiter', clientId: null, email: 'r@x.com', name: 'Riya' }
  const st = (id: string, type: PipelineStage['type'], extra: Partial<PipelineStage> = {}): PipelineStage => ({ id, type, name: id, advance: 'auto', on_fail: 'reject', ...extra })

  async function seed(collect = true): Promise<{ job: AtsJob; app: AtsApplication }> {
    const job: AtsJob = {
      id: 'j1', tenant_id: 't1', client_id: null, title: 'Backend engineer', openings: 1, description: '', skills: [], status: 'open', is_public: true,
      recruiter_ids: ['u-rec'], hiring_manager_ids: [], criteria: {} as AtsJob['criteria'], created_by: 'u', created_at: 'x', updated_at: 'x',
      pipeline: [st('s_applied', 'applied'), st('s_hr', 'hr_round', { config: { kind: 'hr_round', collect_compensation: collect, form_deadline_days: 4, interview: null } }), st('s_offer', 'offer', { advance: 'approval' }), st('s_hired', 'hired'), st('s_rejected', 'rejected')],
    }
    await (await atsJobs()).insertOne(job)
    const cand: AtsCandidate = { id: 'c1', tenant_id: 't1', name: 'Asha Rao', email: 'asha@x.com', phone: '+919876543210', country: 'IN', tags: [], source: 'apply_page', consent: { whatsapp: true }, created_at: 'x', updated_at: 'x' }
    await (await atsCandidates()).insertOne(cand)
    const app: AtsApplication = {
      id: 'a1', tenant_id: 't1', job_id: 'j1', candidate_id: 'c1', client_id: null, stage_id: 's_applied', stage_entered_at: '2026-01-01T00:00:00.000Z', status: 'active',
      results: [], history: [], source: 'apply_page', created_at: 'x', updated_at: 'x',
      compensation: { experience_level: 'experienced', currency: 'INR', period: 'year', current_ctc: 1500000, currently_employed: true, expected_ctc: 2000000, notice_days: 30, source: 'apply' },
    }
    await (await atsApplications()).insertOne(app)
    // applied passes → auto-advance into the HR round (runs the handler)
    const moved = await recordStageResult('a1', { stage_id: 's_applied', outcome: 'pass', at: new Date().toISOString() })
    return { job, app: moved }
  }

  it('sends the form on entry (email + WhatsApp with consent), once', async () => {
    const { app } = await seed()
    expect(app.stage_id).toBe('s_hr')
    const forms = await (await atsHrForms()).find({}).toArray()
    expect(forms).toHaveLength(1)
    expect(forms[0]).toMatchObject({ status: 'sent', collect: true, application_id: 'a1' })
    expect(emails).toHaveLength(1)
    expect(emails[0].html).toContain('https://app.test/hr-form/')
    expect(whatsapps).toEqual(['+919876543210'])
  })

  it('blocks pass before the form; the submitted form unlocks it and is stored as hr_form', async () => {
    await seed()
    await expect(recordHrDecision(actor, 'a1', { decision: 'pass' })).rejects.toMatchObject({ status: 409 })

    const form = (await (await atsHrForms()).find({}).toArray())[0]
    const token = signHrToken(new Uint8Array(32).fill(7), { i: form.id, n: form.token_nonce, e: Date.now() + 86_400_000 })
    expect(await submitHrForm(token, { experience_level: 'fresher' })).toMatchObject({ ok: false, status: 400 })
    expect(await submitHrForm('nope.nope', {})).toMatchObject({ ok: false, status: 404 })
    expect(await submitHrForm(token, { experience_level: 'experienced', current_ctc: 1600000, expected_ctc: 2100000, notice_days: 45, negotiable: true })).toEqual({ ok: true })
    expect(pings).toContain('Compensation form submitted')

    const saved = (await (await atsApplications()).findOne({ id: 'a1' })) as AtsApplication
    expect(saved.compensation).toMatchObject({ source: 'hr_form', current_ctc: 1600000, negotiable: true })
    expect(saved.compensation?.confirmed_at).toBeTruthy()
    expect(saved.compensation_history?.length).toBe(1)

    const after = await recordHrDecision(actor, 'a1', { decision: 'pass', notes: 'Aligned', offered_ctc: '2000000' })
    expect(after.stage_id).toBe('s_offer')
    const decided = (await (await atsHrForms()).find({}).toArray())[0]
    expect(decided.decision).toMatchObject({ decision: 'pass', offered_ctc: 2000000, currency: 'INR' })
    // the result summary never carries the figures
    expect(JSON.stringify(after.results)).not.toContain('2000000')
    // form closes once HR decided
    expect(await submitHrForm(token, { experience_level: 'fresher', expected_ctc: 1 })).toMatchObject({ ok: false })
  })

  it('override with a reason passes without the form; hold puts the application on hold', async () => {
    await seed()
    const held = await recordHrDecision(actor, 'a1', { decision: 'hold', notes: 'Budget check' })
    expect(held.status).toBe('on_hold')
    await expect(recordHrDecision(actor, 'a1', { decision: 'pass', override: { reason: 'no' } })).rejects.toMatchObject({ status: 400 })
    const passed = await recordHrDecision(actor, 'a1', { decision: 'pass', override: { reason: 'Confirmed on the HR call' } })
    expect(passed.stage_id).toBe('s_offer')
    expect(passed.status).toBe('active')
  })

  it('collect off: no form is sent and pass needs no override', async () => {
    await seed(false)
    expect(emails).toHaveLength(0)
    const passed = await recordHrDecision(actor, 'a1', { decision: 'pass' })
    expect(passed.stage_id).toBe('s_offer')
  })

  it('an HR conversation panel verdict is advice: it never decides the stage', async () => {
    await seed()
    const r = await recordStageResult('a1', { stage_id: 's_hr', outcome: 'pass', ref: { kind: 'interview', id: 'iv1' }, summary: 'Panel yes', at: new Date().toISOString() })
    expect(r.stage_id).toBe('s_hr')
    expect(r.results.at(-1)).toMatchObject({ outcome: 'pending' })
  })

  it('sweep: reminder at half-way, overdue flag after the deadline', async () => {
    await seed()
    const sent = (await (await atsHrForms()).find({}).toArray())[0]
    const half = new Date(Date.parse(sent.sent_at!) + 2.5 * 86_400_000)
    expect(await sweepHrForms(half)).toEqual({ reminded: 1, expired: 0 })
    expect(await sweepHrForms(half)).toEqual({ reminded: 0, expired: 0 })
    const late = new Date(Date.parse(sent.deadline!) + 1000)
    expect(await sweepHrForms(late)).toEqual({ reminded: 0, expired: 1 })
    expect(pings).toContain('Compensation form overdue')
  })
})

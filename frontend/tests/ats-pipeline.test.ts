import { describe, it, expect } from 'vitest'
import {
  canTransition, defaultPipeline, nextStageOf, planStageMoves, sanitizeCriteria, sanitizePipeline, validatePipeline,
} from '@/lib/ats/pipeline'
import { parseCandidateCsv, parseCsv } from '@/lib/ats/intake'
import { computeAnalytics, median, reasonLabel } from '@/lib/ats/analytics'
import { renderText, textToHtml } from '@/lib/ats/notify'
import type { AtsApplication, AtsJob, PipelineStage } from '@/lib/ats/contract'

const exams = new Set(['exam-1'])

describe('default pipeline', () => {
  it('has the contract order and validates once an exam is chosen', () => {
    const p = defaultPipeline({ hasClient: true })
    expect(p.map((s) => s.type)).toEqual(['applied', 'screening', 'assessment', 'bot_screen', 'virtual_interview', 'f2f_interview', 'client_review', 'hr_round', 'bgv', 'offer', 'hired', 'rejected'])
    expect(defaultPipeline().some((s) => s.type === 'client_review')).toBe(false)
    expect(validatePipeline(p, { tenantExamIds: exams, requireRunnable: false })).toEqual([])
    expect(validatePipeline(p, { tenantExamIds: exams, requireRunnable: true })).toEqual(['Assessment: choose an assessment before opening the job'])
    expect(validatePipeline(defaultPipeline({ examId: 'exam-1' }), { tenantExamIds: exams, requireRunnable: true })).toEqual([])
  })
})

describe('validatePipeline', () => {
  const base = defaultPipeline({ examId: 'exam-1' })
  it('rejects duplicate ids, missing required stages, wrong first stage', () => {
    const dup = [...base, { ...base[1] }]
    expect(validatePipeline(dup, { tenantExamIds: exams, requireRunnable: false })).toContain('Stage id "s_screening" is used twice')
    const noHired = base.filter((s) => s.type !== 'hired')
    expect(validatePipeline(noHired, { tenantExamIds: exams, requireRunnable: false })).toContain('The pipeline needs a "hired" stage')
    const twoRejected = [...base, { ...base[base.length - 1], id: 's_rej2' }]
    expect(validatePipeline(twoRejected, { tenantExamIds: exams, requireRunnable: false })).toContain('The pipeline can only have one "rejected" stage')
    const reordered = [base[1], base[0], ...base.slice(2)]
    expect(validatePipeline(reordered, { tenantExamIds: exams, requireRunnable: false })).toContain('The first stage must be "applied"')
  })
  it('assessment exam must belong to the tenant', () => {
    const other = base.map((s) => (s.type === 'assessment' ? { ...s, config: { kind: 'assessment' as const, exam_id: 'someone-elses', pass_score: 60 } } : s))
    expect(validatePipeline(other, { tenantExamIds: exams, requireRunnable: false })).toEqual(["Assessment: that assessment isn't in your organisation"])
  })
})

describe('sanitizePipeline', () => {
  it('normalises stages and reports bad input', () => {
    const { stages, errors } = sanitizePipeline([
      { id: 's_applied', type: 'applied', name: 'Applied', advance: 'weird', on_fail: 'hold' },
      { id: 'bad id!', type: 'bot_screen', name: '', config: { channels: ['carrier_pigeon'], questions: [] } },
      { id: 'x', type: 'nope' },
      { id: 's_a', type: 'assessment', name: 'Test', config: { exam_id: 'exam-1', pass_score: 140, deadline_days: 3 } },
    ])
    expect(stages[0]).toMatchObject({ advance: 'auto', on_fail: 'hold', sla_days: null })
    expect(stages[2].config).toEqual({ kind: 'assessment', exam_id: 'exam-1', pass_score: 100, deadline_days: 3 })
    expect(errors).toEqual(expect.arrayContaining([
      'Stage 2: id must be letters, numbers, - or _',
      'Stage 2: give the stage a name',
      'Stage 2 (bot_screen): choose at least one screening channel',
      'Stage 2 (bot_screen): add at least one screening question',
      'Stage 3: unknown stage type',
    ]))
    expect(sanitizePipeline('nope').errors).toEqual(['Pipeline must be a list of stages'])
  })
  it('criteria keep base values for absent keys and clamp numbers', () => {
    const c = sanitizeCriteria({ must_have_skills: 'react, node , react', pass_score: 300, max_notice_days: '' }, { ...sanitizeCriteria({}), keywords: ['kafka'] })
    expect(c.must_have_skills).toEqual(['react', 'node'])
    expect(c.pass_score).toBe(100)
    expect(c.max_notice_days).toBeNull()
    expect(c.keywords).toEqual(['kafka'])
  })
})

describe('planStageMoves', () => {
  const old = defaultPipeline({ examId: 'exam-1' })
  const without = old.filter((s) => s.id !== 's_bot_screen')
  it('requires a target only for removed stages that have candidates', () => {
    expect(planStageMoves(old, without, {}, {})).toEqual({ moves: [], errors: [] })
    expect(planStageMoves(old, without, { s_bot_screen: 3 }, {}).errors).toEqual(['"Phone screen" has 3 candidates — choose a stage to move them to'])
    expect(planStageMoves(old, without, { s_bot_screen: 1 }, { s_bot_screen: 's_gone' }).errors).toEqual(['"Phone screen": the target stage doesn\'t exist'])
    expect(planStageMoves(old, without, { s_bot_screen: 1 }, { s_bot_screen: 's_virtual_interview' })).toEqual({ moves: [{ from: 's_bot_screen', to: 's_virtual_interview' }], errors: [] })
  })
})

describe('nextStageOf + status lifecycle', () => {
  const p = defaultPipeline()
  it('skips rejected and stops at terminal stages', () => {
    expect(nextStageOf(p, 's_applied')?.id).toBe('s_screening')
    expect(nextStageOf(p, 's_offer')?.id).toBe('s_hired')
    expect(nextStageOf(p, 's_hired')).toBeNull()
    expect(nextStageOf(p, 's_rejected')).toBeNull()
    const rejectedMiddle: PipelineStage[] = [p[0], p[p.length - 1], p[p.length - 2]]
    expect(nextStageOf(rejectedMiddle, 's_applied')?.id).toBe('s_hired')
  })
  it('job status transitions', () => {
    expect(canTransition('draft', 'open')).toBe(true)
    expect(canTransition('draft', 'filled')).toBe(false)
    expect(canTransition('closed', 'open')).toBe(true)
    expect(canTransition('open', 'draft')).toBe(false)
  })
})

describe('CSV', () => {
  it('parses quoted cells and header-mapped rows', () => {
    expect(parseCsv('a,"b, c","d ""q"""\r\n\r\n1,2,3')).toEqual([['a', 'b, c', 'd "q"'], ['1', '2', '3']])
    const rows = parseCandidateCsv('Email,Name,Phone,Country,Resume_URL\nA@X.com,Asha,98765 43210,IN,https://x.com/a.pdf\nbad,Bob,,,\n,Cee,,,\n,Dee,+1 415 555 0134,,javascript:alert(1)')
    expect(rows[0]).toEqual({ line: 2, name: 'Asha', email: 'a@x.com', phone: '+919876543210', country: 'IN', resume_url: 'https://x.com/a.pdf' })
    expect(rows[1].error).toBe('Invalid email')
    expect(rows[2].error).toBe('Needs an email or phone number')
    expect(rows[3]).toMatchObject({ phone: '+14155550134', resume_url: null })
    expect(rows[3].error).toBeUndefined()
  })
})

describe('templates', () => {
  it('renders variables and escapes HTML', () => {
    expect(renderText('Hi {{candidate_name}} — {{ job_title }} {{unknown}}!', { candidate_name: 'Asha', job_title: 'SDE' })).toBe('Hi Asha — SDE !')
    expect(textToHtml('<b>x</b>\n\ny')).toBe('<p style="margin:0 0 14px">&lt;b&gt;x&lt;/b&gt;</p><p style="margin:0 0 14px">y</p>')
  })
})

describe('analytics', () => {
  const job = { id: 'j1', tenant_id: 't', pipeline: defaultPipeline() } as unknown as AtsJob
  const h = (to: string, at: string, from: string | null = null) => ({ from, to, at, by: 'system', auto: true })
  const app = (p: Partial<AtsApplication>): AtsApplication => ({
    id: Math.random().toString(36), tenant_id: 't', job_id: 'j1', candidate_id: 'c', client_id: null, stage_id: 's_applied',
    stage_entered_at: '2026-01-01T00:00:00Z', status: 'active', results: [], history: [], source: 'apply_page', created_at: '2026-01-01T00:00:00Z', updated_at: '', ...p,
  })
  const apps = [
    app({ stage_id: 's_hired', status: 'hired', history: [h('s_applied', '2026-01-01T00:00:00Z'), h('s_screening', '2026-01-02T00:00:00Z', 's_applied'), h('s_hired', '2026-01-11T00:00:00Z', 's_screening')] }),
    app({ stage_id: 's_rejected', status: 'rejected', source: 'bulk_upload', rejection_reason: 'Did not pass Résumé screening (30/100) — x', history: [h('s_applied', '2026-01-01T00:00:00Z'), h('s_screening', '2026-01-01T12:00:00Z', 's_applied'), h('s_rejected', '2026-01-02T12:00:00Z', 's_screening')] }),
    app({ stage_id: 's_screening', history: [h('s_applied', '2026-01-01T00:00:00Z'), h('s_screening', '2026-01-03T00:00:00Z', 's_applied')] }),
  ]
  it('funnel, conversion, time in stage, time to hire, sources, reasons', () => {
    const r = computeAnalytics(apps, [job], { jobId: 'j1', now: new Date('2026-01-05T00:00:00Z') })
    expect(r).toMatchObject({ total: 3, active: 1, hired: 1, rejected: 1 })
    const f = Object.fromEntries(r.funnel.map((x) => [x.key, x]))
    expect(f.s_applied).toMatchObject({ reached: 3, current: 0, conversion_pct: null, median_days: 1 })
    expect(f.s_screening).toMatchObject({ reached: 3, current: 1, conversion_pct: 100, median_days: 2 })
    expect(f.s_hired).toMatchObject({ reached: 1, current: 1 })
    expect(f.s_offer.reached).toBe(0)
    expect(r.time_to_hire_days).toEqual({ median: 10, average: 10, count: 1 })
    expect(r.source_mix[0]).toEqual({ source: 'apply_page', count: 2, pct: 66.7 })
    expect(r.rejection_reasons).toEqual([{ reason: 'Did not pass Résumé screening', count: 1 }])
    expect(r.rejected_at).toEqual([{ key: 's_screening', name: 'Résumé screening', count: 1 }])
    expect(computeAnalytics(apps, [job]).funnel[0].key).toBe('applied')
  })
  it('helpers', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([1, 2, 3, 4])).toBe(2.5)
    expect(median([])).toBeNull()
    expect(reasonLabel('No progress in Assessment for 10 days')).toBe('No progress in Assessment for N days')
    expect(reasonLabel(null)).toBe('No reason given')
  })
})

describe('core additions', () => {
  it('keeps fallback_to_livekit on virtual interview stages', async () => {
    const { stages } = sanitizePipeline([{ id: 's_v', type: 'virtual_interview', name: 'Video', config: { provider: 'zoom', fallback_to_livekit: true } }])
    expect(stages[0].config).toMatchObject({ kind: 'interview', provider: 'zoom', fallback_to_livekit: true })
  })
  it('form-stated notice / salary override the parsed values', async () => {
    const { applyOverrides } = await import('@/lib/ats/intake')
    const base = { skills: ['python'], titles: [], companies: [], education: [], notice_days: 90, parser: 'heuristic' as const }
    expect(applyOverrides(base, { notice_days: 15, expected_salary: undefined })).toMatchObject({ skills: ['python'], notice_days: 15 })
    expect(applyOverrides(null, { expected_salary: 1_200_000 })).toMatchObject({ expected_salary: 1_200_000, skills: [] })
    expect(applyOverrides(null, {})).toBeNull()
  })
})

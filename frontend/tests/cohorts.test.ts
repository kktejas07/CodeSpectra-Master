/** Cohort rules (lib/cohorts/pure.ts): schedule expansion, enrolment, deadlines, scoring, progress. */
import { describe, expect, it } from 'vitest'
import {
  AssignmentInputSchema, CohortInputSchema, DEFAULT_ACCESS, autogradeResult, canJoin, cleanRubricScores, decideEnrolment,
  deadlineState, expandWeekly, finalScore, joinAttendance, learnerAssignment, learnerProgress, needsTaGrade, normaliseAssignment,
} from '@/lib/cohorts/pure'
import type { AssignmentDoc } from '@/lib/cohorts/types'

const cohort = { status: 'open' as const, capacity: 2, enrolled_count: 0, ends_at: '2099-01-01T00:00:00.000Z', access: { ...DEFAULT_ACCESS } }

describe('weekly schedule', () => {
  it('expands local wall-clock slots between start and end (IST)', () => {
    const out = expandWeekly({ starts_at: '2026-11-02T00:00:00.000Z', ends_at: '2026-11-16T23:59:00.000Z', timezone: 'Asia/Kolkata' }, [{ dow: 1, start: '18:00', duration_min: 60 }, { dow: 4, start: '19:30', duration_min: 90 }])
    // Mondays 2, 9, 16 Nov and Thursdays 5, 12 Nov — 18:00 IST = 12:30 UTC.
    expect(out.map((s) => s.starts_at)).toEqual([
      '2026-11-02T12:30:00.000Z', '2026-11-05T14:00:00.000Z', '2026-11-09T12:30:00.000Z', '2026-11-12T14:00:00.000Z', '2026-11-16T12:30:00.000Z',
    ])
    expect(out[1].duration_min).toBe(90)
  })

  it('follows DST in zones that have it', () => {
    const out = expandWeekly({ starts_at: '2026-10-26T00:00:00.000Z', ends_at: '2026-11-03T00:00:00.000Z', timezone: 'America/New_York' }, [{ dow: 1, start: '09:00', duration_min: 60 }])
    expect(out.map((s) => s.starts_at)).toEqual(['2026-10-26T13:00:00.000Z', '2026-11-02T14:00:00.000Z'])
  })

  it('returns nothing without slots', () => {
    expect(expandWeekly({ starts_at: '2026-11-02T00:00:00.000Z', ends_at: '2026-11-16T00:00:00.000Z', timezone: 'UTC' }, [])).toEqual([])
  })
})

describe('enrolment decision', () => {
  it('free cohorts admit until full; closed cohorts refuse', () => {
    expect(decideEnrolment(cohort, { entitled: false, licenceOrgId: null, paidOrderId: null })).toEqual({ ok: true, source: 'free' })
    expect(decideEnrolment({ ...cohort, enrolled_count: 2 }, { entitled: false, licenceOrgId: null, paidOrderId: null })).toEqual({ ok: false, reason: 'full' })
    expect(decideEnrolment({ ...cohort, status: 'draft' }, { entitled: true, licenceOrgId: null, paidOrderId: null })).toEqual({ ok: false, reason: 'closed' })
  })

  it('paid cohorts accept a licence seat, a plan entitlement or a paid order', () => {
    const paid = { ...cohort, access: { ...DEFAULT_ACCESS, free: false, entitlement: true, licence_org_ids: ['org1'], marketplace_product_id: 'prod1' } }
    expect(decideEnrolment(paid, { entitled: false, licenceOrgId: 'org1', paidOrderId: null })).toEqual({ ok: true, source: 'licence' })
    expect(decideEnrolment(paid, { entitled: true, licenceOrgId: 'org2', paidOrderId: null })).toEqual({ ok: true, source: 'entitlement' })
    expect(decideEnrolment(paid, { entitled: false, licenceOrgId: null, paidOrderId: 'o1' })).toEqual({ ok: true, source: 'order' })
    expect(decideEnrolment(paid, { entitled: false, licenceOrgId: null, paidOrderId: null })).toEqual({ ok: false, reason: 'payment_required', product_id: 'prod1' })
    expect(decideEnrolment({ ...paid, access: { ...paid.access, marketplace_product_id: null, entitlement: false } }, { entitled: true, licenceOrgId: null, paidOrderId: null })).toEqual({ ok: false, reason: 'not_allowed' })
  })
})

const codeAssignment: AssignmentDoc = {
  id: 'a1', cohort_id: 'c1', title: 'Sum', instructions: '', kind: 'code', due_at: '2026-11-10T18:30:00.000Z', late_hours: 24, late_penalty_pct: 20,
  max_points: 10, language: 'python', starter_code: '', tests: [{ input: '1 2', output: '3' }, { input: '4 5', output: '9', hidden: true }],
  autograde_weight_pct: 70, file_types: [], rubric: [{ id: 'r1', label: 'Style', points: 10, description: '' }], published: true, created_by: 'u', created_at: '', updated_at: '',
}

describe('deadlines and scoring', () => {
  it('on time, late window, closed', () => {
    const due = Date.parse(codeAssignment.due_at)
    expect(deadlineState(codeAssignment, due)).toBe('on_time')
    expect(deadlineState(codeAssignment, due + 3_600_000)).toBe('late')
    expect(deadlineState(codeAssignment, due + 25 * 3_600_000)).toBe('closed')
  })

  it('blends autograde and rubric, then applies the late penalty', () => {
    const autograde = autogradeResult([{ passed: true, hidden: false }, { passed: false, hidden: true }])
    expect(autograde.pct).toBe(50)
    expect(finalScore(codeAssignment, { autograde, grade: null, late: false })).toBeNull() // still needs the TA
    const grade = { rubric: { r1: 8 }, points: 8, max_points: 10, feedback: '', graded_by: 't', graded_at: '' }
    expect(finalScore(codeAssignment, { autograde, grade, late: false })).toBe(59) // 0.7*50 + 0.3*80
    expect(finalScore(codeAssignment, { autograde, grade, late: true })).toBe(47) // −20 %
    const autoOnly = { ...codeAssignment, rubric: [], autograde_weight_pct: 100 }
    expect(finalScore(autoOnly, { autograde, grade: null, late: false })).toBe(50)
    expect(needsTaGrade(autoOnly, { grade: null })).toBe(false)
    expect(needsTaGrade(codeAssignment, { grade: null })).toBe(true)
  })

  it('rubric scores must cover every line within its points', () => {
    expect(cleanRubricScores(codeAssignment.rubric, { r1: 7 })).toEqual({ ok: true, scores: { r1: 7 }, points: 7, max: 10 })
    expect(cleanRubricScores(codeAssignment.rubric, { r1: 11 }).ok).toBe(false)
    expect(cleanRubricScores(codeAssignment.rubric, { r1: 2.5 }).ok).toBe(false)
    expect(cleanRubricScores(codeAssignment.rubric, {}).ok).toBe(false)
  })

  it('learners never see hidden tests', () => {
    const v = learnerAssignment(codeAssignment)
    expect(v.samples).toEqual([{ input: '1 2', output: '3' }])
    expect(v.hidden_tests).toBe(1)
    expect('tests' in v).toBe(false)
  })

  it('normalises assignments: rubric ids, safe tests, file defaults', () => {
    const a = AssignmentInputSchema.parse({ title: 'Essay', instructions: 'Write', kind: 'file', due_at: '2026-11-10T10:00:00Z', rubric: [{ label: 'Clarity', points: 5 }, { label: 'Depth', points: 5 }] })
    const n = normaliseAssignment(a)
    expect(n.rubric.map((r) => r.id)).toEqual(['r1', 'r2'])
    expect(n.max_points).toBe(10)
    expect(n.file_types).toEqual(['pdf', 'zip'])
    const bad = AssignmentInputSchema.parse({ title: 'Code', instructions: '', kind: 'code', language: 'python', due_at: '2026-11-10T10:00:00Z', tests: [{ input: { $gt: 1 }, output: '' }] })
    expect(() => normaliseAssignment(bad)).toThrow()
  })
})

describe('attendance and progress', () => {
  it('join time decides present or late; the room opens 15 minutes early', () => {
    const start = '2026-11-02T12:30:00.000Z'
    expect(joinAttendance(start, Date.parse(start) + 5 * 60_000)).toBe('present')
    expect(joinAttendance(start, Date.parse(start) + 11 * 60_000)).toBe('late')
    const s = { starts_at: start, duration_min: 60, status: 'scheduled' }
    expect(canJoin(s, Date.parse(start) - 16 * 60_000)).toBe(false)
    expect(canJoin(s, Date.parse(start) - 10 * 60_000)).toBe(true)
    expect(canJoin({ ...s, status: 'cancelled' }, Date.parse(start))).toBe(false)
  })

  it('completion needs attendance, every assignment graded and the average', () => {
    const now = Date.parse('2026-12-01T00:00:00Z')
    const sessions = [1, 2, 3, 4].map((i) => ({ id: `s${i}`, starts_at: `2026-11-0${i}T10:00:00.000Z`, status: 'scheduled' }))
    const base = { rule: { min_attendance_pct: 75, min_assignment_pct: 60, require_all_assignments: true }, sessions, assignments: [{ id: 'a1', published: true }, { id: 'a2', published: true }, { id: 'a3', published: false }], now }
    const p = learnerProgress({ ...base, attendance: [{ session_id: 's1', status: 'present' }, { session_id: 's2', status: 'late' }, { session_id: 's3', status: 'excused' }], scores: { a1: 90 } })
    expect(p.attendance_pct).toBe(67) // 2 of 3 (excused left out)
    expect(p.missing).toEqual(['attendance', 'assignments', 'score'])
    const done = learnerProgress({ ...base, attendance: [{ session_id: 's1', status: 'present' }, { session_id: 's2', status: 'present' }, { session_id: 's3', status: 'present' }], scores: { a1: 90, a2: 70 } })
    expect(done.eligible).toBe(true)
    expect(done.assignment_pct).toBe(80)
  })
})

describe('cohort input', () => {
  it('validates dates, time zone and capacity', () => {
    const ok = CohortInputSchema.safeParse({ title: 'DSA cohort', starts_at: '2026-11-01T00:00:00Z', ends_at: '2026-12-01T00:00:00Z', timezone: 'Asia/Kolkata', capacity: 40 })
    expect(ok.success).toBe(true)
    expect(CohortInputSchema.safeParse({ title: 'DSA cohort', starts_at: '2026-12-01T00:00:00Z', ends_at: '2026-11-01T00:00:00Z', timezone: 'Asia/Kolkata', capacity: 40 }).success).toBe(false)
    expect(CohortInputSchema.safeParse({ title: 'DSA cohort', starts_at: '2026-11-01T00:00:00Z', ends_at: '2026-12-01T00:00:00Z', timezone: 'Mars/Base', capacity: 40 }).success).toBe(false)
    expect(CohortInputSchema.safeParse({ title: 'DSA cohort', starts_at: '2026-11-01T00:00:00Z', ends_at: '2026-12-01T00:00:00Z', timezone: 'UTC', capacity: 40, extra: 1 }).success).toBe(false)
  })
})

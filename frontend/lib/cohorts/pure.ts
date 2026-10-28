/**
 * Cohort rules (pure, unit tested in tests/cohorts.test.ts): input
 * validation, weekly schedule → session times, enrolment decision, deadline /
 * late handling, rubric + autograde scoring, attendance and completion.
 */
import { z } from 'zod'
import { isValidTimeZone, zonedParts, zonedTimeToUtc } from '@/lib/ats/interviews/tz'
import { sanitizeTestCases } from '@/lib/grading'
import {
  ASSIGNMENT_FILE_TYPES, COHORT_STATUSES, SESSION_PROVIDERS,
  type AssignmentDoc, type AttendanceStatus, type AutogradeResult, type CohortAccess, type CohortDoc,
  type CompletionRule, type LearnerProgress, type RubricItem, type SubmissionDoc, type WeeklySlot,
} from './types'

const clean = (s: string) => s.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim()
const line = (max: number) => z.string().max(max * 2).transform((s) => clean(s).replace(/\s+/g, ' ').slice(0, max))
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
const iso = z.string().refine((s) => Number.isFinite(Date.parse(s)), 'Use a valid date').transform((s) => new Date(s).toISOString())
const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/)

export const DEFAULT_ACCESS: CohortAccess = { free: true, entitlement: false, licence_org_ids: [], marketplace_product_id: null, price_minor: null, currency: 'INR' }
export const DEFAULT_COMPLETION: CompletionRule = { min_attendance_pct: 75, min_assignment_pct: 60, require_all_assignments: true }
export const MAX_SESSIONS = 120

const weekly = z.object({
  dow: z.coerce.number().int().min(0).max(6),
  start: z.string().regex(HHMM),
  duration_min: z.coerce.number().int().min(15).max(240),
})

export const CohortInputSchema = z.object({
  course_id: id.nullable().optional(),
  title: line(140).refine((s) => s.length >= 4, 'Give the cohort a title'),
  summary: z.string().max(4000).transform((s) => clean(s.replace(/\r\n/g, '\n'))).optional(),
  skills: z.array(line(40)).max(20).optional(),
  starts_at: iso,
  ends_at: iso,
  timezone: z.string().refine((tz) => isValidTimeZone(tz), 'Unknown time zone'),
  capacity: z.coerce.number().int().min(1).max(5000),
  status: z.enum(COHORT_STATUSES).optional(),
  access: z.object({
    free: z.boolean(),
    entitlement: z.boolean(),
    licence_org_ids: z.array(id).max(50),
    marketplace_product_id: id.nullable(),
    price_minor: z.coerce.number().int().min(0).max(100_000_000).nullable(),
    currency: z.enum(['INR', 'USD']),
  }).partial().optional(),
  schedule: z.object({
    weekly: z.array(weekly).max(14),
    provider: z.enum(SESSION_PROVIDERS),
    manual_url: z.string().max(500).nullable().refine((u) => !u || /^https:\/\/[^\s<>"']+$/i.test(u), 'Use an https:// link'),
    title_prefix: line(80),
  }).partial().optional(),
  completion: z.object({
    min_attendance_pct: z.coerce.number().int().min(0).max(100),
    min_assignment_pct: z.coerce.number().int().min(0).max(100),
    require_all_assignments: z.boolean(),
  }).partial().optional(),
}).strict()
  .refine((c) => Date.parse(c.ends_at) > Date.parse(c.starts_at), { message: 'The cohort must end after it starts', path: ['ends_at'] })
  .refine((c) => Date.parse(c.ends_at) - Date.parse(c.starts_at) <= 366 * 86_400_000, { message: 'A cohort can run for at most a year', path: ['ends_at'] })

export type CohortInput = z.infer<typeof CohortInputSchema>

/** First zod issue as one sentence. */
export function firstIssue(e: z.ZodError): string {
  const i = e.issues[0]
  return i ? `${i.path.join('.') || 'input'}: ${i.message}` : 'Invalid input'
}

const rubricItem = z.object({
  id: z.string().regex(/^[a-z0-9_-]{1,32}$/i).optional(),
  label: line(80).refine((s) => s.length > 0, 'Each rubric line needs a label'),
  points: z.coerce.number().int().min(1).max(100),
  description: z.string().max(500).transform(clean).optional(),
})

export const AssignmentInputSchema = z.object({
  title: line(140).refine((s) => s.length >= 3, 'Give the assignment a title'),
  instructions: z.string().max(20_000).transform((s) => clean(s.replace(/\r\n/g, '\n'))),
  kind: z.enum(['code', 'file']),
  due_at: iso,
  late_hours: z.coerce.number().int().min(0).max(24 * 14).default(0),
  late_penalty_pct: z.coerce.number().int().min(0).max(100).default(10),
  language: z.string().regex(/^[a-z0-9+#.-]{1,24}$/).nullable().optional(),
  starter_code: z.string().max(20_000).optional(),
  tests: z.unknown().optional(),
  autograde_weight_pct: z.coerce.number().int().min(0).max(100).default(70),
  file_types: z.array(z.enum(ASSIGNMENT_FILE_TYPES)).max(ASSIGNMENT_FILE_TYPES.length).optional(),
  rubric: z.array(rubricItem).max(12).optional(),
  published: z.boolean().optional(),
}).strict()
  .refine((a) => a.kind !== 'code' || !!a.language, { message: 'Pick a language for a code assignment', path: ['language'] })

export type AssignmentInput = z.infer<typeof AssignmentInputSchema>

/** Normalise a validated assignment: ids on rubric lines, safe test cases, max points. */
export function normaliseAssignment(a: AssignmentInput): Omit<AssignmentDoc, 'id' | 'cohort_id' | 'created_by' | 'created_at' | 'updated_at'> {
  const rubric: RubricItem[] = (a.rubric || []).map((r, i) => ({ id: r.id || `r${i + 1}`, label: r.label, points: r.points, description: r.description || '' }))
  const tests = a.kind === 'code' ? sanitizeTestCases(a.tests) : []
  if (a.kind === 'code' && !tests.length && !rubric.length) throw new Error('Add test cases or a rubric so the assignment can be graded')
  if (a.kind === 'file' && !rubric.length) throw new Error('Add a rubric so TAs can grade file submissions')
  return {
    title: a.title,
    instructions: a.instructions,
    kind: a.kind,
    due_at: a.due_at,
    late_hours: a.late_hours,
    late_penalty_pct: a.late_penalty_pct,
    max_points: rubric.reduce((s, r) => s + r.points, 0) || 100,
    language: a.kind === 'code' ? a.language ?? null : null,
    starter_code: a.kind === 'code' ? (a.starter_code || '') : '',
    tests,
    autograde_weight_pct: a.kind === 'code' ? (rubric.length ? (tests.length ? a.autograde_weight_pct : 0) : 100) : 0,
    file_types: a.kind === 'file' ? (a.file_types?.length ? a.file_types : ['pdf', 'zip']) : [],
    rubric,
    published: a.published ?? false,
  }
}

/** Learner view of an assignment: hidden tests removed. */
export function learnerAssignment(a: AssignmentDoc) {
  const { tests, created_by: _c, ...rest } = a
  return { ...rest, samples: tests.filter((t) => !t.hidden), hidden_tests: tests.filter((t) => t.hidden).length }
}

/**
 * Weekly slots between start and end, as UTC instants of the cohort's local
 * wall-clock times. Sorted, capped at MAX_SESSIONS.
 */
export function expandWeekly(c: Pick<CohortDoc, 'starts_at' | 'ends_at' | 'timezone'>, slots: WeeklySlot[]): { starts_at: string; duration_min: number }[] {
  const start = Date.parse(c.starts_at)
  const end = Date.parse(c.ends_at)
  if (!slots.length || !(end > start)) return []
  const out: { starts_at: string; duration_min: number }[] = []
  const first = zonedParts(new Date(start), c.timezone)
  // Walk local calendar days from the cohort's first local day.
  for (let i = 0; i <= 370 && out.length < MAX_SESSIONS; i++) {
    const noon = zonedTimeToUtc(first.year, first.month, first.day + i, 12, 0, c.timezone)
    const p = zonedParts(noon, c.timezone)
    if (noon.getTime() - 86_400_000 > end) break
    for (const s of slots) {
      if (s.dow !== p.weekday) continue
      const [h, m] = s.start.split(':').map(Number)
      const at = zonedTimeToUtc(p.year, p.month, p.day, h, m, c.timezone).getTime()
      if (at >= start && at <= end) out.push({ starts_at: new Date(at).toISOString(), duration_min: s.duration_min })
    }
  }
  return out.sort((a, b) => a.starts_at.localeCompare(b.starts_at)).slice(0, MAX_SESSIONS)
}

export type EnrolSource = 'free' | 'entitlement' | 'licence' | 'order'
export type EnrolDecision =
  | { ok: true; source: EnrolSource }
  | { ok: false; reason: 'closed' | 'full' | 'payment_required' | 'not_allowed'; product_id?: string | null }

/** Can this learner join? Order of checks: open → capacity → free → licence → entitlement → paid order. */
export function decideEnrolment(c: Pick<CohortDoc, 'status' | 'capacity' | 'enrolled_count' | 'access' | 'ends_at'>, ctx: {
  entitled: boolean
  licenceOrgId: string | null
  paidOrderId: string | null
  now?: number
}): EnrolDecision {
  const now = ctx.now ?? Date.now()
  if (!(c.status === 'open' || c.status === 'running') || Date.parse(c.ends_at) < now) return { ok: false, reason: 'closed' }
  if (c.enrolled_count >= c.capacity) return { ok: false, reason: 'full' }
  if (c.access.free) return { ok: true, source: 'free' }
  if (ctx.licenceOrgId && c.access.licence_org_ids.includes(ctx.licenceOrgId)) return { ok: true, source: 'licence' }
  if (c.access.entitlement && ctx.entitled) return { ok: true, source: 'entitlement' }
  if (c.access.marketplace_product_id) {
    if (ctx.paidOrderId) return { ok: true, source: 'order' }
    return { ok: false, reason: 'payment_required', product_id: c.access.marketplace_product_id }
  }
  return { ok: false, reason: 'not_allowed' }
}

/** Deadline state of a submission made at `at`. */
export function deadlineState(a: Pick<AssignmentDoc, 'due_at' | 'late_hours'>, at: number): 'on_time' | 'late' | 'closed' {
  const due = Date.parse(a.due_at)
  if (at <= due) return 'on_time'
  if (at <= due + a.late_hours * 3_600_000) return 'late'
  return 'closed'
}

/** Autograder outcome → result (hidden case errors are not shown to learners). */
export function autogradeResult(cases: { passed: boolean; hidden: boolean; error?: string }[]): AutogradeResult {
  const passed = cases.filter((c) => c.passed).length
  return { passed, total: cases.length, pct: cases.length ? Math.round((passed / cases.length) * 100) : 0, cases }
}

/** Rubric points from a TA: every line present, integer, within 0..max. */
export function cleanRubricScores(rubric: RubricItem[], raw: unknown): { ok: true; scores: Record<string, number>; points: number; max: number } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'Score every rubric line' }
  const r = raw as Record<string, unknown>
  const scores: Record<string, number> = {}
  for (const item of rubric) {
    const v = Number(r[item.id])
    if (!Number.isFinite(v) || !Number.isInteger(v) || v < 0 || v > item.points) return { ok: false, error: `"${item.label}" must be a whole number from 0 to ${item.points}` }
    scores[item.id] = v
  }
  return { ok: true, scores, points: Object.values(scores).reduce((s, v) => s + v, 0), max: rubric.reduce((s, i) => s + i.points, 0) }
}

/**
 * Final 0–100 score: autograde % and rubric % blended by the assignment's
 * weight, then the late penalty. Null while a needed part is missing.
 */
export function finalScore(a: Pick<AssignmentDoc, 'kind' | 'autograde_weight_pct' | 'rubric' | 'late_penalty_pct'>, s: Pick<SubmissionDoc, 'autograde' | 'grade' | 'late'>): number | null {
  const w = a.kind === 'code' ? a.autograde_weight_pct : 0
  const needsRubric = a.rubric.length > 0 && w < 100
  const auto = s.autograde ? s.autograde.pct : null
  if (w > 0 && auto === null) return null
  const rub = s.grade && s.grade.max_points > 0 ? (s.grade.points / s.grade.max_points) * 100 : null
  if (needsRubric && rub === null) return null
  const raw = (w / 100) * (auto ?? 0) + (needsRubric ? ((100 - w) / 100) * (rub ?? 0) : 0)
  const blended = needsRubric || w > 0 ? raw : 0
  const penalised = s.late ? blended * (1 - a.late_penalty_pct / 100) : blended
  return Math.max(0, Math.min(100, Math.round(penalised)))
}

/** Does this submission still need a TA? (rubric present and not graded yet) */
export function needsTaGrade(a: Pick<AssignmentDoc, 'kind' | 'rubric' | 'autograde_weight_pct'>, s: Pick<SubmissionDoc, 'grade'>): boolean {
  if (s.grade) return false
  return a.rubric.length > 0 && !(a.kind === 'code' && a.autograde_weight_pct >= 100)
}

/** Attendance status for a join at `joinedAt` (late after 10 minutes). */
export function joinAttendance(sessionStart: string, joinedAt: number, lateAfterMin = 10): AttendanceStatus {
  return joinedAt > Date.parse(sessionStart) + lateAfterMin * 60_000 ? 'late' : 'present'
}

/** Join window: 15 minutes before the start until the end. */
export function canJoin(s: { starts_at: string; duration_min: number; status: string }, now = Date.now()): boolean {
  if (s.status !== 'scheduled') return false
  const start = Date.parse(s.starts_at)
  return now >= start - 15 * 60_000 && now <= start + s.duration_min * 60_000
}

/**
 * Learner progress and completion eligibility. Sessions count once they've
 * started; excused sessions are left out of the attendance base.
 */
export function learnerProgress(p: {
  rule: CompletionRule
  sessions: { id: string; starts_at: string; status: string }[]
  attendance: { session_id: string; status: AttendanceStatus }[]
  assignments: { id: string; published: boolean }[]
  /** Best final score per assignment id (graded only). */
  scores: Record<string, number>
  now?: number
}): LearnerProgress {
  const now = p.now ?? Date.now()
  const held = p.sessions.filter((s) => s.status === 'scheduled' && Date.parse(s.starts_at) <= now)
  const att = new Map(p.attendance.map((a) => [a.session_id, a.status]))
  const base = held.filter((s) => att.get(s.id) !== 'excused')
  const attended = base.filter((s) => att.get(s.id) === 'present' || att.get(s.id) === 'late').length
  const attendancePct = base.length ? Math.round((attended / base.length) * 100) : 100
  const published = p.assignments.filter((a) => a.published)
  const graded = published.filter((a) => typeof p.scores[a.id] === 'number')
  const avg = published.length ? Math.round(published.reduce((s, a) => s + (p.scores[a.id] ?? 0), 0) / published.length) : 100
  const missing: LearnerProgress['missing'] = []
  if (attendancePct < p.rule.min_attendance_pct) missing.push('attendance')
  if (p.rule.require_all_assignments && graded.length < published.length) missing.push('assignments')
  if (avg < p.rule.min_assignment_pct) missing.push('score')
  const totalSessions = p.sessions.filter((s) => s.status === 'scheduled').length
  const parts = [totalSessions ? attended / totalSessions : 1, published.length ? graded.length / published.length : 1]
  return {
    sessions_total: totalSessions,
    sessions_attended: attended,
    attendance_pct: attendancePct,
    assignments_total: published.length,
    assignments_graded: graded.length,
    assignment_pct: avg,
    progress_pct: Math.round((parts.reduce((s, x) => s + x, 0) / parts.length) * 100),
    eligible: missing.length === 0,
    missing,
  }
}

/** XP for finishing a cohort (feeds the leaderboard). */
export const COHORT_COMPLETION_XP = 200

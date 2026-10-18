/**
 * Assessment sources (tenant scoped):
 *  - test                 title, role, sections, settings, question titles (no prompts, no answers)
 *  - test_result_summary  aggregates per test: counts, score distribution, pass rate, section averages
 *  - attempt_summary      one candidate's attempt: score, sections, time, integrity + identity flags,
 *                         hiring outcome — staff only. source_id = `${examId}:${userId}`
 */
import type { Db } from 'mongodb'
import { examPassPercent, isRiskProctorEvent, submissionSectionScores } from '@/lib/exam-access'
import { resolveSections } from '@/lib/exam-sections'
import { OUTCOMES_COLLECTION } from '@/lib/hiring-outcomes'
import type { ExtractedSource } from '../types'
import { arr, fields, isoDate, pct, str, tenantOf, type Doc } from './util'

const MAX_SUBMISSIONS = 5000

function questionsOf(exam: Doc): Doc[] {
  return arr(Array.isArray(exam.questionList) ? exam.questionList : exam.questions)
}

// ─── Test ────────────────────────────────────────────────────────────────────

export function testSource(exam: Doc): ExtractedSource | null {
  const id = str(exam.id, 200)
  if (!id) return null
  const qs = questionsOf(exam)
  const sections = resolveSections(exam)
  const qTitle = new Map(qs.map((q) => [str(q.id, 128), `${str(q.title, 200) || 'Untitled question'} (${str(q.type, 40) || 'question'})`]))
  const parts: string[] = [
    fields([
      ['Role / subject', exam.subject], ['Level', exam.level], ['Screening type', exam.screening_type],
      ['Tech stack', exam.techStack], ['Duration (minutes)', exam.duration], ['Pass mark (%)', examPassPercent(exam)],
      ['Questions', qs.length], ['Access', exam.access_type], ['Published', exam.published === true ? 'yes' : 'no'],
      ['Proctoring', exam.proctoring_mode], ['Kind', exam.kind], ['Starts', isoDate(exam.starts_at)], ['Ends', isoDate(exam.ends_at)],
      ['Retakes', exam.allow_retake === true ? `allowed (max ${str(exam.max_attempts, 4) || '1'} attempts)` : 'not allowed'],
      ['ID verification', exam.require_id_verification === false ? 'off' : 'on'],
      ['Face capture', exam.require_face_capture === false ? 'off' : 'on'],
      ['Certificates', exam.issue_certificates === false ? 'off' : 'on'],
    ]),
    str(exam.description, 4000),
  ]
  if (sections.length) {
    for (const s of sections) {
      parts.push(`## Section: ${s.title}`)
      parts.push(fields([['Time limit (minutes)', s.time_limit_minutes ?? 'shares the test time'], ['Locks after leaving', s.lock_after_leave ? 'yes' : 'no']]))
      if (s.instructions) parts.push(s.instructions)
      parts.push(s.question_ids.map((qid) => `- ${qTitle.get(qid) ?? qid}`).join('\n'))
    }
  } else if (qs.length) {
    parts.push('## Questions')
    parts.push(qs.slice(0, 200).map((q) => `- ${qTitle.get(str(q.id, 128))}`).join('\n'))
  }
  const tenant = tenantOf(exam)
  return {
    type: 'test',
    source_id: id,
    tenant_id: tenant,
    visibility: tenant ? 'tenant' : 'platform_admin',
    title: str(exam.title, 200) || 'Untitled test',
    url: `/dashboard/admin/assessments/${encodeURIComponent(id)}`,
    text: parts.filter(Boolean).join('\n\n'),
    metadata: { question_count: qs.length },
  }
}

// ─── Result summary ──────────────────────────────────────────────────────────

const BANDS: Array<[number, number]> = [[0, 20], [20, 40], [40, 60], [60, 80], [80, 101]]

export interface ResultSummaryStats {
  submissions: number
  candidates: number
  pending_review: number
  average_percent: number | null
  median_percent: number | null
  pass_rate: number | null
  passed: number
  distribution: { band: string; count: number }[]
  sections: { title: string; average_percent: number | null }[]
  average_minutes: number | null
}

export function resultStats(exam: Doc, subs: readonly Doc[]): ResultSummaryStats {
  const pass = examPassPercent(exam)
  const percents = subs
    .map((s) => (Number(s.max_score) > 0 ? (Number(s.score) || 0) / Number(s.max_score) * 100 : null))
    .filter((p): p is number => p !== null)
    .sort((a, b) => a - b)
  const median = percents.length
    ? percents.length % 2 ? percents[(percents.length - 1) / 2] : (percents[percents.length / 2 - 1] + percents[percents.length / 2]) / 2
    : null
  const passed = percents.filter((p) => p >= pass).length
  const sectionAgg = new Map<string, { sum: number; n: number }>()
  for (const s of subs) {
    for (const sc of submissionSectionScores(exam, s)) {
      if (sc.percent === null) continue
      const a = sectionAgg.get(sc.title) ?? { sum: 0, n: 0 }
      a.sum += sc.percent
      a.n += 1
      sectionAgg.set(sc.title, a)
    }
  }
  const times = subs.map((s) => Number(s.total_time_ms)).filter((t) => Number.isFinite(t) && t > 0)
  const round = (n: number) => Math.round(n * 10) / 10
  return {
    submissions: subs.length,
    candidates: new Set(subs.map((s) => str(s.user_id, 200))).size,
    pending_review: subs.filter((s) => s.has_pending_review === true).length,
    average_percent: percents.length ? round(percents.reduce((a, b) => a + b, 0) / percents.length) : null,
    median_percent: median === null ? null : round(median),
    pass_rate: pct(passed, percents.length),
    passed,
    distribution: BANDS.map(([lo, hi]) => ({
      band: `${lo}–${Math.min(hi, 100)}%`,
      count: percents.filter((p) => p >= lo && p < hi).length,
    })),
    sections: [...sectionAgg.entries()].map(([title, a]) => ({ title, average_percent: a.n ? round(a.sum / a.n) : null })),
    average_minutes: times.length ? round(times.reduce((a, b) => a + b, 0) / times.length / 60_000) : null,
  }
}

export function resultSummarySource(exam: Doc, subs: readonly Doc[]): ExtractedSource | null {
  const id = str(exam.id, 200)
  if (!id) return null
  const s = resultStats(exam, subs)
  const tenant = tenantOf(exam)
  const text = [
    fields([
      ['Submissions', s.submissions], ['Candidates', s.candidates], ['Awaiting manual review', s.pending_review],
      ['Average score (%)', s.average_percent ?? 'n/a'], ['Median score (%)', s.median_percent ?? 'n/a'],
      ['Pass mark (%)', examPassPercent(exam)], ['Passed', s.passed], ['Pass rate (%)', s.pass_rate ?? 'n/a'],
      ['Average time (minutes)', s.average_minutes ?? 'n/a'],
    ]),
    `## Score distribution\n${s.distribution.map((d) => `- ${d.band}: ${d.count}`).join('\n')}`,
    s.sections.length ? `## Section averages\n${s.sections.map((x) => `- ${x.title}: ${x.average_percent ?? 'n/a'}%`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n')
  return {
    type: 'test_result_summary',
    source_id: id,
    tenant_id: tenant,
    visibility: tenant ? 'tenant' : 'platform_admin',
    title: `Results: ${str(exam.title, 200) || 'Untitled test'}`,
    url: `/dashboard/admin/assessments/${encodeURIComponent(id)}/results`,
    text,
    metadata: { stats: s },
  }
}

// ─── Attempt summary (staff only) ────────────────────────────────────────────

export interface AttemptContext {
  candidateName: string
  riskEvents: Record<string, number>
  outcome?: string | null
}

export function attemptSource(exam: Doc, sub: Doc, ctx: AttemptContext): ExtractedSource | null {
  const examId = str(exam.id, 200)
  const userId = str(sub.user_id, 200)
  if (!examId || !userId) return null
  const max = Number(sub.max_score) || 0
  const score = Number(sub.score) || 0
  const percent = max > 0 ? Math.round(score / max * 1000) / 10 : null
  const pass = examPassPercent(exam)
  const sections = submissionSectionScores(exam, sub)
  const identity = (sub.identity_check && typeof sub.identity_check === 'object' ? sub.identity_check : {}) as Doc
  const risk = Object.entries(ctx.riskEvents).sort((a, b) => b[1] - a[1])
  const minutes = Number(sub.total_time_ms) > 0 ? Math.round(Number(sub.total_time_ms) / 6000) / 10 : null
  const tenant = tenantOf(exam)
  const text = [
    fields([
      ['Candidate', ctx.candidateName], ['Test', exam.title], ['Attempt', sub.attempt_no ?? 1],
      ['Score', max > 0 ? `${score} / ${max} (${percent}%)` : 'not scored'],
      ['Result', percent === null ? 'n/a' : percent >= pass ? `passed (pass mark ${pass}%)` : `below pass mark (${pass}%)`],
      ['Awaiting manual review', sub.has_pending_review === true ? 'yes' : 'no'],
      ['Score released', sub.score_released === true || !!sub.released_at ? 'yes' : 'no'],
      ['Time taken (minutes)', minutes ?? 'n/a'], ['Submitted', isoDate(sub.submitted_at)],
      ['Auto-submitted', sub.auto_submitted === true ? 'yes' : 'no'], ['Late submit', sub.late_submit === true ? 'yes' : 'no'],
      ['Browser extension detected', sub.extension_detected === true ? 'yes' : sub.extension_detected === false ? 'no' : ''],
      ['Identity check', str(identity.method, 40)],
      ['Identity needs manual review', identity.needs_manual_review === true ? 'yes' : 'no'],
      ['Hiring outcome', ctx.outcome ?? 'none recorded'],
    ]),
    sections.length ? `## Section scores\n${sections.map((s) => `- ${s.title}: ${s.score} / ${s.max}${s.percent === null ? '' : ` (${s.percent}%)`}`).join('\n')}` : '',
    `## Integrity flags\n${risk.length ? risk.map(([t, n]) => `- ${t.replace(/_/g, ' ')}: ${n}`).join('\n') : '- none recorded'}`,
  ].filter(Boolean).join('\n\n')
  return {
    type: 'attempt_summary',
    source_id: `${examId}:${userId}`,
    tenant_id: tenant,
    visibility: tenant ? 'tenant' : 'platform_admin',
    title: `${ctx.candidateName} — ${str(exam.title, 160) || 'test'}`,
    url: `/dashboard/admin/assessments/${encodeURIComponent(examId)}/results`,
    text,
    metadata: { exam_id: examId, user_id: userId, percent, staff_only: true },
  }
}

// ─── Loaders ─────────────────────────────────────────────────────────────────

export async function loadTest(db: Db, id: string): Promise<ExtractedSource | null> {
  const exam = await db.collection('exams').findOne({ id })
  return exam ? testSource(exam as Doc) : null
}

export async function loadResultSummary(db: Db, id: string): Promise<ExtractedSource | null> {
  const exam = await db.collection('exams').findOne({ id })
  if (!exam) return null
  const subs = await db.collection('exam_submissions')
    .find({ exam_id: id }, { projection: { _id: 0, user_id: 1, score: 1, max_score: 1, details: 1, sections: 1, has_pending_review: 1, total_time_ms: 1 } })
    .limit(MAX_SUBMISSIONS).toArray()
  if (!subs.length) return null // nothing to summarise yet
  return resultSummarySource(exam as Doc, subs as Doc[])
}

export async function candidateName(db: Db, userId: string, fallbackEmail?: unknown): Promise<string> {
  const u = await db.collection('user').findOne(
    { $or: [{ id: userId }, { _id: userId as never }] },
    { projection: { name: 1, fullName: 1, email: 1 } },
  )
  // Names, not emails, in searchable text.
  return str(u?.fullName, 120) || str(u?.name, 120) || (str(fallbackEmail, 200).split('@')[0] || 'Candidate')
}

export async function loadAttempt(db: Db, sourceId: string): Promise<ExtractedSource | null> {
  const sep = sourceId.indexOf(':')
  if (sep <= 0) return null
  const examId = sourceId.slice(0, sep)
  const userId = sourceId.slice(sep + 1)
  const [exam, sub] = await Promise.all([
    db.collection('exams').findOne({ id: examId }),
    db.collection('exam_submissions').findOne({ exam_id: examId, user_id: userId }),
  ])
  if (!exam || !sub) return null
  const [events, outcome, name] = await Promise.all([
    db.collection('proctor_events').aggregate([
      { $match: { session_kind: 'exam', session_id: examId, user_id: userId } },
      { $group: { _id: '$event_type', n: { $sum: 1 } } },
    ]).toArray(),
    db.collection(OUTCOMES_COLLECTION).findOne({ exam_id: examId, user_id: userId }, { projection: { status: 1 } }),
    candidateName(db, userId, sub.email),
  ])
  const riskEvents: Record<string, number> = {}
  for (const e of events) if (isRiskProctorEvent(e._id)) riskEvents[String(e._id)] = Number(e.n) || 0
  return attemptSource(exam as Doc, sub as Doc, { candidateName: name, riskEvents, outcome: str(outcome?.status, 40) || null })
}

function tenantExamFilter(tenantId: string | null | undefined): Doc {
  return tenantId ? { tenant_id: tenantId } : {}
}

export async function listTestIds(db: Db, limit: number, tenantId?: string | null): Promise<string[]> {
  const rows = await db.collection('exams').find(tenantExamFilter(tenantId), { projection: { _id: 0, id: 1 } }).limit(limit).toArray()
  return rows.map((r) => str(r.id, 200)).filter(Boolean)
}

export async function listResultSummaryIds(db: Db, limit: number, tenantId?: string | null): Promise<string[]> {
  const ids = await listTestIds(db, limit, tenantId)
  if (!ids.length) return []
  const withSubs = await db.collection('exam_submissions').distinct('exam_id', { exam_id: { $in: ids } })
  return withSubs.map(String)
}

export async function listAttemptIds(db: Db, limit: number, tenantId?: string | null): Promise<string[]> {
  const examIds = await listTestIds(db, 5000, tenantId)
  if (!examIds.length) return []
  const rows = await db.collection('exam_submissions')
    .find({ exam_id: { $in: examIds } }, { projection: { _id: 0, exam_id: 1, user_id: 1 } })
    .sort({ submitted_at: -1 }).limit(limit).toArray()
  return rows.map((r) => `${str(r.exam_id, 200)}:${str(r.user_id, 200)}`).filter((s) => !s.startsWith(':') && !s.endsWith(':'))
}

/**
 * Company test practice runs (server only). A learner starts the Easy /
 * Moderate / Tough version of a pattern; questions are snapshotted onto the
 * attempt so a weekly refresh never changes a run in progress.
 *
 * Sections run one after another with their own clocks (the server owns the
 * time: an answer that arrives after a section's deadline + grace doesn't
 * count, and sections that expire while the learner is away close on their
 * own). After the last section: negative marking, per-section score vs
 * cut-off, and a review with the correct answers.
 */
import 'server-only'
import { questionBank, type BankQuestionDoc } from '@/lib/question-bank'
import { metaFor } from '@/lib/question-types'
import { sanitizeTestCases } from '@/lib/grading'
import { parseCodingAnswer } from '@/lib/coding-answer'
import { executeOnce } from '@/lib/piston'
import {
  advanceExpiredSections, isLateSubmit, practiceMarks, scoreAttempt, sectionDeadline, type AttemptScore,
} from './compose'
import { reconcileVersion } from './build'
import { attempts, getPattern, versions } from './db'
import { LEVEL_LABEL, versionId, type PracticeLevel } from './types'

type Doc = Record<string, any>

export interface SnapshotQuestion {
  id: string
  type: string
  title: string
  prompt: string
  options?: string[]
  pairs?: { left: string; right: string }[]
  matrix?: { rows: string[]; columns: string[] }
  table?: { columns: string[]; rows: string[] }
  scale?: { min: number; max: number; minLabel?: string; maxLabel?: string }
  image_url?: string
  regions?: { id: string; x: number; y: number; w: number; h: number; label?: string }[]
  language?: string
  starter_code?: string
  difficulty: string
  marks: number
  // Hidden until the attempt is over:
  answer?: string
  explanation?: string
  tolerance?: number
  test_cases?: { input: string; output: string }[]
}

interface AttemptSection {
  id: string
  name: string
  timeMinutes: number
  cutoffPercent: number
  questions: SnapshotQuestion[]
  startedAt: string | null
  deadline: string | null
  submittedAt: string | null
  late: boolean
  answers: Record<string, string>
}

export interface AttemptDoc {
  id: string
  userId: string
  patternId: string
  companySlug: string
  companyName: string
  examName: string
  level: PracticeLevel
  versionRevision: number
  incomplete: boolean
  negativeMarking: number
  cutoffPercent: number
  sections: AttemptSection[]
  current: number
  status: 'in_progress' | 'completed'
  result?: AttemptScore
  createdAt: string
  completedAt?: string
}

export class PracticeError extends Error {
  constructor(message: string, public status: number) { super(message) }
}

const MAX_CASES = 5
const MAX_ANSWER = 20_000

export function snapshot(b: BankQuestionDoc): SnapshotQuestion {
  const cases = sanitizeTestCases(b.test_cases).slice(0, MAX_CASES).map((c) => ({ input: c.input, output: c.output }))
  return {
    id: b.id, type: b.type, title: b.title, prompt: b.question, difficulty: b.difficulty, marks: practiceMarks(b.type),
    ...(b.options?.length ? { options: b.options } : {}),
    ...(b.pairs ? { pairs: b.pairs } : {}),
    ...(b.matrix ? { matrix: b.matrix } : {}),
    ...(b.table ? { table: b.table } : {}),
    ...(b.scale ? { scale: b.scale } : {}),
    ...(b.image_url ? { image_url: b.image_url } : {}),
    ...(b.regions ? { regions: b.regions } : {}),
    ...(b.language ? { language: b.language } : {}),
    ...(b.starter_code ? { starter_code: b.starter_code } : {}),
    ...(b.answer ? { answer: b.answer } : {}),
    ...(b.explanation ? { explanation: b.explanation } : {}),
    ...(typeof b.tolerance === 'number' ? { tolerance: b.tolerance } : {}),
    ...(cases.length ? { test_cases: cases } : {}),
  }
}

/** What the learner may see of a question while the attempt runs. */
export function publicQuestion(q: SnapshotQuestion): Omit<SnapshotQuestion, 'answer' | 'explanation' | 'tolerance' | 'test_cases'> {
  const { answer: _a, explanation: _e, tolerance: _t, test_cases: _c, ...rest } = q
  // `pairs` IS the answer key: keep lefts in order, hand out the rights sorted
  // (same rule as lib/exam-access.ts candidateQuestion).
  if (rest.pairs) {
    const rights = rest.pairs.map((p) => p.right).sort((x, y) => x.localeCompare(y))
    rest.pairs = rest.pairs.map((p, i) => ({ left: p.left, right: rights[i] }))
  }
  return rest
}

export async function startAttempt(userId: string, patternId: string, level: PracticeLevel, now = new Date()): Promise<AttemptDoc> {
  const pattern = await getPattern(patternId)
  if (!pattern || !pattern.active) throw new PracticeError('This test pattern is not available.', 404)
  const stored = await (await versions()).findOne({ id: versionId(patternId, level) }, { projection: { _id: 0 } })
  if (!stored) throw new PracticeError(`The ${LEVEL_LABEL[level].toLowerCase()} version isn't ready yet. Try another level or check back soon.`, 409)
  const version = await reconcileVersion(stored, pattern)
  const ids = version.sections.flatMap((s) => s.questionIds)
  const docs = ids.length
    ? await (await questionBank()).find({ id: { $in: ids }, is_active: true, review_status: { $ne: 'draft' } } as never, { projection: { _id: 0 } }).toArray()
    : []
  const byId = new Map(docs.map((d) => [d.id, d as BankQuestionDoc]))
  const sections: AttemptSection[] = []
  for (const vs of version.sections) {
    const def = pattern.sections.find((s) => s.id === vs.sectionId)
    if (!def) continue
    const questions = vs.questionIds.map((id) => byId.get(id)).filter((d): d is BankQuestionDoc => !!d).map(snapshot)
    if (!questions.length) continue
    sections.push({
      id: def.id, name: def.name, timeMinutes: def.timeMinutes, cutoffPercent: def.cutoffPercent ?? pattern.cutoffPercent,
      questions, startedAt: null, deadline: null, submittedAt: null, late: false, answers: {},
    })
  }
  if (!sections.length) throw new PracticeError(`The ${LEVEL_LABEL[level].toLowerCase()} version has no approved questions yet. Check back soon.`, 409)
  const startedAt = now.toISOString()
  sections[0].startedAt = startedAt
  sections[0].deadline = sectionDeadline(startedAt, sections[0].timeMinutes)
  const doc: AttemptDoc = {
    id: crypto.randomUUID(), userId, patternId, companySlug: pattern.companySlug, companyName: pattern.companyName,
    examName: pattern.examName, level, versionRevision: version.revision,
    incomplete: !version.complete || sections.length < pattern.sections.length,
    negativeMarking: pattern.negativeMarking, cutoffPercent: pattern.cutoffPercent,
    sections, current: 0, status: 'in_progress', createdAt: startedAt,
  }
  await (await attempts()).insertOne({ ...doc } as never)
  return doc
}

export async function codeRatios(section: Pick<AttemptSection, 'late' | 'questions' | 'answers'>): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  if (section.late) return out
  for (const q of section.questions) {
    if (metaFor(q.type).deterministic || metaFor(q.type).group !== 'coding' || !q.test_cases?.length) continue
    const raw = section.answers[q.id]
    if (!raw) { out[q.id] = 0; continue }
    const parsed = parseCodingAnswer(raw)
    const code = parsed.isStructured ? parsed.code : raw
    if (!code.trim()) { out[q.id] = 0; continue }
    let passed = 0
    try {
      for (const tc of q.test_cases) {
        const run = await executeOnce({ language: parsed.language || q.language || 'python', source: code, stdin: tc.input || '' })
        if (run.run.code === 0 && (run.run.stdout || '').trim() === (tc.output || '').trim()) passed++
      }
      out[q.id] = passed / q.test_cases.length
    } catch (e) {
      // Runner unavailable: leave it unscored rather than marking it wrong.
      console.error('[company-tests] code run failed:', (e as Error)?.message)
    }
  }
  return out
}

async function finishAttempt(a: AttemptDoc, now: Date): Promise<AttemptDoc> {
  const inputs = []
  for (const s of a.sections) {
    inputs.push({
      id: s.id, name: s.name, cutoffPercent: s.cutoffPercent, late: s.late, answers: s.answers,
      questions: s.questions.map((q) => ({ id: q.id, type: q.type, marks: q.marks, options: q.options, answer: q.answer, tolerance: q.tolerance, pairs: q.pairs, matrix: q.matrix, table: q.table })),
      codeRatios: await codeRatios(s),
    })
  }
  const result = scoreAttempt(inputs, a.negativeMarking, a.cutoffPercent)
  return { ...a, status: 'completed', current: a.sections.length, result, completedAt: now.toISOString() }
}

/** Load the learner's attempt, closing sections whose time ran out. */
export async function loadAttempt(userId: string, id: string, now = new Date()): Promise<AttemptDoc> {
  const col = await attempts()
  const a = (await col.findOne({ id, userId }, { projection: { _id: 0 } })) as unknown as AttemptDoc | null
  if (!a) throw new PracticeError('Practice run not found.', 404)
  if (a.status !== 'in_progress') return a
  const next = advanceExpiredSections(a.sections, a.current, now)
  if (next === a.current) return a
  let updated: AttemptDoc = { ...a, current: next }
  if (next >= a.sections.length) updated = await finishAttempt(updated, now)
  // Only one writer wins; a loser re-reads.
  const r = await col.updateOne({ id, userId, status: 'in_progress', current: a.current }, { $set: { sections: updated.sections, current: updated.current, status: updated.status, ...(updated.result ? { result: updated.result, completedAt: updated.completedAt } : {}) } })
  if (!r.modifiedCount) return (await col.findOne({ id, userId }, { projection: { _id: 0 } })) as unknown as AttemptDoc
  return updated
}

function cleanAnswers(raw: unknown, section: AttemptSection): Record<string, string> {
  const out: Record<string, string> = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  const ids = new Set(section.questions.map((q) => q.id))
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!ids.has(k)) continue
    const s = Array.isArray(v) ? v.map((x) => String(x ?? '')).join(', ') : typeof v === 'string' || typeof v === 'number' ? String(v) : ''
    if (s.trim()) out[k] = s.slice(0, MAX_ANSWER)
  }
  return out
}

/** Submit the current section (the learner's button or the client timer). */
export async function submitSection(userId: string, id: string, sectionId: string, rawAnswers: unknown, now = new Date()): Promise<AttemptDoc> {
  const a = await loadAttempt(userId, id, now)
  if (a.status !== 'in_progress') return a
  const idx = a.current
  const s = a.sections[idx]
  if (!s || s.id !== sectionId) throw new PracticeError('That section is already closed.', 409)
  s.answers = cleanAnswers(rawAnswers, s)
  s.late = !!s.deadline && isLateSubmit(s.deadline, now)
  s.submittedAt = now.toISOString()
  let updated: AttemptDoc = { ...a, current: idx + 1 }
  const next = a.sections[idx + 1]
  if (next) {
    next.startedAt = now.toISOString()
    next.deadline = sectionDeadline(next.startedAt, next.timeMinutes)
  } else {
    updated = await finishAttempt(updated, now)
  }
  const col = await attempts()
  const r = await col.updateOne({ id, userId, status: 'in_progress', current: idx }, { $set: { sections: updated.sections, current: updated.current, status: updated.status, ...(updated.result ? { result: updated.result, completedAt: updated.completedAt } : {}) } })
  if (!r.modifiedCount) throw new PracticeError('That section was already submitted.', 409)
  return updated
}

/** The attempt as the learner sees it: no answers until the run is over. */
export function attemptView(a: AttemptDoc, now = new Date()) {
  const base = {
    id: a.id, patternId: a.patternId, companySlug: a.companySlug, companyName: a.companyName, examName: a.examName,
    level: a.level, incomplete: a.incomplete, negativeMarking: a.negativeMarking, cutoffPercent: a.cutoffPercent,
    status: a.status, current: a.current, serverNow: now.toISOString(), createdAt: a.createdAt,
    sections: a.sections.map((s, i) => ({
      id: s.id, name: s.name, timeMinutes: s.timeMinutes, cutoffPercent: s.cutoffPercent, questionCount: s.questions.length,
      state: i < a.current ? 'done' : i === a.current && a.status === 'in_progress' ? 'current' : 'upcoming',
      late: s.late,
    })),
  }
  if (a.status === 'in_progress') {
    const s = a.sections[a.current]
    return { ...base, section: s ? { id: s.id, name: s.name, deadline: s.deadline, questions: s.questions.map(publicQuestion) } : null }
  }
  return {
    ...base,
    result: a.result,
    review: a.sections.map((s) => ({
      id: s.id, name: s.name, late: s.late,
      questions: s.questions.map((q) => {
        const r = a.result?.sections.find((x) => x.id === s.id)?.questions.find((x) => x.id === q.id)
        return { ...publicQuestion(q), answer: q.answer, explanation: q.explanation, yourAnswer: s.answers[q.id] ?? '', status: r?.status ?? 'unanswered', awarded: r?.awarded ?? 0 }
      }),
    })),
  }
}

export async function recentAttempts(userId: string, patternId?: string, limit = 10) {
  const q: Doc = { userId }
  if (patternId) q.patternId = patternId
  const rows = await (await attempts()).find(q, { projection: { _id: 0, id: 1, patternId: 1, examName: 1, companyName: 1, level: 1, status: 1, createdAt: 1, 'result.percent': 1, 'result.passed': 1 } })
    .sort({ createdAt: -1 }).limit(Math.min(50, limit)).toArray()
  return rows
}

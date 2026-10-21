/**
 * Adaptive tests — server side (rules in lib/adaptive-test.ts).
 *
 * State lives on the attempt's exam_drafts row (`adaptive`): the questions
 * served so far (bank id, level, the candidate's answer and whether it was
 * right), the one waiting for an answer, and a version for conditional
 * writes (two tabs can't answer the same question twice). The client only
 * ever sees the current question, in the candidate projection (no answer
 * key) — never the pool.
 *
 * Only auto-graded, scored question types are drawn (each answer is graded
 * the moment it arrives, so the next level can be chosen).
 */
import 'server-only'
import { randomInt } from 'crypto'
import type { Db } from 'mongodb'
import { compareObjectiveAnswer } from '@/lib/grading'
import { QUESTION_TYPE_META, type QuestionType } from '@/lib/question-types'
import { bankToExamQuestion, type BankQuestionDoc } from '@/lib/question-bank'
import { candidateExamView } from '@/lib/exam-access'
import { domainBankFilter, type BankDifficulty, type QuestionDomain } from '@/lib/question-bot/domains'
import {
  ADAPTIVE_LENGTH_DEFAULT, ADAPTIVE_LEVELS, DIFFICULTY_WEIGHT, adaptiveScore, fallbackLevels, nextDifficulty, type AdaptiveAnswer,
} from '@/lib/adaptive-test'

type Doc = Record<string, unknown>

export interface AdaptiveItem {
  /** Id the candidate sees (`a1`, `a2`, …) — bank ids stay server-side. */
  qid: string
  bank_id: string
  difficulty: BankDifficulty
  served_at: string
  answer?: string
  correct?: boolean
  answered_at?: string
}

export interface AdaptiveState {
  attempt_no: number
  v: number
  items: AdaptiveItem[]
  /** All questions answered, or the bank ran out. */
  done: boolean
  exhausted?: boolean
}

/** Types an adaptive test may draw: the classic auto-graded, scored kinds (graded on arrival). */
const ADAPTIVE_CANDIDATE_TYPES: readonly string[] = ['mcq', 'multiple_response', 'true_false', 'yes_no', 'fill_blanks', 'numeric', 'short_answer', 'ordering', 'matching', 'matrix', 'table_fill']
export const ADAPTIVE_TYPES: QuestionType[] = (Object.keys(QUESTION_TYPE_META) as QuestionType[])
  .filter((t) => ADAPTIVE_CANDIDATE_TYPES.includes(t) && QUESTION_TYPE_META[t].deterministic && QUESTION_TYPE_META[t].scored)

export function examAdaptiveLength(exam: Doc): number {
  const n = Math.floor(Number(exam.adaptive_length))
  return Number.isFinite(n) && n >= 3 ? n : ADAPTIVE_LENGTH_DEFAULT
}

async function examDomain(db: Db, exam: Doc): Promise<Pick<QuestionDomain, 'id' | 'kind' | 'branch'>> {
  const id = String(exam.adaptive_domain || '')
  const d = (await db.collection('question_domains').findOne({ id }, { projection: { _id: 0, id: 1, kind: 1, branch: 1 } })) as Pick<QuestionDomain, 'id' | 'kind' | 'branch'> | null
  // A deleted domain still matches the questions tagged with it.
  return d ?? { id, kind: 'skill' }
}

function poolMatch(domain: Pick<QuestionDomain, 'id' | 'kind' | 'branch'>, difficulty: BankDifficulty, exclude: string[]): Doc {
  return { $and: [domainBankFilter(domain), { is_active: { $ne: false }, review_status: { $ne: 'draft' }, difficulty, type: { $in: ADAPTIVE_TYPES }, id: { $nin: exclude } }] }
}

/** One random unused approved question at the wanted level, else the nearest level. */
async function draw(db: Db, domain: Pick<QuestionDomain, 'id' | 'kind' | 'branch'>, wanted: BankDifficulty, exclude: string[]): Promise<BankQuestionDoc | null> {
  for (const level of fallbackLevels(wanted)) {
    const [doc] = await db.collection('question_bank').aggregate<BankQuestionDoc>([{ $match: poolMatch(domain, level, exclude) }, { $sample: { size: 1 } }]).toArray()
    if (doc) return doc
  }
  return null
}

/** Approved adaptive-ready questions per level for a domain (admin warning). */
export async function adaptivePoolCounts(db: Db, domainId: string): Promise<Record<BankDifficulty, number>> {
  const domain = await examDomain(db, { adaptive_domain: domainId })
  const rows = await db.collection('question_bank').aggregate<{ _id: string; n: number }>([
    { $match: { $and: [domainBankFilter(domain), { is_active: { $ne: false }, review_status: { $ne: 'draft' }, type: { $in: ADAPTIVE_TYPES } }] } },
    { $group: { _id: '$difficulty', n: { $sum: 1 } } },
  ]).toArray()
  const out = { Easy: 0, Medium: 0, Hard: 0 } as Record<BankDifficulty, number>
  for (const r of rows) if ((ADAPTIVE_LEVELS as readonly string[]).includes(r._id)) out[r._id as BankDifficulty] = r.n
  return out
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Candidate view of one bank question (no answer key; options shuffled). */
function candidateItem(b: BankQuestionDoc, qid: string): Doc {
  const exam = bankToExamQuestion(b)
  const view = (candidateExamView({ questionList: [{ ...exam, id: qid }] }).questionList as Doc[])[0] ?? {}
  if (Array.isArray(view.options) && view.options.length > 1) view.options = shuffle(view.options as string[])
  return view
}

export interface AdaptiveView {
  question: Doc | null
  index: number
  total: number
  answered: number
  done: boolean
  exhausted: boolean
}

async function viewOf(db: Db, state: AdaptiveState, total: number): Promise<AdaptiveView> {
  const current = state.done ? null : state.items.find((i) => i.answer === undefined) ?? null
  let question: Doc | null = null
  if (current) {
    const b = (await db.collection('question_bank').findOne({ id: current.bank_id }, { projection: { _id: 0 } })) as BankQuestionDoc | null
    question = b ? candidateItem(b, current.qid) : null
  }
  const answered = state.items.filter((i) => i.answer !== undefined).length
  return { question, index: current ? state.items.indexOf(current) + 1 : answered, total, answered, done: state.done || (!current && answered > 0), exhausted: !!state.exhausted }
}

const history = (s: AdaptiveState): AdaptiveAnswer[] => s.items.filter((i) => i.answer !== undefined).map((i) => ({ difficulty: i.difficulty, correct: i.correct === true }))

/**
 * Start (or resume) the adaptive state for this attempt and return the
 * current question. A new attempt starts a fresh state.
 */
export async function startAdaptive(db: Db, exam: Doc, userId: string, attemptNo: number, draft: Doc | null): Promise<AdaptiveView> {
  const examId = String(exam.id)
  const total = examAdaptiveLength(exam)
  const existing = draft?.adaptive as AdaptiveState | undefined
  if (existing && existing.attempt_no === attemptNo) return viewOf(db, existing, total)

  const domain = await examDomain(db, exam)
  const first = await draw(db, domain, nextDifficulty([]), [])
  const state: AdaptiveState = first
    ? { attempt_no: attemptNo, v: 1, items: [{ qid: 'a1', bank_id: first.id, difficulty: first.difficulty, served_at: new Date().toISOString() }], done: false }
    : { attempt_no: attemptNo, v: 1, items: [], done: true, exhausted: true }
  const r = await db.collection('exam_drafts').findOneAndUpdate(
    { exam_id: examId, user_id: userId, attempt_no: attemptNo, 'adaptive.attempt_no': { $ne: attemptNo } },
    { $set: { adaptive: state, updated_at: new Date().toISOString() } },
    { returnDocument: 'after', projection: { _id: 0, adaptive: 1 } },
  )
  // Lost a race with another tab: use whichever state was stored.
  const stored = (r?.adaptive as AdaptiveState | undefined) ?? ((await db.collection('exam_drafts').findOne({ exam_id: examId, user_id: userId }, { projection: { _id: 0, adaptive: 1 } }))?.adaptive as AdaptiveState | undefined)
  return viewOf(db, stored && stored.attempt_no === attemptNo ? stored : state, total)
}

export type AnswerResult = { ok: true; view: AdaptiveView } | { ok: false; status: number; error: string }

/** Grade the current question, pick the next level and draw the next question. */
export async function answerAdaptive(db: Db, exam: Doc, userId: string, attemptNo: number, questionId: string, rawAnswer: string): Promise<AnswerResult> {
  const examId = String(exam.id)
  const total = examAdaptiveLength(exam)
  const draft = await db.collection('exam_drafts').findOne({ exam_id: examId, user_id: userId }, { projection: { _id: 0, adaptive: 1, attempt_no: 1 } })
  const state = draft?.adaptive as AdaptiveState | undefined
  if (!state || state.attempt_no !== attemptNo) return { ok: false, status: 409, error: 'Start the assessment first.' }
  if (state.done) return { ok: true, view: await viewOf(db, state, total) }
  const current = state.items.find((i) => i.answer === undefined)
  if (!current) return { ok: true, view: await viewOf(db, { ...state, done: true }, total) }
  if (current.qid !== questionId) return { ok: false, status: 409, error: 'This question was already answered. Reload to continue.' }

  const bank = (await db.collection('question_bank').findOne({ id: current.bank_id }, { projection: { _id: 0 } })) as BankQuestionDoc | null
  const answer = rawAnswer.slice(0, 5000).trim()
  const correct = !!bank && !!answer && compareObjectiveAnswer({
    type: bank.type, options: bank.options, answer: String(bank.answer ?? ''), tolerance: bank.tolerance, pairs: bank.pairs, matrix: bank.matrix, table: bank.table,
  }, answer).correct

  const items = state.items.map((i) => (i === current ? { ...i, answer, correct, answered_at: new Date().toISOString() } : i))
  const next: AdaptiveState = { ...state, v: state.v + 1, items }
  const answered = items.filter((i) => i.answer !== undefined).length
  if (answered >= total) {
    next.done = true
  } else {
    const domain = await examDomain(db, exam)
    const pick = await draw(db, domain, nextDifficulty(history(next)), items.map((i) => i.bank_id))
    if (pick) items.push({ qid: `a${items.length + 1}`, bank_id: pick.id, difficulty: pick.difficulty, served_at: new Date().toISOString() })
    else { next.done = true; next.exhausted = true }
  }
  const w = await db.collection('exam_drafts').updateOne(
    { exam_id: examId, user_id: userId, 'adaptive.attempt_no': attemptNo, 'adaptive.v': state.v },
    { $set: { adaptive: next, updated_at: new Date().toISOString() } },
  )
  if (w.modifiedCount !== 1) return { ok: false, status: 409, error: 'This question was already answered. Reload to continue.' }
  return { ok: true, view: await viewOf(db, next, total) }
}

/** Submission fields for an adaptive attempt (graded as answered; weights by level). */
export function adaptiveSubmission(state: AdaptiveState | undefined, length: number): {
  answers: Record<string, string>
  details: Array<{ qId: string; correct: boolean; points: number; answer: string; pending_review: boolean; difficulty: BankDifficulty; bank_id: string }>
  score: number
  maxScore: number
  summary: ReturnType<typeof adaptiveScore>
} {
  const items = (state?.items ?? []).filter((i) => i.answer !== undefined)
  const answers: Record<string, string> = {}
  for (const i of items) answers[i.qid] = i.answer ?? ''
  const summary = adaptiveScore(items.map((i) => ({ difficulty: i.difficulty, correct: i.correct === true })), length)
  return {
    answers,
    details: items.map((i) => ({ qId: i.qid, correct: i.correct === true, points: DIFFICULTY_WEIGHT[i.difficulty] ?? 0, answer: i.answer ?? '', pending_review: false, difficulty: i.difficulty, bank_id: i.bank_id })),
    score: summary.score,
    maxScore: summary.max,
    summary,
  }
}

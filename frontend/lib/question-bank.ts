/**
 * Question bank — shared schema, normalization, and Mongo helpers.
 *
 * A question-bank doc is a standalone, reusable question that exams can be
 * auto-populated from. Fields mirror the exam `QuestionDoc` shape so a bank
 * doc can be converted straight into an exam question (`bankToExamQuestion`).
 */
import { getMongoDb } from '@/lib/mongodb'
import { createHash } from 'crypto'
import type { Collection } from 'mongodb'

export type BankQuestionType = 'mcq' | 'multiple_response' | 'true_false' | 'coding' | 'descriptive' | 'fill_blanks'

export interface BankQuestionDoc {
  id: string
  /** Short question label (for tables/lists). */
  title: string
  /** Full question prompt. */
  question: string
  type: BankQuestionType
  options?: string[]
  answer?: string
  explanation?: string
  difficulty: 'Easy' | 'Medium' | 'Hard'
  marks: number
  degree_type?: string
  branch?: string
  subject?: string
  tech_stack?: string[]
  tags?: string[]
  source: 'seed' | 'ai' | 'import' | 'manual'
  is_active: boolean
  createdAt: string
  updatedAt: string
}

export const BANK_QUESTION_TYPES: BankQuestionType[] = ['mcq', 'multiple_response', 'true_false', 'coding', 'descriptive', 'fill_blanks']

export async function questionBank(): Promise<Collection<BankQuestionDoc>> {
  return (await getMongoDb()).collection<BankQuestionDoc>('question_bank')
}

const nowIso = (): string => new Date().toISOString()

function normString(v: unknown, max = 2000): string {
  if (typeof v !== 'string') return ''
  const s = v.trim()
  return s.length > max ? s.slice(0, max) : s
}

/** Content hash used to skip duplicate imports. */
export function bankContentHash(doc: Partial<BankQuestionDoc>): string {
  const core = [
    doc.question || doc.title || '',
    doc.type || 'mcq',
    doc.difficulty || '',
    doc.branch || '',
    (Array.isArray(doc.options) ? doc.options.join('|') : ''),
    doc.answer || '',
  ].join('::')
  return createHash('sha1').update(core).digest('hex')
}

/**
 * Normalize a raw (API / import / seed) object into a BankQuestionDoc.
 * Tolerates the legacy shape (`title` as the prompt, `domain` as branch,
 * uppercase `type`). Returns `null` when the question has no usable prompt.
 */
export function normalizeBankQuestion(raw: Record<string, unknown>): BankQuestionDoc | null {
  const question = normString(raw.question || raw.prompt || raw.title)
  const title = normString(raw.title, 200) || question.slice(0, 120)
  if (!question) return null

  const rawType = normString(raw.type || 'mcq', 40).toLowerCase()
  const type: BankQuestionType = BANK_QUESTION_TYPES.includes(rawType as BankQuestionType) ? (rawType as BankQuestionType) : 'mcq'

  const difficultyRaw = normString(raw.difficulty || 'Medium', 20).toLowerCase()
  const difficulty: BankQuestionDoc['difficulty'] = difficultyRaw === 'easy' ? 'Easy' : difficultyRaw === 'hard' ? 'Hard' : 'Medium'

  const options = Array.isArray(raw.options)
    ? raw.options.map((o) => normString(o, 500)).filter(Boolean)
    : normString(raw.options, 3000)
        .split('|')
        .map((s) => s.trim())
        .filter(Boolean)

  const answer = normString(raw.answer || raw.correct_answer, 2000)
  const explanation = normString(raw.explanation, 4000)

  const tags = Array.isArray(raw.tags)
    ? raw.tags.map((t) => normString(t, 60)).filter(Boolean)
    : normString(raw.tags, 500).split(',').map((s) => s.trim().replace(/^#/, '')).filter(Boolean)

  const techStackRaw: unknown = raw.tech_stack || raw.techStack || undefined
  const techStack = Array.isArray(techStackRaw)
    ? techStackRaw.map((t) => normString(t, 60)).filter(Boolean)
    : normString(techStackRaw, 500).split(',').map((s) => s.trim()).filter(Boolean)

  const branch = normString(raw.branch || raw.domain, 60).toLowerCase()
  const degreeType = normString(raw.degree_type, 40).toLowerCase()
  const subject = normString(raw.subject || raw.topic, 120)

  const marks = Number(raw.marks || raw.score) > 0 ? Number(raw.marks || raw.score) : 10
  const sourceRaw = normString(raw.source, 20).toLowerCase()

  return {
    id: normString(raw.id, 60) || crypto.randomUUID(),
    title,
    question,
    type,
    options: ['mcq', 'multiple_response', 'true_false', 'fill_blanks'].includes(type) ? options : undefined,
    answer: answer || undefined,
    explanation: explanation || undefined,
    difficulty,
    marks,
    degree_type: degreeType || undefined,
    branch: branch || undefined,
    subject: subject || undefined,
    tech_stack: techStack.length ? techStack : undefined,
    tags: tags.length ? tags : undefined,
    source: sourceRaw === 'ai' || sourceRaw === 'seed' || sourceRaw === 'import' ? (sourceRaw as BankQuestionDoc['source']) : 'manual',
    is_active: raw.is_active !== false,
    createdAt: normString(raw.createdAt, 40) || nowIso(),
    updatedAt: nowIso(),
  }
}

/**
 * Convert a bank doc into the exam's embedded `QuestionDoc` shape so it can be
 * dropped straight into `exams.questionList`.
 */
export function bankToExamQuestion(b: BankQuestionDoc): Record<string, unknown> {
  return {
    id: crypto.randomUUID(),
    type: b.type,
    title: b.title,
    prompt: b.question,
    options: b.options,
    answer: b.answer,
    score: b.marks,
    ...(b.branch ? { branch: b.branch } : {}),
    ...(b.subject ? { subject: b.subject } : {}),
    ...(b.difficulty ? { difficulty: b.difficulty } : {}),
  }
}

/**
 * Randomly sample `count` active questions from the bank matching the given
 * branch/degree/topic constraints, split across difficulties if requested.
 * Uses MongoDB `$sample` for unbiased random selection.
 */
export async function sampleFromBank(params: {
  branch?: string
  degree_type?: string
  subjects?: string[]
  types?: string[]
  count: number
  difficultySplit?: { Easy: number; Medium: number; Hard: number }
}): Promise<BankQuestionDoc[]> {
  if (params.count <= 0) return []
  const col = await questionBank()
  const picked: BankQuestionDoc[] = []
  const already = new Set<string>()

  const split = params.difficultySplit || { Easy: Math.ceil(params.count / 3), Medium: Math.ceil(params.count / 3), Hard: params.count - 2 * Math.ceil(params.count / 3) }

  for (const difficulty of ['Easy', 'Medium', 'Hard'] as const) {
    const want = Math.max(0, Math.round(split[difficulty]) || 0)
    if (want === 0) continue
    const match: Record<string, unknown> = { is_active: true, difficulty }
    if (params.branch) match.branch = params.branch
    if (params.degree_type) match.degree_type = params.degree_type
    if (params.types?.length) match.type = { $in: params.types }
    if (params.subjects?.length) match.subject = { $in: params.subjects }
    const docs = await col.aggregate<BankQuestionDoc>([{ $match: match }, { $sample: { size: want } }]).toArray()
    for (const d of docs) {
      if (already.has(d.id)) continue
      already.add(d.id)
      picked.push(d)
    }
  }

  // Top up any shortfall with unrestricted picks.
  if (picked.length < params.count) {
    const want = params.count - picked.length
    const match: Record<string, unknown> = { is_active: true }
    if (params.branch) match.branch = params.branch
    if (params.degree_type) match.degree_type = params.degree_type
    if (params.types?.length) match.type = { $in: params.types }
    const docs = await col.aggregate<BankQuestionDoc>([{ $match: match }, { $sample: { size: want * 2 } }]).toArray()
    for (const d of docs) {
      if (picked.length >= params.count) break
      if (already.has(d.id)) continue
      already.add(d.id)
      picked.push(d)
    }
  }

  return picked.slice(0, params.count)
}

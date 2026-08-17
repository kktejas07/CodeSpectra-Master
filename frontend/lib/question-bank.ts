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

/** Sample inputs + expected outputs used to verify a coding question. */
export interface BankTestCase {
  input: string
  output: string
}

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
  /** Sample test cases (coding questions). */
  test_cases?: BankTestCase[]
  /** Industry vertical (e.g. 'software', 'manufacturing'). */
  industry?: string
  /** Role seniority level (e.g. 'entry', 'mid', 'senior'). */
  level?: string
  /** Assessment category (e.g. 'skills', 'cognitive', 'behavioral'). */
  assessment_category?: string
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

/**
 * True when a title is a placeholder with no meaning — "Q1", "Q.3", "Question 7",
 * "1.2.3", "DBMS Q1", "9". These are unusable for a question-bank list UI.
 * A leading numbering prefix ("Q1: Deep Learning Basics") is NOT placeholder —
 * the description after it is usable and is stripped by cleanTitle().
 */
export function isPlaceholderTitle(title: string): boolean {
  const t = (title || '').trim()
  if (!t) return true
  return (
    /^[qQ][\s.:_\-]*\d+(\s*[qQ]?\d*)*$/.test(t) || // Q1, Q.3, Q 12, Q1.2
    /^question[\s.:_\-]*\d+$/i.test(t) || // Question 7
    /^\d+([./_-]\d+)*$/.test(t) || // 1, 1.1, 1.2.3
    /^[a-z0-9][\w /&+.-]*[qQ][\s.:_\-]*\d+$/.test(t) || // DBMS Q1, Topic-4.Q2
    /^n\/a$|^null$|^undefined$/i.test(t)
  )
}

/** Strip a numbering prefix like "Q1:", "Q.3 -", "Question 7." from a title. */
export function cleanTitle(title: string): string {
  const t = (title || '').trim()
  const m = t.match(/^(?:[qQ]\s*\d+|[qQ][\s.:_\-]*\d+|question\s*\d+|[\d]+([./_-][\d]+)*)\s*[:.\-–—]*\s+(.+)$/i)
  return m && m[2] ? m[2].trim() : t
}

/** Derive a readable short title from the question prompt. */
export function deriveTitleFromQuestion(question: string, max = 96): string {
  const q = (question || '').trim().replace(/\s+/g, ' ')
  if (!q) return 'Untitled question'
  if (q.length <= max) return q.replace(/[?\s.]*$/, '')
  const cut = q.slice(0, max + 1)
  const lastSpace = cut.lastIndexOf(' ')
  const t = lastSpace > 40 ? cut.slice(0, lastSpace) : cut
  return t.replace(/[?\s.,;:]+$/, '') + '…'
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
  const rawTitle = normString(raw.title, 200)
  const cleaned = cleanTitle(rawTitle)
  const title = !cleaned || isPlaceholderTitle(cleaned) ? deriveTitleFromQuestion(question) : cleaned
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

  // test_cases — LLMs emit varied shapes; accept all and normalize.
  const testCases: BankTestCase[] = []
  if (Array.isArray(raw.test_cases)) {
    for (const tc of raw.test_cases as Array<Record<string, unknown>>) {
      if (tc && typeof tc === 'object') {
        const input = normString(tc.input ?? tc.stdin, 1000)
        const output = normString(tc.output ?? tc.expected_output ?? tc.expected_stdout ?? tc.answer, 2000)
        if (input !== '' || output !== '') testCases.push({ input, output })
      }
    }
  }

  const branch = normString(raw.branch || raw.domain, 60).toLowerCase()
  const degreeType = normString(raw.degree_type, 40).toLowerCase()
  const subject = normString(raw.subject || raw.topic, 120)
  const industry = normString(raw.industry, 40).toLowerCase()
  const level = normString(raw.level || raw.seniority, 30).toLowerCase()
  const assessmentCategory = normString(raw.assessment_category || raw.category, 30).toLowerCase()

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
    test_cases: testCases.length ? testCases : undefined,
    tags: tags.length ? tags : undefined,
    industry: industry || undefined,
    level: level || undefined,
    assessment_category: assessmentCategory || undefined,
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
    ...(b.industry ? { industry: b.industry } : {}),
    ...(b.level ? { level: b.level } : {}),
    ...(b.assessment_category ? { assessment_category: b.assessment_category } : {}),
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
  industry?: string
  level?: string
  assessment_category?: string
  count: number
  difficultySplit?: { Easy: number; Medium: number; Hard: number }
}): Promise<BankQuestionDoc[]> {
  if (params.count <= 0) return []
  const col = await questionBank()
  const picked: BankQuestionDoc[] = []
  const already = new Set<string>()

  const split = params.difficultySplit || { Easy: Math.ceil(params.count / 3), Medium: Math.ceil(params.count / 3), Hard: params.count - 2 * Math.ceil(params.count / 3) }

  const baseMatch = (difficulty: string): Record<string, unknown> => {
    const match: Record<string, unknown> = { is_active: true, difficulty }
    if (params.branch) match.branch = params.branch
    if (params.degree_type) match.degree_type = params.degree_type
    if (params.types?.length) match.type = { $in: params.types }
    if (params.subjects?.length) match.subject = { $in: params.subjects }
    if (params.industry) match.industry = params.industry
    if (params.level) match.level = params.level
    if (params.assessment_category) match.assessment_category = params.assessment_category
    return match
  }

  for (const difficulty of ['Easy', 'Medium', 'Hard'] as const) {
    const want = Math.max(0, Math.round(split[difficulty]) || 0)
    if (want === 0) continue
    const docs = await col.aggregate<BankQuestionDoc>([{ $match: baseMatch(difficulty) }, { $sample: { size: want } }]).toArray()
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
    if (params.industry) match.industry = params.industry
    if (params.level) match.level = params.level
    if (params.assessment_category) match.assessment_category = params.assessment_category
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

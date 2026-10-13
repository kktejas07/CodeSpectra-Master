/**
 * Shared deterministic answer comparison for objective assessment questions.
 *
 * Single source of truth for "is this the same answer?" — used by BOTH the
 * instant submit grader (`/api/exams/[id]/submit`) and the AI-grade path
 * (`lib/ai/grade-question.ts`), so a correct-but-differently-formatted answer
 * ('14.0' vs '14', 'B' vs the option text, 'O(log  n)' vs 'O(log n)') is
 * scored consistently everywhere.
 */
import { metaFor, resolveQuestionType, type GradingKind } from '@/lib/question-types'

/**
 * Legacy alias table kept for backward compatibility. New code should rely on
 * {@link canonicalObjectiveType}, which resolves through the canonical registry
 * (lib/question-types.ts) and therefore covers every objective alias too.
 */
export const OBJECTIVE_TYPE_ALIASES: Record<string, string> = {
  mcq: 'mcq',
  multiplechoice: 'mcq',
  multiple_choice: 'mcq',
  singlechoice: 'mcq',
  truefalse: 'true_false',
  true_false: 'true_false',
  boolean: 'true_false',
  multipleresponse: 'multiple_response',
  multiple_response: 'multiple_response',
  multiselect: 'multiple_response',
  multi_response: 'multiple_response',
  fillblanks: 'fill_blanks',
  fill_blanks: 'fill_blanks',
  fillintheblanks: 'fill_blanks',
  'fillinthe blanks': 'fill_blanks',
  fillblank: 'fill_blanks',
}

/**
 * Canonicalize any objective question-type string → canonical id, else
 * 'free_text'. "Objective" here means the deterministic kinds the submit route
 * can grade without an LLM (choice / multi / blanks / numeric / text /
 * sequence / pairs / matrix / table). Coding variants and descriptive resolve
 * to 'free_text' because they use execution or an LLM.
 */
export function canonicalObjectiveType(type: string): string | 'free_text' {
  const resolved = resolveQuestionType(type)
  if (!resolved) return 'free_text'
  return metaFor(resolved).deterministic ? resolved : 'free_text'
}

/** True for machine-gradeable (non-LLM) types. */
export function isObjectiveType(type: string): boolean {
  return canonicalObjectiveType(type) !== 'free_text'
}

/** Case-insensitive comparison form. */
export function normalizeForCompare(value: string): string {
  return (value || '').replace(/\s+/g, ' ').trim().toLowerCase()
}

/** Case + whitespace-FREE comparison form: 'O(log n)' == 'O(logn)', '72 km/h' == '72km/h'. */
export function normalizeWhitespaceFree(value: string): string {
  return (value || '').replace(/\s+/g, '').trim().toLowerCase()
}

/**
 * First leading number in a string, or null if none. Used for numeric
 * equivalence so '14' / '14.0' / '₹600' / '72 km/h' compare fairly.
 */
export function leadingNumber(value: string): number | null {
  const m = (value || '').trim().match(/[+-]?(\d+(?:\.\d+)?|\.\d+)/)
  if (!m) return null
  const n = Number(m[0])
  return Number.isFinite(n) ? n : null
}

/** Numeric-form equivalence (ignores currency symbols, spaces, trailing units). */
export function numericEqual(a: string, b: string): boolean {
  const na = leadingNumber(a)
  const nb = leadingNumber(b)
  if (na === null || nb === null) return false
  return na === nb
}

/**
 * Resolve a value to a canonical option slot when it is either the option text
 * or a single letter index into the option list (A/B/C…). Returns null when the
 * question has no usable options or the value maps to nothing.
 */
export function optionResolvedKey(value: string, options?: string[]): string | null {
  if (!Array.isArray(options) || options.length === 0) return null
  const v = (value || '').trim()
  if (!v) return null
  const direct = options.findIndex((o) => normalizeForCompare(o) === normalizeForCompare(v))
  if (direct !== -1) return `opt:${direct}`
  if (/^[a-z]$/.test(v.toLowerCase())) {
    const idx = v.toLowerCase().charCodeAt(0) - 97
    if (idx >= 0 && idx < options.length) return `opt:${idx}`
  }
  return null
}

/**
 * Best-effort single-value equality: exact (case/space-normalized) → numeric ->
 * option-slot resolution.
 */
export function answersEqual(a: string, b: string, options?: string[]): boolean {
  const u = (a || '').trim()
  const c = (b || '').trim()
  if (!c) return false
  if (normalizeForCompare(u) === normalizeForCompare(c)) return true
  if (numericEqual(u, c)) return true
  if (normalizeWhitespaceFree(u) === normalizeWhitespaceFree(c)) return true
  const uk = optionResolvedKey(u, options)
  const ck = optionResolvedKey(c, options)
  // null can mean "value doesn't match any option slot" — only trust the key
  // when BOTH sides resolved, so 'B' vs option 'B' still compares fairly.
  if (uk !== null && ck !== null) return uk === ck
  return false
}

/**
 * Multiple-response (comma separated) set equality — order-insensitive, with
 * per-element answersEqual tolerance.
 */
export function multisetEqual(a: string, b: string, options?: string[]): boolean {
  const u = (a || '').split(',').map((s) => s.trim()).filter(Boolean)
  const c = (b || '').split(',').map((s) => s.trim()).filter(Boolean)
  if (u.length === 0 && c.length === 0) return true
  if (u.length !== c.length) return false
  const pool = [...c]
  for (const x of u) {
    const idx = pool.findIndex((y) => answersEqual(x, y, options))
    if (idx === -1) return false
    pool.splice(idx, 1)
  }
  return true
}

/** Numeric equality within an absolute tolerance (tolerance 0 = exact number). */
export function numericEqualTol(a: string, b: string, tolerance?: number): boolean {
  const na = leadingNumber(a)
  const nb = leadingNumber(b)
  if (na === null || nb === null) return false
  const tol = typeof tolerance === 'number' && Number.isFinite(tolerance) && tolerance > 0 ? tolerance : 0
  return Math.abs(na - nb) <= tol + 1e-9
}

/** Split a comma list into non-empty trimmed parts. */
function splitCsv(value: string): string[] {
  return (value || '').split(',').map((s) => s.trim()).filter(Boolean)
}

/**
 * Ordered-list equality: same length and every position equal (per-element
 * answersEqual tolerance). Used for ordering / ranking questions.
 */
export function sequenceEqual(a: string, b: string, options?: string[]): boolean {
  const u = splitCsv(a)
  const c = splitCsv(b)
  if (u.length === 0 || u.length !== c.length) return false
  return u.every((x, i) => answersEqual(x, c[i], options))
}

/** Parse a matching/drag-drop answer into a normalized left→right map. */
function parsePairsAnswer(candidate: string): Map<string, string> {
  const out = new Map<string, string>()
  const raw = (candidate || '').trim()
  if (!raw) return out
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      for (const p of parsed) {
        if (p && typeof p === 'object' && 'left' in p && 'right' in p) {
          out.set(normalizeForCompare(String((p as Record<string, unknown>).left)), String((p as Record<string, unknown>).right))
        }
      }
      return out
    }
    if (parsed && typeof parsed === 'object') {
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) out.set(normalizeForCompare(k), String(v))
      return out
    }
  } catch {
    // Fall through — maybe a CSV of right-hand values in left order.
  }
  return out
}

/**
 * Fraction of pairs matched. `pairs` is the correct left→right mapping; the
 * candidate answer is a JSON map (or legacy CSV of rights in left order).
 */
export function matchingRatio(candidate: string, pairs: Array<{ left: string; right: string }>): number {
  if (!Array.isArray(pairs) || pairs.length === 0) return 0
  const map = parsePairsAnswer(candidate)
  let hit = 0
  for (const p of pairs) {
    const given = map.get(normalizeForCompare(p.left))
    if (given !== undefined && answersEqual(given, p.right)) hit++
  }
  return hit / pairs.length
}

/** Fraction of matrix rows whose chosen column matches the answer CSV. */
export function matrixRatio(candidate: string, rowCount: number, answerCsv: string): number {
  if (rowCount <= 0) return 0
  const u = splitCsv(candidate)
  const c = splitCsv(answerCsv)
  let hit = 0
  for (let i = 0; i < rowCount; i++) {
    if (u[i] !== undefined && c[i] !== undefined && answersEqual(u[i], c[i])) hit++
  }
  return hit / rowCount
}

/** Shape of a question that {@link compareObjectiveAnswer} can grade. */
export interface QuestionGradingSpec {
  type: string
  options?: string[]
  answer?: string
  tolerance?: number
  pairs?: Array<{ left: string; right: string }>
  matrix?: { rows: string[]; columns: string[] }
  table?: { columns: string[]; rows: string[] }
}

export interface ObjectiveComparison {
  /** Fully correct (all-or-nothing pass for the submit route). */
  correct: boolean
  /** 0..1 partial credit used by the AI-grading review path. */
  ratio: number
}

/**
 * Single deterministic grader for every objective kind. Both the instant submit
 * route (which uses `correct`) and the AI-grade path (which uses `ratio` for
 * partial credit) call this, so the two can never disagree on an answer.
 */
export function compareObjectiveAnswer(q: QuestionGradingSpec, userAnswer: string): ObjectiveComparison {
  const kind: GradingKind = metaFor(q.type).kind
  const answer = q.answer || ''
  const u = (userAnswer || '').trim()
  const bin = (c: boolean): ObjectiveComparison => ({ correct: c, ratio: c ? 1 : 0 })

  switch (kind) {
    case 'choice':
      return bin(answersEqual(u, answer, q.options))
    case 'multi':
      return bin(multisetEqual(u, answer, q.options))
    case 'numeric':
      return bin(numericEqualTol(u, answer, q.tolerance))
    case 'text':
      return bin(answersEqual(u, answer))
    case 'sequence':
      return bin(sequenceEqual(u, answer, q.options))
    case 'pairs': {
      const ratio = matchingRatio(u, q.pairs || [])
      return { correct: ratio >= 1, ratio }
    }
    case 'matrix': {
      const ratio = matrixRatio(u, q.matrix?.rows?.length || 0, answer)
      return { correct: ratio >= 1, ratio }
    }
    case 'table': {
      const ratio = matrixRatio(u, q.table?.rows?.length || 0, answer)
      return { correct: ratio >= 1, ratio }
    }
    case 'blanks': {
      const cp = splitCsv(answer)
      const up = splitCsv(u)
      if (cp.length === 0) return { correct: false, ratio: 0 }
      const matched = cp.filter((c) => up.some((x) => answersEqual(x, c, q.options))).length
      const ratio = matched / cp.length
      const full = matched === cp.length && up.length === cp.length
      return { correct: full, ratio }
    }
    default:
      return { correct: false, ratio: 0 }
  }
}

/** A single executable test case: stdin → expected stdout. Strings only. */
export interface SanitizedTestCase {
  input: string
  output: string
}
const MAX_TEST_CASES = 10
const MAX_TC_FIELD_CHARS = 2000

/**
 * Injection-safe normalizer for coding-question test cases.
 *
 * Data enters from three untrusted-ish sources (LLM-generated question JSON,
 * question-bank docs, admin edit-page payloads) and is persisted to MongoDB
 * and later fed to the Piston sandbox. This keeps ONLY string input/output
 * pairs: array cap, per-field char cap, scalar coercion, common key-variant
 * acceptance (stdin/expected/expected_stdout) — and drops everything else,
 * so NoSQL operator keys (`$*`, dotted paths, `__proto__`) and nested
 * objects/arrays can never reach the database.
 */
export function sanitizeTestCases(raw: unknown): SanitizedTestCase[] {
  if (!Array.isArray(raw)) return []
  const out: SanitizedTestCase[] = []
  for (const tc of raw.slice(0, MAX_TEST_CASES)) {
    if (!tc || typeof tc !== 'object' || Array.isArray(tc)) continue
    const rec = tc as Record<string, unknown>
    const pick = (v: unknown): string => {
      if (typeof v === 'string') return v.slice(0, MAX_TC_FIELD_CHARS)
      if (typeof v === 'number' || typeof v === 'boolean') return String(v).slice(0, MAX_TC_FIELD_CHARS)
      return ''
    }
    const input = pick(rec.input ?? rec.stdin)
    const output = pick(rec.output ?? rec.expected ?? rec.expected_stdout ?? rec.expected_output)
    if (!input && !output) continue
    out.push({ input, output })
  }
  return out
}

/**
 * Strip one embedded exam/bank question down to known scalar fields plus
 * injection-safe test cases. Used by every exam write path (POST normalize,
 * PATCH + PUT passthrough guards) so a crafted payload can never smuggle
 * NoSQL operator keys, nested objects, or unbounded blobs into `questionList`.
 */
const MAX_Q_ITEMS = 40

/** Coerce to a capped string; numbers/booleans allowed, objects/arrays dropped. */
function qStr(v: unknown, max = 2000): string {
  if (typeof v === 'string') return v.slice(0, max)
  if (typeof v === 'number' || typeof v === 'boolean') return String(v).slice(0, max)
  return ''
}

/** Capped string[] from an array; non-scalar members become ''. */
function qStrArray(v: unknown, cap = 30, max = 500): string[] {
  if (!Array.isArray(v)) return []
  return v.slice(0, cap).map((x) => qStr(x, max)).filter(Boolean)
}

/**
 * Carry the structured fields used by the newer question types (pairs, matrix,
 * table, hotspot regions, scale, tolerance, coding language/starter code)
 * through the write-path guard, keeping only known scalar shapes so NoSQL
 * operator keys and unbounded blobs can never reach the database. Absent fields
 * stay absent (the legacy shape is preserved exactly).
 */
function sanitizeStructuredQuestionFields(q: Record<string, unknown>, clean: Record<string, unknown>): void {
  const tolerance = Number(q.tolerance)
  if (Number.isFinite(tolerance) && tolerance > 0) clean.tolerance = tolerance

  if (Array.isArray(q.pairs)) {
    const pairs = (q.pairs as unknown[])
      .slice(0, MAX_Q_ITEMS)
      .map((p) => {
        if (!p || typeof p !== 'object' || Array.isArray(p)) return null
        const rec = p as Record<string, unknown>
        const left = qStr(rec.left, 500)
        const right = qStr(rec.right, 500)
        return left && right ? { left, right } : null
      })
      .filter((p): p is { left: string; right: string } => p !== null)
    if (pairs.length) clean.pairs = pairs
  }

  const matrix = q.matrix
  if (matrix && typeof matrix === 'object' && !Array.isArray(matrix)) {
    const rec = matrix as Record<string, unknown>
    const rows = qStrArray(rec.rows, MAX_Q_ITEMS, 500)
    const columns = qStrArray(rec.columns, 20, 500)
    if (rows.length && columns.length) clean.matrix = { rows, columns }
  }

  const table = q.table
  if (table && typeof table === 'object' && !Array.isArray(table)) {
    const rec = table as Record<string, unknown>
    const columns = qStrArray(rec.columns, 20, 500)
    const rows = qStrArray(rec.rows, MAX_Q_ITEMS, 500)
    if (rows.length) clean.table = { columns, rows }
  }

  const scale = q.scale
  if (scale && typeof scale === 'object' && !Array.isArray(scale)) {
    const rec = scale as Record<string, unknown>
    const min = Number(rec.min)
    const max = Number(rec.max)
    if (Number.isFinite(min) && Number.isFinite(max)) {
      const minLabel = qStr(rec.minLabel, 80)
      const maxLabel = qStr(rec.maxLabel, 80)
      clean.scale = { min, max, ...(minLabel ? { minLabel } : {}), ...(maxLabel ? { maxLabel } : {}) }
    }
  }

  const imageUrl = qStr(q.image_url ?? q.imageUrl, 2000)
  if (imageUrl) clean.image_url = imageUrl

  if (Array.isArray(q.regions)) {
    const regions = (q.regions as unknown[])
      .slice(0, 50)
      .map((r) => {
        if (!r || typeof r !== 'object' || Array.isArray(r)) return null
        const rec = r as Record<string, unknown>
        const id = qStr(rec.id, 80)
        const x = Number(rec.x), y = Number(rec.y), w = Number(rec.w), h = Number(rec.h)
        if (!id || ![x, y, w, h].every((n) => Number.isFinite(n))) return null
        const label = qStr(rec.label, 200)
        return { id, x, y, w, h, ...(label ? { label } : {}) }
      })
      .filter((r): r is { id: string; x: number; y: number; w: number; h: number; label?: string } => r !== null)
    if (regions.length) clean.regions = regions
  }

  const language = qStr(q.language, 40)
  if (language) clean.language = language
  const starter = qStr(q.starter_code ?? q.starterCode, 20000)
  if (starter) clean.starter_code = starter
}

export function sanitizeExamQuestion(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const q = raw as Record<string, unknown>
  const cases = sanitizeTestCases(q.test_cases ?? q.testCases)
  const clean: Record<string, unknown> = {
    id: String(q.id || ''),
    type: String(q.type || 'mcq'),
    title: String(q.title || 'Question').slice(0, 500),
    prompt: String(q.prompt || q.question || '').slice(0, 20000),
    score: Number(q.score ?? q.points) || 10,
  }
  if (Array.isArray(q.options)) {
    clean.options = (q.options as unknown[]).map(String).slice(0, MAX_Q_ITEMS).map((o) => o.slice(0, 2000))
  }
  if (q.answer !== undefined) clean.answer = String(q.answer).slice(0, 20000)
  if (cases.length) clean.test_cases = cases
  sanitizeStructuredQuestionFields(q, clean)
  return clean
}

/** Apply {@link sanitizeExamQuestion} to a whole questionList payload. */
export function sanitizeExamQuestionList(raw: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(raw)) return []
  return raw.map((q) => sanitizeExamQuestion(q))
}
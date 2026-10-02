/**
 * Shared deterministic answer comparison for objective assessment questions.
 *
 * Single source of truth for "is this the same answer?" — used by BOTH the
 * instant submit grader (`/api/exams/[id]/submit`) and the AI-grade path
 * (`lib/ai/grade-question.ts`), so a correct-but-differently-formatted answer
 * ('14.0' vs '14', 'B' vs the option text, 'O(log  n)' vs 'O(log n)') is
 * scored consistently everywhere.
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

/** Canonicalize any objective question-type string → canonical id, else 'free_text'. */
export function canonicalObjectiveType(type: string): string | 'free_text' {
  const t = (type || '').toLowerCase().replace(/[\s-]/g, '')
  if (OBJECTIVE_TYPE_ALIASES[t]) return OBJECTIVE_TYPE_ALIASES[t]
  return 'free_text'
}

/** True for machine-gradeable types (MCQ / true-false / multi-response / fill-blanks). */
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
    clean.options = (q.options as unknown[]).map(String).slice(0, 10).map((o) => o.slice(0, 2000))
  }
  if (q.answer !== undefined) clean.answer = String(q.answer).slice(0, 20000)
  if (cases.length) clean.test_cases = cases
  return clean
}

/** Apply {@link sanitizeExamQuestion} to a whole questionList payload. */
export function sanitizeExamQuestionList(raw: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(raw)) return []
  return raw.map((q) => sanitizeExamQuestion(q))
}
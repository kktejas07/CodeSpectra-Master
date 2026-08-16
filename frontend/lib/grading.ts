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
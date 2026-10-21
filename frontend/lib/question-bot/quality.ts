/**
 * Quality gate for bot-written questions, run BEFORE a draft is saved.
 *
 *  - checkQuestionQuality (pure): hard failures drop the question (MCQ must
 *    have exactly one correct option and distinct options; explanation and
 *    difficulty must be present; coding needs test cases and a reference
 *    solution). Soft issues lower the 0–100 quality score shown to reviewers.
 *  - verifyReferenceSolution: runs the coding question's reference solution
 *    against its own test cases through an injected executor (Piston in
 *    production, a fake in tests). Any failing case drops the question.
 */
import type { BankDifficulty } from './domains'

export interface QualityInput {
  type: string
  question: string
  options?: string[]
  answer?: string
  explanation?: string
  /** Difficulty exactly as the model returned it (before normalisation). */
  rawDifficulty?: unknown
  /** Difficulty this batch asked for. */
  requestedDifficulty?: BankDifficulty
  test_cases?: { input: string; output: string }[]
  reference_solution?: string
  language?: string
}

export interface QualityResult {
  /** False → drop the question. */
  pass: boolean
  score: number
  /** Human-readable reasons (hard failures first). */
  reasons: string[]
  /** Fixes the gate applied (e.g. answer letter → option text). */
  fixes: { answer?: string; difficulty?: BankDifficulty }
}

const norm = (s: unknown): string => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
const DIFFS: readonly BankDifficulty[] = ['Easy', 'Medium', 'Hard']

function parseDifficulty(raw: unknown): BankDifficulty | null {
  const s = norm(raw)
  return DIFFS.find((d) => d.toLowerCase() === s) ?? null
}

/** Pure quality checks. */
export function checkQuestionQuality(q: QualityInput): QualityResult {
  const hard: string[] = []
  const soft: string[] = []
  const fixes: QualityResult['fixes'] = {}
  let penalty = 0

  const question = String(q.question || '').trim()
  if (!question) hard.push('Question text is empty')
  else if (question.length < 20) { soft.push('Question text is very short'); penalty += 15 }

  const diff = parseDifficulty(q.rawDifficulty)
  if (!diff) hard.push('Difficulty is missing')
  else if (q.requestedDifficulty && diff !== q.requestedDifficulty) {
    soft.push(`Model said ${diff}, batch asked for ${q.requestedDifficulty}`)
    fixes.difficulty = q.requestedDifficulty
    penalty += 5
  }

  const explanation = String(q.explanation || '').trim()
  if (!explanation) hard.push('Explanation is empty')
  else if (explanation.length < 20) { soft.push('Explanation is very short'); penalty += 10 }

  if (q.type === 'mcq') {
    const options = (q.options || []).map((o) => String(o ?? '').trim()).filter(Boolean)
    if (options.length < 2) hard.push('Needs at least two options')
    const keys = options.map(norm)
    if (new Set(keys).size !== keys.length) hard.push('Options are not distinct')
    if (options.length >= 2 && options.length !== 4) { soft.push(`Has ${options.length} options (4 expected)`); penalty += 10 }
    if (keys.some((k) => /^(all|none|both) of the (above|these)$/.test(k))) { soft.push('Uses an "all/none of the above" option'); penalty += 5 }

    let answer = norm(q.answer)
    let matches = keys.filter((k) => k === answer).length
    // "B" / "b)" style answers → the option text.
    const letter = /^\(?([a-f])\)?[.)]?$/.exec(answer)
    if (matches === 0 && letter) {
      const idx = letter[1].charCodeAt(0) - 97
      if (idx < options.length) {
        fixes.answer = options[idx]
        answer = keys[idx]
        matches = keys.filter((k) => k === answer).length
        soft.push('Answer was given as a letter')
        penalty += 5
      }
    }
    if (!answer) hard.push('Correct answer is missing')
    else if (matches !== 1) hard.push(matches === 0 ? 'No option matches the answer' : 'More than one option matches the answer')
  } else if (q.type === 'coding') {
    const cases = (q.test_cases || []).filter((t) => t && typeof t.output === 'string' && t.output.trim() !== '')
    if (cases.length === 0) hard.push('Coding question has no test cases')
    else if (cases.length < 2) { soft.push('Only one test case'); penalty += 10 }
    if (!String(q.reference_solution || '').trim()) hard.push('Reference solution is missing')
    if (!String(q.language || '').trim()) hard.push('Language is missing')
  }

  return { pass: hard.length === 0, score: Math.max(0, 100 - penalty), reasons: [...hard, ...soft], fixes }
}

export interface ExecFn {
  (opts: { language: string; source: string; stdin: string }): Promise<{ stdout: string; code: number | null; stderr?: string }>
}

/** Output comparison used by the grader: trimmed, trailing spaces per line ignored. Pure. */
export function sameOutput(actual: string, expected: string): boolean {
  const clean = (s: string) => String(s ?? '').replace(/\r\n/g, '\n').split('\n').map((l) => l.replace(/\s+$/, '')).join('\n').trim()
  return clean(actual) === clean(expected)
}

/**
 * Run the reference solution against each test case. Every case must exit 0
 * with the expected output. Errors (sandbox down, timeout) count as failures,
 * so an unverifiable coding question is never saved.
 */
export async function verifyReferenceSolution(
  q: Pick<QualityInput, 'language' | 'reference_solution' | 'test_cases'>,
  exec: ExecFn,
  opts: { maxCases?: number } = {},
): Promise<{ ok: boolean; passed: number; total: number; reason?: string }> {
  const cases = (q.test_cases || []).slice(0, opts.maxCases ?? 6)
  const source = String(q.reference_solution || '')
  const language = String(q.language || '')
  if (!cases.length || !source.trim() || !language) return { ok: false, passed: 0, total: cases.length, reason: 'Nothing to run' }
  let passed = 0
  for (const [i, tc] of cases.entries()) {
    try {
      const r = await exec({ language, source, stdin: tc.input || '' })
      if (r.code === 0 && sameOutput(r.stdout, tc.output)) passed++
      else return { ok: false, passed, total: cases.length, reason: `Reference solution failed test case ${i + 1}` }
    } catch {
      return { ok: false, passed, total: cases.length, reason: 'Could not run the reference solution' }
    }
  }
  return { ok: true, passed, total: cases.length }
}

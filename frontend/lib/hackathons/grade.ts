/**
 * Server-only auto-grader for hackathon code submissions. Runs the code
 * against every test case (hidden ones included) and returns only the sample
 * results for the team to see.
 */
import { problems } from '@/lib/db/problems'
import { executeOnce } from '@/lib/piston'

export interface GradeResult {
  autoScore: number
  testsRun: number
  sampleResults: Array<{ passed: boolean; input: string; expected: string; stdout?: string; error?: string }>
}

/** null when the problem has no tests (a judge reviews it instead). */
export async function gradeCode(problemSlug: string, code: string, language: string, points: number): Promise<GradeResult | null> {
  const problem = await (await problems()).findOne({ slug: problemSlug })
  const tests = (problem?.test_cases || []) as Array<{ stdin: string; expected_stdout: string; is_sample?: boolean }>
  if (tests.length === 0) return null
  let passed = 0
  const sampleResults: GradeResult['sampleResults'] = []
  for (const tc of tests) {
    let ok = false
    let stdout = ''
    let failed = false
    try {
      const run = await executeOnce({ language: language.toLowerCase(), source: code, stdin: tc.stdin, timeoutMs: 10000 })
      stdout = run.run.stdout || ''
      ok = stdout.trim() === String(tc.expected_stdout || '').trim()
    } catch { failed = true }
    if (ok) passed++
    if (tc.is_sample) {
      sampleResults.push(failed
        ? { passed: false, input: tc.stdin, expected: tc.expected_stdout, error: 'execution failed' }
        : { passed: ok, input: tc.stdin, expected: tc.expected_stdout, stdout })
    }
  }
  const pts = Number.isFinite(points) && points > 0 ? points : 100
  return { autoScore: Math.round((passed / tests.length) * pts), testsRun: tests.length, sampleResults }
}

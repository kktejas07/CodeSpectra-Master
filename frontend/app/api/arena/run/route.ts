import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { executeOnce } from '@/lib/piston'
import { getMongoDb } from '@/lib/mongodb'
import { newId, nowIso } from '@/lib/db/ai'
import { limitRequest } from '@/lib/rate-limit'
import { HUNDRED_DAYS } from '@/lib/100-days-data'
import { completedDaysFrom, findSprintProblem } from '@/lib/hundred-days-progress'

const MAX_SOURCE = 50_000
const MAX_CASES = 20
const MAX_CASE_CHARS = 10_000

function normalize(s: string): string {
  return s.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n+$/g, '')
}

export async function POST(request: NextRequest) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  const limited = await limitRequest(request, 'arena-run', gate.user.id, 30, 60_000)
  if (limited) return limited

  let body: {
    source_code?: unknown
    language?: unknown
    test_cases?: unknown
    mode?: unknown
    challenge_id?: unknown
    hundred_days_problem_id?: unknown
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const source = typeof body.source_code === 'string' ? body.source_code : ''
  const lang = typeof body.language === 'string' ? body.language.trim().slice(0, 32) : ''
  const mode: 'run' | 'submit' = body.mode === 'submit' ? 'submit' : 'run'
  const challenge_id = typeof body.challenge_id === 'string' ? body.challenge_id.slice(0, 64) : undefined
  const sprintId = typeof body.hundred_days_problem_id === 'string' ? body.hundred_days_problem_id.slice(0, 32) : undefined

  if (!source || !lang) {
    return NextResponse.json({ error: 'source_code and language are required' }, { status: 400 })
  }
  if (source.length > MAX_SOURCE) {
    return NextResponse.json({ error: 'source_code too large (50KB max)' }, { status: 400 })
  }

  // 100-day sprint problems are graded on the server's own examples; client tests are ignored.
  const sprint = sprintId ? findSprintProblem(sprintId, HUNDRED_DAYS) : null
  if (sprintId && !sprint) {
    return NextResponse.json({ error: 'Unknown problem' }, { status: 404 })
  }

  let test_cases: Array<{ input: string; expected_output: string }>
  if (sprint) {
    test_cases = sprint.problem.examples.map((ex) => ({ input: ex.input, expected_output: ex.output }))
  } else {
    const raw = Array.isArray(body.test_cases) ? body.test_cases : []
    if (raw.length > MAX_CASES) {
      return NextResponse.json({ error: `At most ${MAX_CASES} test cases per run` }, { status: 400 })
    }
    test_cases = raw.map((tc: any) => ({
      input: String(tc?.input ?? '').slice(0, MAX_CASE_CHARS),
      expected_output: String(tc?.expected_output ?? '').slice(0, MAX_CASE_CHARS),
    }))
  }
  if (test_cases.length === 0) {
    return NextResponse.json({ error: 'No test cases provided' }, { status: 400 })
  }

  const results: Array<{
    passed: boolean
    input: string
    expected: string
    stdout: string
    stderr: string | null
    time_ms: number
  }> = []
  let passed = 0
  let totalTime = 0
  let firstStderr: string | null = null
  let aggregateStatus = 'accepted'

  for (const tc of test_cases) {
    try {
      const t0 = Date.now()
      const piston = await executeOnce({
        language: lang.toLowerCase(),
        source,
        stdin: tc.input,
        timeoutMs: 10000,
      })
      const dt = Date.now() - t0
      totalTime += dt

      const actual = normalize(piston.run.stdout || '')
      const expected = normalize(tc.expected_output || '')
      const ok = actual === expected

      if (!ok) {
        aggregateStatus = 'wrong_answer'
        if (piston.run.stderr && !firstStderr) firstStderr = piston.run.stderr.slice(0, 2000)
      }
      if (ok) passed++

      results.push({
        passed: ok,
        input: tc.input,
        expected: tc.expected_output,
        stdout: piston.run.stdout || '',
        stderr: piston.run.stderr || null,
        time_ms: dt,
      })
    } catch (e) {
      aggregateStatus = 'error'
      const msg = e instanceof Error ? e.message : String(e)
      if (!firstStderr) firstStderr = msg
      results.push({
        passed: false,
        input: tc.input,
        expected: tc.expected_output,
        stdout: '',
        stderr: msg,
        time_ms: 0,
      })
    }
  }

  // Arena submissions are practice only (graded on the examples shown, which may be
  // AI-adapted per user), so they are stored but award no XP.
  if (mode === 'submit' && challenge_id && !sprint) {
    try {
      const db = await getMongoDb()
      await db.collection('arena_submissions').insertOne({
        id: newId(),
        userId: gate.user.id,
        challengeId: challenge_id,
        language: lang,
        sourceCode: source,
        status: aggregateStatus,
        passedTests: passed,
        totalTests: test_cases.length,
        totalTimeMs: totalTime,
        results,
        createdAt: nowIso(),
      })
    } catch (e) {
      console.error('[arena] Failed to save submission:', e)
    }
  }

  // 100-day sprint: record the solved problem server-side and recompute completed days.
  let sprintProgress: { solvedProblems: string[]; completedDays: number[] } | null = null
  if (mode === 'submit' && sprint && aggregateStatus === 'accepted') {
    try {
      const db = await getMongoDb()
      const col = db.collection('user_100days_progress')
      const doc = await col.findOneAndUpdate(
        { userId: gate.user.id },
        { $addToSet: { solvedProblems: sprint.problem.id }, $set: { updatedAt: nowIso() } },
        { upsert: true, returnDocument: 'after' },
      )
      const solved: string[] = Array.isArray(doc?.solvedProblems) ? doc!.solvedProblems : [sprint.problem.id]
      const verifiedDays = completedDaysFrom(solved, HUNDRED_DAYS)
      await col.updateOne({ userId: gate.user.id }, { $set: { verifiedDays } })
      sprintProgress = { solvedProblems: solved, completedDays: verifiedDays }
    } catch (e) {
      console.error('[100-days] Failed to record progress:', e)
      return NextResponse.json({ error: 'Your solution passed but progress could not be saved. Please submit again.' }, { status: 500 })
    }
  }

  return NextResponse.json({
    mode,
    status: aggregateStatus,
    passed_tests: passed,
    total_tests: test_cases.length,
    total_time_ms: totalTime,
    stderr_excerpt: firstStderr,
    results,
    ...(sprintProgress ? { sprint: sprintProgress } : {}),
  })
}

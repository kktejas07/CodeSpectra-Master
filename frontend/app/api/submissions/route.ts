import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import {
  problems,
  submissions,
  newId,
  nowIso,
  type SubmissionDoc,
  type SubmissionStatus,
  type TestRunResult,
} from '@/lib/db/problems'
import { awardXp, DIFFICULTY_XP, FIRST_BLOOD_BONUS } from '@/lib/db/leaderboard'
import { executeOnce } from '@/lib/piston'
import type { PistonExecuteResult } from '@/lib/piston'

interface SubmitBody {
  problem_slug?: string
  language?: string
  source_code?: string
  mode?: 'run' | 'submit' // run = sample tests only
}

function normalize(s: string): string {
  // Strip trailing whitespace per line + final newline
  return s.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n+$/g, '')
}

function classifyStatus(res: PistonExecuteResult): {
  status: SubmissionStatus
  stderr?: string
} {
  if (res.compile && res.compile.code !== 0) {
    return { status: 'compile_error', stderr: res.compile.stderr || res.compile.output }
  }
  if (res.run.signal === 'SIGKILL') {
    return { status: 'time_limit' }
  }
  if (res.run.code !== 0) {
    return { status: 'runtime_error', stderr: res.run.stderr }
  }
  return { status: 'accepted' }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  let body: SubmitBody
  try {
    body = (await request.json()) as SubmitBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const slug = body.problem_slug?.trim()
  const lang = body.language?.trim().toLowerCase()
  const source = body.source_code
  const mode = body.mode === 'run' ? 'run' : 'submit'

  if (!slug || !lang || typeof source !== 'string') {
    return NextResponse.json(
      { error: 'problem_slug, language, and source_code are required' },
      { status: 400 },
    )
  }
  if (source.length > 50_000) {
    return NextResponse.json({ error: 'source_code too large (50KB max)' }, { status: 400 })
  }

  const pCol = await problems()
  const problem = await pCol.findOne({ slug })
  if (!problem) {
    return NextResponse.json({ error: 'Problem not found' }, { status: 404 })
  }

  // Pick tests: `run` mode uses only samples, `submit` uses all.
  const tests = (problem.test_cases || []).filter((t) => (mode === 'run' ? t.is_sample : true))
  if (tests.length === 0) {
    return NextResponse.json({ error: 'No test cases configured' }, { status: 400 })
  }

  const results: TestRunResult[] = []
  let totalTime = 0
  let passed = 0
  let totalWeight = 0
  let earnedWeight = 0
  let firstStderr: string | null = null
  let aggregateStatus: SubmissionStatus = 'accepted'

  for (const tc of tests) {
    const w = tc.weight ?? 1
    totalWeight += w
    try {
      const t0 = Date.now()
      const piston = await executeOnce({
        language: lang,
        source,
        stdin: tc.stdin,
        timeoutMs: problem.time_limit_ms,
      })
      const dt = Date.now() - t0
      totalTime += dt

      const { status, stderr } = classifyStatus(piston)
      const actual = normalize(piston.run.stdout || '')
      const expected = normalize(tc.expected_stdout || '')
      const ok = status === 'accepted' && actual === expected

      if (!ok) {
        if (status === 'accepted') aggregateStatus = 'wrong_answer'
        else aggregateStatus = status
        if (!firstStderr && stderr) firstStderr = stderr.slice(0, 2000)
      }
      if (ok) {
        passed++
        earnedWeight += w
      }

      results.push({
        test_id: tc.id,
        passed: ok,
        is_sample: tc.is_sample,
        // Only reveal expected/stdout for sample tests
        stdout: tc.is_sample ? actual : undefined,
        expected: tc.is_sample ? expected : undefined,
        stderr: tc.is_sample && stderr ? stderr.slice(0, 1000) : undefined,
        time_ms: dt,
      })
    } catch (e) {
      aggregateStatus = 'error'
      const msg = e instanceof Error ? e.message : String(e)
      if (!firstStderr) firstStderr = msg
      results.push({
        test_id: tc.id,
        passed: false,
        is_sample: tc.is_sample,
        error: msg,
      })
    }
  }

  const score = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0

  const doc: SubmissionDoc = {
    id: newId(),
    problem_id: problem.id,
    user_id: gate.user.id,
    language: lang,
    source_code: source,
    status: aggregateStatus,
    score,
    total_tests: tests.length,
    passed_tests: passed,
    results,
    stderr_excerpt: firstStderr,
    total_time_ms: totalTime,
    created_at: nowIso(),
  }

  // Only persist `submit` runs — `run` is just a sample check.
  if (mode === 'submit') {
    try {
      const sCol = await submissions()
      await sCol.insertOne(doc)

      // XP economy: award on first accepted solve + first-blood bonus.
      if (aggregateStatus === 'accepted') {
        const difficulty = (problem.difficulty || 'easy') as 'easy' | 'medium' | 'hard'
        const baseXp = DIFFICULTY_XP[difficulty] ?? 10

        // Has this user already solved this problem before?
        const prior = await sCol.findOne({
          problem_id: problem.id,
          user_id: gate.user.id,
          status: 'accepted',
          id: { $ne: doc.id },
        })
        if (!prior) {
          await awardXp({
            userId: gate.user.id,
            amount: baseXp,
            reason: 'submission_accepted',
            problemId: problem.id,
            submissionId: doc.id,
            metadata: { difficulty },
          })

          // First-blood: is there any earlier accepted submission *from anyone*?
          const earlier = await sCol.findOne(
            { problem_id: problem.id, status: 'accepted', id: { $ne: doc.id } },
            { sort: { created_at: 1 } },
          )
          if (!earlier) {
            await awardXp({
              userId: gate.user.id,
              amount: FIRST_BLOOD_BONUS,
              reason: 'first_blood',
              problemId: problem.id,
              submissionId: doc.id,
              metadata: { difficulty },
            })
          }
        }
      }
    } catch (e) {
      console.warn('[CodeSpectra] submission insert/XP skipped:', e)
    }
  }

  return NextResponse.json({
    mode,
    submissionId: mode === 'submit' ? doc.id : null,
    problemId: problem.id,
    status: aggregateStatus,
    score,
    passed_tests: passed,
    total_tests: tests.length,
    total_time_ms: totalTime,
    stderr_excerpt: firstStderr,
    results,
  })
}

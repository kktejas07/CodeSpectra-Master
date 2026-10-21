import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { runCodeathonCode, outputsMatch, isCodeathonParticipant, recomputeCodeathonStanding } from '@/lib/codeathon-run'
import { rateLimitSlidingWindow } from '@/lib/in-memory-rate-limit'

interface TestCase {
  input: string
  expected: string
  hidden: boolean
}

const runCode = runCodeathonCode

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; problemId: string }> }
): Promise<NextResponse> {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })

  const { id: codeathonId, problemId } = await params
  const rl = rateLimitSlidingWindow(`codeathon-submit:${user.id}`, 10, 60_000)
  if (!rl.ok) return NextResponse.json({ error: 'Too many submissions. Wait a moment.' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } })
  const raw = (await request.json().catch(() => ({}))) as { code?: unknown; language?: unknown }
  const body = {
    code: typeof raw.code === 'string' ? raw.code : '',
    language: typeof raw.language === 'string' ? raw.language.slice(0, 30) : '',
  }
  if (!body.code.trim() || !body.language) return NextResponse.json({ error: 'code and language are required' }, { status: 400 })
  if (body.code.length > 200_000) return NextResponse.json({ error: 'Code is too long' }, { status: 413 })

  try {
    const db = await getMongoDb()

    // Get codeathon
    const codeathon = await db.collection('codeathons').findOne({ id: codeathonId })
    if (!codeathon) return NextResponse.json({ error: 'Codeathon not found' }, { status: 404 })
    // Released results are final — no more submissions.
    if (codeathon.results_released === true) return NextResponse.json({ error: 'Results are released; this codeathon is closed' }, { status: 409 })

    // Check contest is active
    const now = new Date()
    const startDate = codeathon.startDate ? new Date(codeathon.startDate as string) : null
    const endDate = codeathon.endDate ? new Date(codeathon.endDate as string) : null
    if (startDate && now < startDate) {
      return NextResponse.json({ error: 'Contest has not started yet' }, { status: 400 })
    }
    if (endDate && now > endDate) {
      return NextResponse.json({ error: 'Contest has ended' }, { status: 400 })
    }

    // Get problem
    const problem = (codeathon.problems as any[])?.find(p => p.id === problemId)
    if (!problem) return NextResponse.json({ error: 'Problem not found', code: 'problem_not_found' }, { status: 404 })

    // Only registered participants (or team members) may submit.
    if (!(await isCodeathonParticipant(db, codeathon, user.id))) {
      return NextResponse.json({ error: 'Register for this codeathon first' }, { status: 403 })
    }

    let testCases: TestCase[] = Array.isArray(problem.test_cases) ? problem.test_cases : []
    // Problems added by hand may only carry a sample pair; that is a real test.
    if (testCases.length === 0 && typeof problem.sample_output === 'string' && problem.sample_output.trim()) {
      testCases = [{ input: String(problem.sample_input ?? ''), expected: problem.sample_output, hidden: false }]
    }
    // No tests means nothing to grade against — never award points for "it ran".
    if (testCases.length === 0) {
      return NextResponse.json({ error: 'This problem has no test cases yet. Ask the organiser to add them.' }, { status: 409 })
    }
    const points = typeof problem.points === 'number' && Number.isFinite(problem.points) && problem.points > 0 ? problem.points : 100

    // For team mode, get team ID
    let teamId = null
    if ((codeathon as any).event_type === 'team') {
      const membership = await db.collection('codeathon_team_members').findOne({
        codeathon_id: codeathonId,
        user_id: user.id,
      })
      if (!membership) {
        return NextResponse.json({ error: 'You must be in a team to submit' }, { status: 400 })
      }
      teamId = membership.team_id
    }

    // Create submission
    const submissionId = crypto.randomUUID()
    const submission = {
      id: submissionId,
      user_id: user.id,
      team_id: teamId,
      codeathon_id: codeathonId,
      problem_id: problemId,
      code: body.code,
      language: body.language,
      status: 'running',
      score: 0,
      test_cases_passed: 0,
      test_cases_total: testCases.length,
      created_at: new Date().toISOString(),
    }
    await db.collection('codeathon_submissions').insertOne(submission)

    // Run against every test (hidden included). Output is only echoed back
    // for visible tests so hidden expected outputs never leak.
    let passed = 0
    let lastOutput = ''
    let lastError = ''
    const results: Array<{ passed: boolean; hidden: boolean; output?: string }> = []

    for (const tc of testCases) {
      const result = await runCode(body.code, body.language, tc.input)
      const ok = result.exitCode === 0 && outputsMatch(result.output, tc.expected)
      if (ok) passed++
      results.push(tc.hidden ? { passed: ok, hidden: true } : { passed: ok, hidden: false, output: result.output })
      if (!tc.hidden) { lastOutput = result.output; lastError = result.error }
      else if (result.error && !lastError) lastError = 'A hidden test failed to run'
    }

    const total = testCases.length
    const score = Math.round((passed / total) * points)
    const status = passed === total ? 'accepted' : 'wrong_answer'

    // Update submission
    await db.collection('codeathon_submissions').updateOne(
      { id: submissionId },
      { $set: { status, score, test_cases_passed: passed, output: lastOutput, error: lastError } }
    )

    // Leaderboard = best score per problem, recomputed (never $inc per submit).
    const team = teamId ? await db.collection('codeathon_teams').findOne({ id: teamId }) : null
    await recomputeCodeathonStanding(db, codeathonId, {
      userId: user.id,
      userName: user.fullName || user.name || 'Participant',
      teamId,
      teamName: team?.name || undefined,
    })

    return NextResponse.json({
      id: submissionId,
      status,
      score,
      test_cases_passed: passed,
      test_cases_total: total,
      output: lastOutput,
      error: lastError,
      results,
      created_at: submission.created_at,
    })
  } catch (e) {
    console.error('[Codeathon submit]', e)
    return NextResponse.json({ error: 'Submission failed' }, { status: 500 })
  }
}

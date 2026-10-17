import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { runCodeathonCode } from '@/lib/codeathon-run'

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
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: codeathonId, problemId } = await params
  const body = await request.json() as { code: string; language: string }

  try {
    const db = await getMongoDb()

    // Get codeathon
    const codeathon = await db.collection('codeathons').findOne({ id: codeathonId })
    if (!codeathon) return NextResponse.json({ error: 'Codeathon not found' }, { status: 404 })

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
    if (!problem) return NextResponse.json({ error: 'Problem not found' }, { status: 404 })

    const testCases: TestCase[] = problem.test_cases || []

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
      test_cases_total: testCases.length || 1,
      created_at: new Date().toISOString(),
    }
    await db.collection('codeathon_submissions').insertOne(submission)

    // Run against test cases
    let passed = 0
    let lastOutput = ''
    let lastError = ''

    for (const tc of testCases) {
      const result = await runCode(body.code, body.language, tc.input)
      if (result.exitCode === 0 && result.output === tc.expected) {
        passed++
      }
      lastOutput = result.output
      lastError = result.error
    }

    if (testCases.length === 0) {
      const result = await runCode(body.code, body.language, problem.sample_input || '')
      lastOutput = result.output
      lastError = result.error
      passed = result.exitCode === 0 ? 1 : 0
    }

    const total = testCases.length || 1
    const score = Math.round((passed / total) * problem.points)
    const status = passed === total ? 'accepted' : 'wrong_answer'

    // Update submission
    await db.collection('codeathon_submissions').updateOne(
      { id: submissionId },
      { $set: { status, score, test_cases_passed: passed, output: lastOutput, error: lastError } }
    )

    // Update leaderboard (user level)
    await db.collection('codeathon_leaderboard').updateOne(
      { codeathon_id: codeathonId, user_id: user.id },
      {
        $inc: { total_score: score, problems_solved: passed === total ? 1 : 0 },
        $set: { last_submission_at: new Date().toISOString(), user_name: user.fullName || user.email || 'Unknown' },
        $setOnInsert: { created_at: new Date().toISOString() },
      },
      { upsert: true }
    )

    // For team mode, also update team leaderboard
    if (teamId) {
      const team = await db.collection('codeathon_teams').findOne({ id: teamId })
      await db.collection('codeathon_leaderboard').updateOne(
        { codeathon_id: codeathonId, team_id: teamId },
        {
          $inc: { total_score: score, problems_solved: passed === total ? 1 : 0 },
          $set: {
            last_submission_at: new Date().toISOString(),
            team_name: team?.name || 'Unknown Team',
            user_name: team?.name || 'Unknown Team',
          },
          $setOnInsert: { created_at: new Date().toISOString() },
        },
        { upsert: true }
      )
    }

    return NextResponse.json({
      id: submissionId,
      status,
      score,
      test_cases_passed: passed,
      test_cases_total: total,
      output: lastOutput,
      error: lastError,
      created_at: submission.created_at,
    })
  } catch (e) {
    console.error('[Codeathon submit]', e)
    return NextResponse.json({ error: 'Submission failed' }, { status: 500 })
  }
}

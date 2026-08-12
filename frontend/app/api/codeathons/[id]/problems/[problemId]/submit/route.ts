import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

interface TestCase {
  input: string
  expected: string
  hidden: boolean
}

interface SubmissionRequest {
  code: string
  language: string
  codeathon_id: string
  problem_id: string
}

async function runCode(code: string, language: string, input: string): Promise<{ output: string; error: string; exitCode: number }> {
  const tmpDir = `/tmp/codeathon-${Date.now()}`
  await execAsync(`mkdir -p ${tmpDir}`)

  let cmd = ''
  switch (language) {
    case 'javascript':
      await execAsync(`cat > ${tmpDir}/solution.js << 'EOF'\n${code}\nEOF`)
      cmd = `cd ${tmpDir} && echo '${input.replace(/'/g, "'\\''")}' | node solution.js 2>&1`
      break
    case 'python':
      await execAsync(`cat > ${tmpDir}/solution.py << 'EOF'\n${code}\nEOF`)
      cmd = `cd ${tmpDir} && echo '${input.replace(/'/g, "'\\''")}' | python3 solution.py 2>&1`
      break
    case 'java':
      await execAsync(`cat > ${tmpDir}/Solution.java << 'EOF'\n${code}\nEOF`)
      await execAsync(`cd ${tmpDir} && javac Solution.java 2>&1`)
      cmd = `cd ${tmpDir} && echo '${input.replace(/'/g, "'\\''")}' | java Solution 2>&1`
      break
    case 'cpp':
      await execAsync(`cat > ${tmpDir}/solution.cpp << 'EOF'\n${code}\nEOF`)
      await execAsync(`cd ${tmpDir} && g++ -o solution solution.cpp 2>&1`)
      cmd = `cd ${tmpDir} && echo '${input.replace(/'/g, "'\\''")}' | ./solution 2>&1`
      break
    default:
      return { output: '', error: 'Unsupported language', exitCode: 1 }
  }

  try {
    const { stdout, stderr } = await execAsync(cmd, { timeout: 10000 })
    await execAsync(`rm -rf ${tmpDir}`)
    return { output: stdout.trim(), error: stderr.trim(), exitCode: 0 }
  } catch (e: any) {
    await execAsync(`rm -rf ${tmpDir}`).catch(() => {})
    return { output: e.stdout?.trim() || '', error: e.stderr?.trim() || e.message, exitCode: e.code || 1 }
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; problemId: string }> }
): Promise<NextResponse> {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: codeathonId, problemId } = await params
  const body = await request.json() as SubmissionRequest

  try {
    const db = await getMongoDb()

    // Get problem test cases
    const codeathon = await db.collection('codeathons').findOne({ id: codeathonId })
    if (!codeathon) return NextResponse.json({ error: 'Codeathon not found' }, { status: 404 })

    const problem = (codeathon.problems as any[])?.find(p => p.id === problemId)
    if (!problem) return NextResponse.json({ error: 'Problem not found' }, { status: 404 })

    const testCases: TestCase[] = problem.test_cases || []

    // Create submission record
    const submissionId = crypto.randomUUID()
    const submission = {
      id: submissionId,
      user_id: user.id,
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

    // If no test cases, run with sample input
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

    // Update leaderboard
    await db.collection('codeathon_leaderboard').updateOne(
      { codeathon_id: codeathonId, user_id: user.id },
      {
        $inc: { total_score: score, problems_solved: passed === total ? 1 : 0 },
        $set: { last_submission_at: new Date().toISOString(), user_name: user.fullName || user.email || 'Unknown' },
        $setOnInsert: { created_at: new Date().toISOString() },
      },
      { upsert: true }
    )

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

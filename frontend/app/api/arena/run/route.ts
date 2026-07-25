import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { executeOnce } from '@/lib/piston'

function normalize(s: string): string {
  return s.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n+$/g, '')
}

export async function POST(request: NextRequest) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  let body: {
    source_code?: string
    language?: string
    test_cases?: Array<{ input: string; expected_output: string }>
    mode?: 'run' | 'submit'
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { source_code: source, language: lang, test_cases = [], mode = 'run' } = body

  if (!source || !lang) {
    return NextResponse.json({ error: 'source_code and language are required' }, { status: 400 })
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

  return NextResponse.json({
    mode,
    status: aggregateStatus,
    passed_tests: passed,
    total_tests: test_cases.length,
    total_time_ms: totalTime,
    stderr_excerpt: firstStderr,
    results,
  })
}

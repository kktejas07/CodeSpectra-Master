import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { executeOnce } from '@/lib/piston'

export const dynamic = 'force-dynamic'

interface TestCase {
  input: string
  output: string
  isSample?: boolean
}

export async function POST(request: NextRequest) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  try {
    const body = await request.json()
    const { language, source, test_cases, stdin } = body

    if (!language || !source) {
      return NextResponse.json(
        { success: false, error: 'language and source are required' },
        { status: 400 }
      )
    }

    const cases: TestCase[] = test_cases || []
    const singleStdin = stdin || ''

    // If test cases provided, run each one
    if (cases.length > 0) {
      const results = await Promise.all(
        cases.map(async (tc) => {
          try {
            const result = await executeOnce({
              language: language.toLowerCase(),
              source,
              stdin: tc.input,
              timeoutMs: 5000,
            })

            const stdout = result.run?.stdout?.trim() || ''
            const expected = tc.output?.trim() || ''
            const passed = stdout === expected && !result.run?.stderr

            return {
              passed,
              input: tc.input,
              expected: tc.output,
              output: stdout,
              stderr: result.run?.stderr || '',
              isSample: tc.isSample !== false,
            }
          } catch (e: any) {
            return {
              passed: false,
              input: tc.input,
              expected: tc.output,
              output: '',
              stderr: e.message || 'Execution error',
              isSample: tc.isSample !== false,
            }
          }
        })
      )

      const allPassed = results.every(r => r.passed)
      const totalTime = results.reduce((sum, r) => sum + 0, 0) // Individual timing not available from Piston

      return NextResponse.json({
        success: true,
        passed: allPassed,
        results,
        execution_time_ms: totalTime,
      })
    }

    // Single execution (backward compatible)
    const result = await executeOnce({
      language: language.toLowerCase(),
      source,
      stdin: singleStdin,
      timeoutMs: 10000,
    })

    return NextResponse.json({ success: true, result })
  } catch (error: any) {
    console.error('[execute-code]', error)
    return NextResponse.json(
      { success: false, error: 'Execution failed' },
      { status: 500 }
    )
  }
}
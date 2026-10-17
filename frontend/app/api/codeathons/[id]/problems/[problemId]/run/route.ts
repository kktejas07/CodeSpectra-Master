import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { runCodeathonCode } from '@/lib/codeathon-run'

const runCode = runCodeathonCode

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; problemId: string }> }
): Promise<NextResponse> {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as { code: string; language: string; input: string }

  const startTime = Date.now()
  const result = await runCode(body.code, body.language, body.input)
  const executionTime = Date.now() - startTime

  return NextResponse.json({
    output: result.output,
    error: result.error,
    exitCode: result.exitCode,
    executionTime,
  })
}

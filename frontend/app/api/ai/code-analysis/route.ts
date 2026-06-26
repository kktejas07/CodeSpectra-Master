import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { backendPost } from '@/lib/ai/backend'

export const runtime = 'nodejs'

interface AnalysisReq {
  code: string
  language?: string
  problem_title?: string
  passed_tests?: number
  total_tests?: number
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: AnalysisReq
  try {
    body = (await req.json()) as AnalysisReq
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!body.code) {
    return NextResponse.json({ error: 'code required' }, { status: 400 })
  }
  const result = await backendPost<Record<string, unknown>>(
    '/internal/ai/code-analysis',
    {
      code: body.code.slice(0, 10_000),
      language: body.language || 'python',
      problem_title: body.problem_title || null,
      passed_tests: body.passed_tests ?? null,
      total_tests: body.total_tests ?? null,
    },
  )
  return NextResponse.json(result)
}

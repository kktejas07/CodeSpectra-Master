import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { backendPost } from '@/lib/ai/backend'

export const runtime = 'nodejs'

interface AgentReq {
  goal: string
  code: string
  language?: string
  max_steps?: number
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: AgentReq
  try {
    body = (await req.json()) as AgentReq
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!body.code || !body.goal) {
    return NextResponse.json({ error: 'goal and code required' }, { status: 400 })
  }
  const result = await backendPost<Record<string, unknown>>('/internal/ai/agent', {
    goal: body.goal.slice(0, 500),
    code: body.code.slice(0, 10_000),
    language: body.language || 'python',
    max_steps: Math.max(1, Math.min(5, body.max_steps || 3)),
  })
  return NextResponse.json(result)
}

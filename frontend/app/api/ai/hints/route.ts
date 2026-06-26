import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { backendPost } from '@/lib/ai/backend'
import { problems } from '@/lib/db/problems'

export const runtime = 'nodejs'

interface HintReq {
  problem_slug: string
  hint_level?: number
  current_code?: string
  language?: string
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: HintReq
  try {
    body = (await req.json()) as HintReq
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const slug = (body.problem_slug || '').trim()
  if (!slug) return NextResponse.json({ error: 'problem_slug required' }, { status: 400 })

  const probsCol = await problems()
  const p = await probsCol.findOne({ slug })
  if (!p) return NextResponse.json({ error: 'problem not found' }, { status: 404 })

  const result = await backendPost<{ hint: string; hint_level: number }>(
    '/internal/ai/hints',
    {
      problem_title: p.title,
      problem_statement: p.statement_md,
      language: body.language || 'python',
      current_code: body.current_code || '',
      hint_level: Math.max(1, Math.min(4, body.hint_level || 1)),
    },
  )
  return NextResponse.json(result)
}

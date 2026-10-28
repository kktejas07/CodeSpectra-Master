import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { backendPost } from '@/lib/ai/backend'
import { resolveModel } from '@/lib/ai/get-user-model'
import { problems } from '@/lib/db/problems'
import { rateLimitAIRedis } from '@/lib/upstash-rate-limit'

export const runtime = 'nodejs'

interface HintReq {
  problem_slug: string
  hint_level?: number
  current_code?: string
  language?: string
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })

  const { providerOverride, modelOverride, modelRole, endpointOverride } = await resolveModel(user.id, 'hints_model')

  const rateCheck = await rateLimitAIRedis(req, user.id)
  if (!rateCheck.ok) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Try again in ${rateCheck.retryAfterSec}s.`, code: 'rate_limited_seconds', params: { seconds: rateCheck.retryAfterSec } },
      { status: 429 },
    )
  }

  let body: HintReq
  try {
    body = (await req.json()) as HintReq
  } catch {
    return NextResponse.json({ error: 'Invalid JSON', code: 'invalid_json' }, { status: 400 })
  }
  const slug = (body.problem_slug || '').trim()
  if (!slug) return NextResponse.json({ error: 'problem_slug required' }, { status: 400 })

  const probsCol = await problems()
  const p = await probsCol.findOne({ slug })
  if (!p) return NextResponse.json({ error: 'problem not found', code: 'problem_not_found' }, { status: 404 })

  try {
    const result = await backendPost<{ hint: string; hint_level: number }>(
      '/internal/ai/hints',
      {
        problem_title: p.title,
        problem_statement: p.statement_md,
        language: body.language || 'python',
        current_code: body.current_code || '',
        hint_level: Math.max(1, Math.min(4, body.hint_level || 1)),
      },
      { providerOverride, modelOverride, modelRole, endpointOverride: endpointOverride || undefined },
    )
    return NextResponse.json(result)
  } catch (err: any) {
    console.error('[ai/hints]', err)
    return NextResponse.json({ error: 'AI hints failed' }, { status: 500 })
  }
}

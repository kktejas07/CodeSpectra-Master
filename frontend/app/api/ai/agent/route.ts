import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { backendPost } from '@/lib/ai/backend'
import { resolveModel } from '@/lib/ai/get-user-model'
import { rateLimitAIRedis } from '@/lib/upstash-rate-limit'
import { outOfCredits, refundAiCredits, spendAiCredits } from '@/lib/user-credits'

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

  const { providerOverride, modelOverride, modelRole, endpointOverride } = await resolveModel(user.id, 'chat_model')

  const rateCheck = await rateLimitAIRedis(req, user.id)
  if (!rateCheck.ok) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Try again in ${rateCheck.retryAfterSec}s.` },
      { status: 429 },
    )
  }

  let body: AgentReq
  try {
    body = (await req.json()) as AgentReq
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!body.code || !body.goal) {
    return NextResponse.json({ error: 'goal and code required' }, { status: 400 })
  }
  // AGT-024: the code agent runs up to 5 model steps — charge 1 credit per step requested (refunded on failure).
  const steps = Math.max(1, Math.min(5, body.max_steps || 3))
  const spent = await spendAiCredits(user.id, steps).catch(() => null)
  if (!spent) return NextResponse.json({ error: 'Could not check your AI credits. Try again.' }, { status: 503 })
  if (!spent.ok) return NextResponse.json(outOfCredits({ cost: steps, balance: spent.balance }), { status: 402 })
  try {
    const result = await backendPost<Record<string, unknown>>(
      '/internal/ai/agent',
      {
        goal: body.goal.slice(0, 500),
        code: body.code.slice(0, 10_000),
        language: body.language || 'python',
        max_steps: steps,
      },
      { providerOverride, modelOverride, modelRole, endpointOverride: endpointOverride || undefined },
    )
    return NextResponse.json(result)
  } catch (e) {
    await refundAiCredits(user.id, steps).catch(() => undefined)
    console.error('[ai/agent] failed:', e)
    return NextResponse.json({ error: 'The code agent failed. Try again.' }, { status: 502 })
  }
}

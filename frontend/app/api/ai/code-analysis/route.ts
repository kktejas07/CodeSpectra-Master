import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { backendPost } from '@/lib/ai/backend'
import { resolveModel } from '@/lib/ai/get-user-model'
import { chargeAiFeature, outOfCredits } from '@/lib/user-credits'

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
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })

  const { providerOverride, modelOverride, modelRole, endpointOverride } = await resolveModel(user.id, 'review_model')

  let body: AnalysisReq
  try {
    body = (await req.json()) as AnalysisReq
  } catch {
    return NextResponse.json({ error: 'Invalid JSON', code: 'invalid_json' }, { status: 400 })
  }
  if (!body.code) {
    return NextResponse.json({ error: 'code required' }, { status: 400 })
  }
  const charge = await chargeAiFeature(user.id, 'code_analysis')
  if (!charge.ok) return NextResponse.json(outOfCredits(charge), { status: 402 })

  let result: Record<string, unknown>
  try {
  result = await backendPost<Record<string, unknown>>(
    '/internal/ai/code-analysis',
    {
      code: body.code.slice(0, 10_000),
      language: body.language || 'python',
      problem_title: body.problem_title || null,
      passed_tests: body.passed_tests ?? null,
      total_tests: body.total_tests ?? null,
    },
    { providerOverride, modelOverride, modelRole, endpointOverride: endpointOverride || undefined },
  )
  } catch (err) {
    console.error('[CodeSpectra] AI code-analysis error:', err)
    await charge.refund()
    return NextResponse.json({ success: false, error: 'AI service unavailable' }, { status: 502 })
  }
  return NextResponse.json({ ...result, creditsCharged: charge.cost, balance: charge.balance })
}

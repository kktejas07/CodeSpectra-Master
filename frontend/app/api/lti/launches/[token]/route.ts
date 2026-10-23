/** GET — what a learner's LTI launch is for. POST — the signed-in learner continues (account link, grade passback) → { url }. */
import type { NextRequest } from 'next/server'
import { errorResponse, json, userGate } from '@/lib/community/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ token: string }> }

export async function GET(req: NextRequest, { params }: Ctx) {
  const g = await userGate(req)
  if ('res' in g) return g.res
  const { token } = await params
  try {
    const { launchSummary } = await import('@/lib/integrations/lti/service')
    return json(await launchSummary(token))
  } catch (e) { return errorResponse(e, 'lti launch summary') }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const g = await userGate(req, { write: true, bucket: 'lti-continue', max: 10 })
  if ('res' in g) return g.res
  const { token } = await params
  try {
    const { continueLaunch } = await import('@/lib/integrations/lti/service')
    return json(await continueLaunch(g.user, token))
  } catch (e) { return errorResponse(e, 'lti launch continue') }
}

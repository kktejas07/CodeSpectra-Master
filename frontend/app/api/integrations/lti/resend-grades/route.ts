/** POST — CORE-041 "Resend grades": retry every LMS score of the organisation that hasn't been delivered yet. */
import type { NextRequest } from 'next/server'
import { adminGate, errorResponse, json, tenantOf } from '@/lib/community/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const g = await adminGate(req, { write: true })
  if ('res' in g) return g.res
  try {
    const { resendFailedGrades } = await import('@/lib/integrations/lti/service')
    return json(await resendFailedGrades(tenantOf(g.user)!))
  } catch (e) { return errorResponse(e, 'lti resend grades') }
}

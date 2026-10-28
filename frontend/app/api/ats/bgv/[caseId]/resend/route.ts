import { NextRequest } from 'next/server'
import { auditAts } from '@/lib/ats/access'
import { bgvViewFor } from '@/lib/ats/bgv/access'
import { errorResponse, gate, json, loadCase } from '@/lib/ats/bgv/http'
import { resendLink } from '@/lib/ats/bgv/service'
import { limitRequest } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ caseId: string }> }

/** POST → new portal link (older links stop working); extends a passed deadline. */
export async function POST(req: NextRequest, { params }: Ctx) {
  const g = await gate(req, 'application.move', ['admin', 'recruiter'])
  if ('res' in g) return g.res
  const limited = await limitRequest(req, 'ats-bgv-resend', g.actor.userId, 5, 60_000)
  if (limited) return limited
  try {
    const c = await loadCase(g.actor, (await params).caseId, 'verify')
    const next = await resendLink(c)
    await auditAts(g.actor, 'ats.bgv.resend', 'ats_bgv_case', c.id, undefined, req)
    return json({ case: bgvViewFor(g.actor.role, next) })
  } catch (e) {
    return errorResponse(e, 'bgv resend')
  }
}

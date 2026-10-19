import { NextRequest } from 'next/server'
import { auditAts } from '@/lib/ats/access'
import { bgvViewFor } from '@/lib/ats/bgv/access'
import { bodyOf, errorResponse, gate, json, loadCase } from '@/lib/ats/bgv/http'
import { decide, sendFinalAdverseAction, withdrawAdverse } from '@/lib/ats/bgv/service'
import { limitRequest } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ caseId: string }> }

/**
 * POST — recruiter decision on a "consider" case:
 *   { decision: "pass" | "fail", note }   India fail → stage fails now.
 *                                         US fail → pre-adverse notice, then wait N business days.
 *   { action: "final_adverse" }           US: after the waiting period → final notice → stage fails.
 *   { action: "withdraw_adverse" }        US: stop the adverse action (case stays "consider").
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const g = await gate(req, 'application.move', ['admin', 'recruiter'])
  if ('res' in g) return g.res
  const limited = await limitRequest(req, 'ats-bgv-decision', g.actor.userId, 20, 60_000)
  if (limited) return limited
  try {
    const b = await bodyOf(req)
    const c = await loadCase(g.actor, (await params).caseId, 'verify')
    if (b.action === 'final_adverse') {
      const next = await sendFinalAdverseAction(g.actor, c)
      await auditAts(g.actor, 'ats.bgv.final_adverse', 'ats_bgv_case', c.id, undefined, req)
      return json({ case: bgvViewFor(g.actor.role, next) })
    }
    if (b.action === 'withdraw_adverse') {
      const next = await withdrawAdverse(g.actor, c)
      await auditAts(g.actor, 'ats.bgv.withdraw_adverse', 'ats_bgv_case', c.id, undefined, req)
      return json({ case: bgvViewFor(g.actor.role, next) })
    }
    const r = await decide(g.actor, c, b.decision, b.note)
    await auditAts(g.actor, 'ats.bgv.decision', 'ats_bgv_case', c.id, `${String(b.decision)}${r.adverse_started ? ' (pre-adverse sent)' : ''}`, req)
    return json({ case: bgvViewFor(g.actor.role, r.case), adverse_started: !!r.adverse_started })
  } catch (e) {
    return errorResponse(e, 'bgv decision')
  }
}

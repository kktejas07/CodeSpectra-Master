import { NextRequest } from 'next/server'
import { auditAts } from '@/lib/ats/access'
import { bgvViewFor } from '@/lib/ats/bgv/access'
import { bodyOf, errorResponse, gate, json, loadCase } from '@/lib/ats/bgv/http'
import { markCheck, requestInfo, revealSensitive } from '@/lib/ats/bgv/service'
import { limitRequest } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ caseId: string }> }

/**
 * POST { type, action }:
 *   action "mark"          { status: in_progress|verified|discrepancy|unable_to_verify|waived, notes }
 *   action "request_info"  { message } → reopens the check for the candidate and emails them
 *   action "reveal"        → full PAN / SSN / licence number (admins only, audit-logged)
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const g = await gate(req, 'application.move', ['admin', 'recruiter'])
  if ('res' in g) return g.res
  const limited = await limitRequest(req, 'ats-bgv-checks', g.actor.userId, 60, 60_000)
  if (limited) return limited
  try {
    const b = await bodyOf(req)
    const caseId = (await params).caseId
    if (b.action === 'reveal') {
      const c = await loadCase(g.actor, caseId, 'admin')
      const values = await revealSensitive(c, b.type)
      await auditAts(g.actor, 'ats.bgv.reveal', 'ats_bgv_case', c.id, `check ${String(b.type).slice(0, 40)}`, req)
      return json({ values })
    }
    const c = await loadCase(g.actor, caseId, 'verify')
    const next = b.action === 'request_info'
      ? await requestInfo(g.actor, c, b.type, b.message)
      : await markCheck(g.actor, c, b.type, b.status, b.notes)
    await auditAts(g.actor, `ats.bgv.${b.action === 'request_info' ? 'request_info' : 'mark'}`, 'ats_bgv_case', c.id, `${String(b.type).slice(0, 40)} ${b.action === 'request_info' ? '' : String(b.status).slice(0, 20)}`, req)
    return json({ case: bgvViewFor(g.actor.role, next) })
  } catch (e) {
    return errorResponse(e, 'bgv checks')
  }
}

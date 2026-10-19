import { NextRequest } from 'next/server'
import { auditAts } from '@/lib/ats/access'
import { bgvViewFor } from '@/lib/ats/bgv/access'
import { bodyOf, errorResponse, gate, json, loadCase } from '@/lib/ats/bgv/http'
import { assignVendor } from '@/lib/ats/bgv/service'
import { limitRequest } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ caseId: string }> }

/** POST { vendor } → assign a vendor (orders right away when the candidate has submitted). */
export async function POST(req: NextRequest, { params }: Ctx) {
  const g = await gate(req, 'application.move', ['admin', 'recruiter'])
  if ('res' in g) return g.res
  const limited = await limitRequest(req, 'ats-bgv-vendor', g.actor.userId, 10, 60_000)
  if (limited) return limited
  try {
    const b = await bodyOf(req)
    const c = await loadCase(g.actor, (await params).caseId, 'verify')
    const next = await assignVendor(g.actor, c, b.vendor)
    await auditAts(g.actor, 'ats.bgv.vendor', 'ats_bgv_case', c.id, String(b.vendor).slice(0, 40), req)
    return json({ case: bgvViewFor(g.actor.role, next) })
  } catch (e) {
    return errorResponse(e, 'bgv vendor')
  }
}

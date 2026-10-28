import { NextRequest } from 'next/server'
import { auditAts } from '@/lib/ats/access'
import { bgvViewFor } from '@/lib/ats/bgv/access'
import { bodyOf, errorResponse, gate, json, loadCase } from '@/lib/ats/bgv/http'
import { eraseCaseData } from '@/lib/ats/bgv/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ caseId: string }> }

/**
 * POST { confirm: "DELETE" } — admins: delete the candidate's BGV documents and
 * data now (candidate's data-deletion request). The outcome summary stays; an
 * open case is cancelled.
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const g = await gate(req, 'settings.manage', ['admin'])
  if ('res' in g) return g.res
  try {
    const b = await bodyOf(req)
    if (b.confirm !== 'DELETE') return json({ error: 'Confirm the deletion' }, 400)
    const c = await loadCase(g.actor, (await params).caseId, 'admin')
    const next = await eraseCaseData(c, 'candidate_request')
    await auditAts(g.actor, 'ats.bgv.erase', 'ats_bgv_case', c.id, 'candidate request', req)
    return json({ case: bgvViewFor(g.actor.role, next) })
  } catch (e) {
    return errorResponse(e, 'bgv erase')
  }
}

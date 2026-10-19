import { NextRequest } from 'next/server'
import { auditAts } from '@/lib/ats/access'
import { bgvViewFor } from '@/lib/ats/bgv/access'
import { errorResponse, gate, json, loadCase } from '@/lib/ats/bgv/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ caseId: string }> }

/** GET → the case as the actor may see it (full for admin/recruiter; every full view is audit-logged). */
export async function GET(req: NextRequest, { params }: Ctx) {
  const g = await gate(req, 'application.view')
  if ('res' in g) return g.res
  try {
    const c = await loadCase(g.actor, (await params).caseId)
    const view = bgvViewFor(g.actor.role, c)
    if (!view) return json({ error: 'Background check not found' }, 404)
    if (view.view === 'full') await auditAts(g.actor, 'ats.bgv.view', 'ats_bgv_case', c.id, undefined, req)
    return json({ case: view })
  } catch (e) {
    return errorResponse(e, 'bgv case get')
  }
}

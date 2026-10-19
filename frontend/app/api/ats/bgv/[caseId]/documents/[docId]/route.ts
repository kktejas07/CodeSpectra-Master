import { NextRequest } from 'next/server'
import { auditAts } from '@/lib/ats/access'
import { errorResponse, gate, json, loadCase } from '@/lib/ats/bgv/http'
import { documentViewUrl } from '@/lib/ats/bgv/service'
import { limitRequest } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ caseId: string; docId: string }> }

/** GET → a 5-minute signed URL for one document (admin / recruiter). Every view is audit-logged. */
export async function GET(req: NextRequest, { params }: Ctx) {
  const g = await gate(req, 'application.move', ['admin', 'recruiter'])
  if ('res' in g) return g.res
  const limited = await limitRequest(req, 'ats-bgv-doc', g.actor.userId, 60, 60_000)
  if (limited) return limited
  try {
    const { caseId, docId } = await params
    const c = await loadCase(g.actor, caseId, 'verify')
    const r = await documentViewUrl(c, docId)
    await auditAts(g.actor, 'ats.bgv.document.view', 'ats_bgv_case', c.id, `document ${docId} (${r.name})`, req)
    return json(r)
  } catch (e) {
    return errorResponse(e, 'bgv document')
  }
}

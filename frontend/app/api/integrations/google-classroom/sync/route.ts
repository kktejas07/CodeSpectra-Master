/** POST { link_id } — write released results back to Classroom as grades. */
import type { NextRequest } from 'next/server'
import { adminGate, bodyOf, errJson, errorResponse, json, tenantOf } from '@/lib/community/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const g = await adminGate(req, { write: true })
  if ('res' in g) return g.res
  try {
    const body = await bodyOf(req)
    if (typeof body.link_id !== 'string' || !/^cl_[0-9a-f]{16}$/.test(body.link_id)) return errJson(404, 'Assignment link not found', 'classroom_link_missing')
    const { syncGrades } = await import('@/lib/integrations/classroom')
    return json(await syncGrades(tenantOf(g.user)!, body.link_id))
  } catch (e) { return errorResponse(e, 'classroom sync') }
}

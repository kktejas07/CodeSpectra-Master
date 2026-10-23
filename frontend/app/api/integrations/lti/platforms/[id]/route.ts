/** PATCH — update a platform registration. DELETE — remove it. */
import type { NextRequest } from 'next/server'
import { adminGate, bodyOf, errJson, errorResponse, json, tenantOf } from '@/lib/community/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ id: string }> }
const ok = (id: string) => /^ltp_[0-9a-f]{16}$/.test(id)

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const g = await adminGate(req, { write: true })
  if ('res' in g) return g.res
  const { id } = await params
  if (!ok(id)) return errJson(404, 'Platform not found', 'lti_platform_missing')
  try {
    const { savePlatform } = await import('@/lib/integrations/lti/service')
    return json({ platform: await savePlatform(g.user, tenantOf(g.user)!, await bodyOf(req), id) })
  } catch (e) { return errorResponse(e, 'lti platform update') }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const g = await adminGate(req, { write: true })
  if ('res' in g) return g.res
  const { id } = await params
  if (!ok(id)) return errJson(404, 'Platform not found', 'lti_platform_missing')
  try {
    const { deletePlatform } = await import('@/lib/integrations/lti/service')
    return json(await deletePlatform(tenantOf(g.user)!, id))
  } catch (e) { return errorResponse(e, 'lti platform delete') }
}

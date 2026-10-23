/** GET — registered LTI 1.3 platforms. POST — register one (issuer, client_id, deployment ids, auth / token / JWKS URLs). */
import type { NextRequest } from 'next/server'
import { adminGate, bodyOf, errorResponse, json, tenantOf } from '@/lib/community/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const g = await adminGate(req)
  if ('res' in g) return g.res
  try {
    const { listPlatforms } = await import('@/lib/integrations/lti/service')
    return json({ platforms: await listPlatforms(tenantOf(g.user)!) })
  } catch (e) { return errorResponse(e, 'lti platforms') }
}

export async function POST(req: NextRequest) {
  const g = await adminGate(req, { write: true })
  if ('res' in g) return g.res
  try {
    const { savePlatform } = await import('@/lib/integrations/lti/service')
    return json({ platform: await savePlatform(g.user, tenantOf(g.user)!, await bodyOf(req)) }, 201)
  } catch (e) { return errorResponse(e, 'lti platform save') }
}

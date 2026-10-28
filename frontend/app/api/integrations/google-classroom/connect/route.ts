/** POST { client_id?, client_secret? } — start Google OAuth for Classroom (own app optional) → { url }. */
import type { NextRequest } from 'next/server'
import { adminGate, bodyOf, errJson, errorResponse, json, tenantOf } from '@/lib/community/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const g = await adminGate(req, { write: true })
  if ('res' in g) return g.res
  try {
    const body = await bodyOf(req)
    const id = typeof body.client_id === 'string' ? body.client_id.trim() : ''
    const secret = typeof body.client_secret === 'string' ? body.client_secret.trim() : ''
    if ((id || secret) && !(/^[\w.-]{10,200}\.apps\.googleusercontent\.com$/.test(id) && secret.length >= 10 && secret.length <= 200)) {
      return errJson(400, 'Enter a Google OAuth client ID (….apps.googleusercontent.com) and its secret, or leave both empty.', 'classroom_bad_app')
    }
    const { startConnect } = await import('@/lib/integrations/classroom')
    return json({ url: await startConnect(tenantOf(g.user)!, g.user.id, id ? { client_id: id, client_secret: secret } : null) })
  } catch (e) { return errorResponse(e, 'classroom connect') }
}

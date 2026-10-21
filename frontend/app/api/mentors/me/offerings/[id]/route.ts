/** PATCH (same body as POST ../) updates a session type; DELETE archives it (or deletes a never-sold draft). */
import type { NextRequest } from 'next/server'
import type { IdRouteContext } from '@/lib/app-route-context'
import { bodyOf, errorResponse, idOk, json, userGate } from '@/lib/mentors/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: IdRouteContext) {
  const g = await userGate(req, { write: true })
  if ('res' in g) return g.res
  const { id } = await params
  if (!idOk(id)) return json({ error: 'Session type not found', code: 'mentor_session_type_not_found' }, 404)
  try {
    const { updateOffering } = await import('@/lib/mentors/service')
    const p = await updateOffering(g.user.id, id, await bodyOf(req))
    return json({ offering: { id: p.id, slug: p.slug, status: p.status } })
  } catch (e) {
    return errorResponse(e, 'mentor offering update')
  }
}

export async function DELETE(req: NextRequest, { params }: IdRouteContext) {
  const g = await userGate(req, { write: true })
  if ('res' in g) return g.res
  const { id } = await params
  if (!idOk(id)) return json({ error: 'Session type not found', code: 'mentor_session_type_not_found' }, 404)
  try {
    const { archiveOffering } = await import('@/lib/mentors/service')
    return json({ result: await archiveOffering(g.user.id, id) })
  } catch (e) {
    return errorResponse(e, 'mentor offering archive')
  }
}

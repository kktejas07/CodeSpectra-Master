/** POST { action: verify|reject|suspend|reinstate, note? } (superadmin). */
import type { NextRequest } from 'next/server'
import type { IdRouteContext } from '@/lib/app-route-context'
import { adminGate, bodyOf, errorResponse, idOk, json } from '@/lib/mentors/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: IdRouteContext) {
  const g = await adminGate(req, { write: true })
  if ('res' in g) return g.res
  const { id } = await params
  if (!idOk(id)) return json({ error: 'Mentor not found' }, 404)
  try {
    const b = await bodyOf(req)
    const action = (['verify', 'reject', 'suspend', 'reinstate'] as const).find((a) => a === b.action)
    if (!action) return json({ error: 'Unknown action' }, 400)
    const { decideMentor } = await import('@/lib/mentors/service')
    return json({ mentor: await decideMentor(g.user.id, id, action, typeof b.note === 'string' ? b.note : null) })
  } catch (e) {
    return errorResponse(e, 'admin mentor decide')
  }
}

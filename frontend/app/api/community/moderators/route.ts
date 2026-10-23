/** GET — forum moderators. POST { email, moderator } — appoint / remove (superadmin). */
import type { NextRequest } from 'next/server'
import { adminGate, bodyOf, errorResponse, json } from '@/lib/community/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const g = await adminGate(req, { superOnly: true })
  if ('res' in g) return g.res
  try {
    const { listModerators } = await import('@/lib/community/service')
    return json({ moderators: await listModerators() })
  } catch (e) { return errorResponse(e, 'community moderators') }
}

export async function POST(req: NextRequest) {
  const g = await adminGate(req, { superOnly: true, write: true })
  if ('res' in g) return g.res
  try {
    const { setModerator } = await import('@/lib/community/service')
    return json(await setModerator(g.user, await bodyOf(req)))
  } catch (e) { return errorResponse(e, 'community moderator set') }
}

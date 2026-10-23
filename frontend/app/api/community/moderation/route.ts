/** GET — moderation queue (pending posts + open reports). POST — approve / hide / remove / lock / pin, optional ban. Moderators only. */
import type { NextRequest } from 'next/server'
import { bodyOf, errJson, errorResponse, json, userGate } from '@/lib/community/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const g = await userGate(req)
  if ('res' in g) return g.res
  try {
    const { moderationQueue } = await import('@/lib/community/service')
    return json(await moderationQueue(g.user))
  } catch (e) { return errorResponse(e, 'community mod queue') }
}

export async function POST(req: NextRequest) {
  const g = await userGate(req, { write: true, bucket: 'community-mod', max: 120 })
  if ('res' in g) return g.res
  try {
    const { moderationAction } = await import('@/lib/community/service')
    return json(await moderationAction(g.user, await bodyOf(req)))
  } catch (e) { return errorResponse(e, 'community mod action') }
}

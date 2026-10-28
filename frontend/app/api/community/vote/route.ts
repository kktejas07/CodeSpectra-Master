/** POST { target_type, target_id, value: 1 | -1 | 0 } — vote on a thread or reply (feeds reputation and XP). */
import type { NextRequest } from 'next/server'
import { bodyOf, errJson, errorResponse, json, userGate } from '@/lib/community/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const g = await userGate(req, { write: true, bucket: 'community-vote', max: 60 })
  if ('res' in g) return g.res
  try {
    const { vote } = await import('@/lib/community/service')
    return json(await vote(g.user, await bodyOf(req)))
  } catch (e) { return errorResponse(e, 'community vote') }
}

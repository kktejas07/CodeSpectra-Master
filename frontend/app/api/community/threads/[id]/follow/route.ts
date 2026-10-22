/** POST { on } — follow / unfollow a thread (reply notifications). */
import type { NextRequest } from 'next/server'
import { bodyOf, errJson, errorResponse, json, userGate } from '@/lib/community/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await userGate(req, { write: true, bucket: 'community-vote', max: 30 })
  if ('res' in g) return g.res
  const { id } = await params
  try {
    const body = await bodyOf(req)
    const { toggleFollow } = await import('@/lib/community/service')
    return json(await toggleFollow(g.user, id, body.on !== false))
  } catch (e) { return errorResponse(e, 'community follow') }
}

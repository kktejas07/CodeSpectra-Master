/** POST — reply to a thread (moderated, rate limited; followers and mentions are notified). */
import type { NextRequest } from 'next/server'
import { bodyOf, errJson, errorResponse, json, userGate } from '@/lib/community/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await userGate(req, { write: true, bucket: 'community-reply', max: 15 })
  if ('res' in g) return g.res
  const { id } = await params
  try {
    const { createReply } = await import('@/lib/community/service')
    return json(await createReply(g.user, id, await bodyOf(req)), 201)
  } catch (e) { return errorResponse(e, 'community reply') }
}

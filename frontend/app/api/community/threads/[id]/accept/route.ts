/** POST { reply_id | null } — the asker accepts (or clears) an answer. */
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
    const replyId = typeof body.reply_id === 'string' && /^r[0-9a-f]{18}$/.test(body.reply_id) ? body.reply_id : null
    if (body.reply_id && !replyId) return errJson(404, 'Reply not found', 'community_post_missing')
    const { acceptAnswer } = await import('@/lib/community/service')
    return json(await acceptAnswer(g.user, id, replyId))
  } catch (e) { return errorResponse(e, 'community accept') }
}

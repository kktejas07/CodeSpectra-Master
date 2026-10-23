/** GET ?before= — group chat (members). POST { body } — send a message (moderated, rate limited per minute). */
import type { NextRequest } from 'next/server'
import { bodyOf, errJson, errorResponse, json, userGate } from '@/lib/community/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ id: string }> }
const bad = () => errJson(404, 'Study group not found', 'community_group_missing')

export async function GET(req: NextRequest, { params }: Ctx) {
  const g = await userGate(req)
  if ('res' in g) return g.res
  const { id } = await params
  if (!/^g[0-9a-f]{18}$/.test(id)) return bad()
  try {
    const { groupMessages } = await import('@/lib/community/service')
    return json({ messages: await groupMessages(g.user, id, new URL(req.url).searchParams.get('before')) })
  } catch (e) { return errorResponse(e, 'community group messages') }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { getSettings } = await import('@/lib/community/moderation')
  const max = await getSettings().then((s) => s.rate.messages_per_minute).catch(() => 20)
  const g = await userGate(req, { write: true, bucket: 'community-chat', max })
  if ('res' in g) return g.res
  const { id } = await params
  if (!/^g[0-9a-f]{18}$/.test(id)) return bad()
  try {
    const { postGroupMessage } = await import('@/lib/community/service')
    return json({ message: await postGroupMessage(g.user, id, await bodyOf(req)) }, 201)
  } catch (e) { return errorResponse(e, 'community group message') }
}

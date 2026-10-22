/** DELETE — remove own reply (moderators: any). */
import type { NextRequest } from 'next/server'
import { errJson, errorResponse, json, userGate } from '@/lib/community/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await userGate(req, { write: true, bucket: 'community-edit', max: 20 })
  if ('res' in g) return g.res
  const { id } = await params
  if (!/^r[0-9a-f]{18}$/.test(id)) return errJson(404, 'Post not found', 'community_post_missing')
  try {
    const { removeOwn } = await import('@/lib/community/service')
    return json(await removeOwn(g.user, 'reply', id))
  } catch (e) { return errorResponse(e, 'community reply delete') }
}

/** GET — a study group and its members. POST { action: 'join' | 'leave', code? }. */
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
    const { groupView } = await import('@/lib/community/service')
    return json(await groupView(g.user, id))
  } catch (e) { return errorResponse(e, 'community group') }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const g = await userGate(req, { write: true, bucket: 'community-group-join', max: 10 })
  if ('res' in g) return g.res
  const { id } = await params
  if (!/^g[0-9a-f]{18}$/.test(id)) return bad()
  try {
    const body = await bodyOf(req)
    const svc = await import('@/lib/community/service')
    if (body.action === 'leave') return json(await svc.leaveGroup(g.user, id))
    return json(await svc.joinGroup(g.user, id, typeof body.code === 'string' ? body.code.trim().toLowerCase() : null))
  } catch (e) { return errorResponse(e, 'community group action') }
}

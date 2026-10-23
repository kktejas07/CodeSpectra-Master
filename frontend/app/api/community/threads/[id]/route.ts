/** GET — a thread for the viewer (solution write-ups unlock once the viewer solved the problem). DELETE — remove own thread. */
import type { NextRequest } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { errorResponse, json, userGate } from '@/lib/community/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params
  try {
    const user = await getAPIUser().catch(() => null)
    const { getThreadFor } = await import('@/lib/community/service')
    return json(await getThreadFor(user, id))
  } catch (e) { return errorResponse(e, 'community thread') }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const g = await userGate(req, { write: true, bucket: 'community-edit', max: 20 })
  if ('res' in g) return g.res
  const { id } = await params
  try {
    const { removeOwn } = await import('@/lib/community/service')
    return json(await removeOwn(g.user, 'thread', id))
  } catch (e) { return errorResponse(e, 'community thread delete') }
}

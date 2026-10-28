/** POST { done: boolean } — check a plan item off (first completion earns XP once). */
import type { NextRequest } from 'next/server'
import type { IdRouteContext } from '@/lib/app-route-context'
import { bodyOf, errorResponse, gate, json } from '@/lib/study-plan/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: IdRouteContext) {
  const g = await gate(req, { write: true, max: 120 })
  if ('res' in g) return g.res
  const { id } = await params
  try {
    const b = await bodyOf(req)
    if (typeof b.done !== 'boolean') return json({ error: 'Send { done: true | false }' }, 400)
    const { setItemDone } = await import('@/lib/study-plan/service')
    return json({ item: await setItemDone(g.user.id, id, b.done) })
  } catch (e) {
    return errorResponse(e, 'plan item')
  }
}

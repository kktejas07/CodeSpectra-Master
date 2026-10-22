/** POST { target_type, target_id, reason, note? } — report a post (3 open reports hide it for review). */
import type { NextRequest } from 'next/server'
import { bodyOf, errJson, errorResponse, json, userGate } from '@/lib/community/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const g = await userGate(req, { write: true, bucket: 'community-report', max: 10 })
  if ('res' in g) return g.res
  try {
    const { report } = await import('@/lib/community/service')
    return json(await report(g.user, await bodyOf(req)))
  } catch (e) { return errorResponse(e, 'community report') }
}

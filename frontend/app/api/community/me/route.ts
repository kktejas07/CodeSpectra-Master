/** GET — the caller's threads, followed threads, reputation and study groups. */
import type { NextRequest } from 'next/server'
import { errorResponse, json, userGate } from '@/lib/community/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const g = await userGate(req)
  if ('res' in g) return g.res
  try {
    const { myCommunity } = await import('@/lib/community/service')
    return json(await myCommunity(g.user))
  } catch (e) { return errorResponse(e, 'community me') }
}

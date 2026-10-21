/** GET ?past=1 — the mentor's sessions (upcoming by default). */
import type { NextRequest } from 'next/server'
import { errorResponse, json, userGate } from '@/lib/mentors/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const g = await userGate(req)
  if ('res' in g) return g.res
  try {
    const { getMentorByUser } = await import('@/lib/mentors/service')
    const me = await getMentorByUser(g.user.id)
    if (!me) return json({ sessions: [] })
    const { listMentorSessions } = await import('@/lib/mentors/sessions')
    return json({ sessions: await listMentorSessions(me.seller_id, req.nextUrl.searchParams.get('past') !== '1') })
  } catch (e) {
    return errorResponse(e, 'mentor sessions')
  }
}

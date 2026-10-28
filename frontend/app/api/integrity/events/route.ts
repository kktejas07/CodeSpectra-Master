/**
 * POST /api/integrity/events — a batch of integrity events from the
 * candidate's browser: { target_kind, target_id, events: [{ type, at, q?, data? }] }.
 * The server checks the caller owns a running attempt, drops event types the
 * author did not switch on, accepts nothing but consent until consent is on
 * file, rate-limits, and adds network changes itself (salted IP hash).
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { clientIpOrEmpty } from '@/lib/client-ip'
import { ingestEvents } from '@/lib/integrity/service'
import { errorBody } from '@/lib/services/result'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })
  const len = Number(req.headers.get('content-length') || 0)
  if (len > 64 * 1024) return NextResponse.json({ error: 'Batch too large' }, { status: 413 })
  const body = await req.json().catch(() => null)
  try {
    const r = await ingestEvents(user, body, clientIpOrEmpty(req))
    return r.ok ? NextResponse.json(r.data) : NextResponse.json(errorBody(r), { status: r.status })
  } catch (e) {
    console.error('[integrity/events] failed:', (e as Error).message)
    return NextResponse.json({ error: 'Could not save events' }, { status: 500 })
  }
}

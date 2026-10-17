import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { proctorEvents, newId, nowIso } from '@/lib/db/ai'
import { parseUserAgent } from '@/lib/db/sessions'
import { sanitizeProctorMeta } from '@/lib/exam-access'
import { rateLimitSlidingWindow } from '@/lib/in-memory-rate-limit'

const SESSION_KINDS = ['exam', 'problem', 'interview'] as const

export const runtime = 'nodejs'

interface EventReq {
  session_kind: 'exam' | 'problem' | 'interview'
  session_id: string
  event_type: string
  meta?: Record<string, unknown>
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: EventReq
  try {
    body = (await req.json()) as EventReq
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!body || typeof body.session_id !== 'string' || typeof body.event_type !== 'string' || !body.session_id || !body.event_type) {
    return NextResponse.json({ error: 'session_id + event_type required' }, { status: 400 })
  }
  if (!/^[a-z0-9_]{1,64}$/.test(body.event_type) || body.session_id.length > 128) {
    return NextResponse.json({ error: 'Invalid event' }, { status: 400 })
  }
  // Browser-reported and unauthenticated by design (beacon-style), so bound it.
  const rl = rateLimitSlidingWindow(`proctor-events:${user.id}`, 600, 10 * 60_000)
  if (!rl.ok) return NextResponse.json({ error: 'Too many events' }, { status: 429 })

  try {
    const ua = req.headers.get('user-agent') || ''
    const parsed = parseUserAgent(ua)
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || ''

    const col = await proctorEvents()
    const doc = {
      id: newId(),
      user_id: user.id,
      session_kind: (SESSION_KINDS as readonly string[]).includes(body.session_kind) ? body.session_kind : 'problem',
      session_id: body.session_id,
      event_type: body.event_type,
      // Client fields are flattened and capped; server fields always win.
      meta: { ...sanitizeProctorMeta(body.meta), ua: ua.slice(0, 500), browser: parsed.browser, os: parsed.os, device: parsed.device, ip },
      created_at: nowIso(),
    }
    await col.insertOne(doc)
    return NextResponse.json({ ok: true, id: doc.id })
  } catch (e) {
    console.error('[proctor/events] write failed:', e)
    return NextResponse.json({ error: 'Event write failed' }, { status: 500 })
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const sessionId = req.nextUrl.searchParams.get('session_id') || ''
    const col = await proctorEvents()
    const q = sessionId ? { user_id: user.id, session_id: sessionId } : { user_id: user.id }
    const rows = await col.find(q).sort({ created_at: -1 }).limit(200).toArray()
    return NextResponse.json({ events: rows })
  } catch (e) {
    console.error('[proctor/events] read failed:', e)
    return NextResponse.json({ events: [] })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { proctorEvents, newId, nowIso } from '@/lib/db/ai'

export const runtime = 'nodejs'

interface EventReq {
  session_kind: 'exam' | 'problem' | 'interview'
  session_id: string
  event_type: string // 'tab_blur' | 'tab_focus' | 'copy' | 'paste' | 'right_click' | 'fullscreen_exit' | 'multi_face' | 'no_face'
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
  if (!body.session_id || !body.event_type) {
    return NextResponse.json({ error: 'session_id + event_type required' }, { status: 400 })
  }

  const col = await proctorEvents()
  const doc = {
    id: newId(),
    user_id: user.id,
    session_kind: body.session_kind || 'problem',
    session_id: body.session_id,
    event_type: body.event_type.slice(0, 64),
    meta: body.meta || {},
    created_at: nowIso(),
  }
  await col.insertOne(doc)
  return NextResponse.json({ ok: true, id: doc.id })
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sessionId = req.nextUrl.searchParams.get('session_id') || ''
  const col = await proctorEvents()
  const q = sessionId ? { user_id: user.id, session_id: sessionId } : { user_id: user.id }
  const rows = await col.find(q).sort({ created_at: -1 }).limit(200).toArray()
  return NextResponse.json({ events: rows })
}

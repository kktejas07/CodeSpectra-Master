import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { proctorEvents, newId, nowIso } from '@/lib/db/ai'
import { interviewSessions } from '@/lib/db/interviews'

export const runtime = 'nodejs'

interface TerminateReq {
  session_kind: 'exam' | 'problem' | 'interview'
  session_id: string
  reason: string
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: TerminateReq
  try {
    body = (await req.json()) as TerminateReq
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!body.session_id || !body.reason) {
    return NextResponse.json({ error: 'session_id + reason required' }, { status: 400 })
  }

  // Record the kickout event
  const col = await proctorEvents()
  await col.insertOne({
    id: newId(),
    user_id: user.id,
    session_kind: body.session_kind || 'interview',
    session_id: body.session_id,
    event_type: 'session_kickout',
    meta: { reason: body.reason, terminated_by: 'auto' },
    created_at: nowIso(),
  })

  // If interview, mark session as completed (terminated)
  if (body.session_kind === 'interview') {
    const sessions = await interviewSessions()
    await sessions.updateOne(
      { id: body.session_id },
      { $set: { status: 'completed', completed_at: nowIso(), notes: `Auto-terminated: ${body.reason}` } }
    )
  }

  return NextResponse.json({ ok: true, terminated: true })
}

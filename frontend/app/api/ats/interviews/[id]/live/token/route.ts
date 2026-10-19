import { NextRequest, NextResponse } from 'next/server'
import { requireAts, tenantFromRequest } from '@/lib/ats/access'
import { canScheduleInterview, onPanel } from '@/lib/ats/interviews/access'
import { getInterview, loadContext } from '@/lib/ats/interviews/service'
import { mintRoomToken } from '@/lib/ats/interviews/livekit'
import { interviewErrorResponse, NO_STORE } from '@/lib/ats/interviews/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** POST — LiveKit token for a panel member (or the job's recruiter/admin) of a built-in video interview. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAts([], tenantFromRequest(req))
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { actor } = gate
  const { id } = await params
  try {
    const iv = await getInterview(actor.tenantId, id)
    if (!iv) return NextResponse.json({ error: 'Interview not found' }, { status: 404 })
    const { job } = await loadContext(iv)
    if (!onPanel(actor, iv) && !canScheduleInterview(actor, iv, job)) {
      return NextResponse.json({ error: 'Only the interview panel can join this room' }, { status: 403 })
    }
    if (iv.mode !== 'virtual' || (iv.provider || 'livekit') !== 'livekit') {
      return NextResponse.json({ error: 'This interview uses an external meeting link.' }, { status: 409 })
    }
    if (iv.status !== 'scheduled') return NextResponse.json({ error: 'This interview is not scheduled.' }, { status: 409 })
    const name = actor.name || iv.panel.find((p) => p.user_id === actor.userId)?.name || actor.email || 'Interviewer'
    // Identity is the signed-in account — never taken from the request body.
    const t = await mintRoomToken(iv.id, `panel:${actor.userId}`, name)
    if (!t) return NextResponse.json({ error: 'Video is not configured. Set LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET.' }, { status: 503 })
    return NextResponse.json({ ...t, title: `${iv.candidate_name || 'Candidate'} — ${iv.job_title || 'Interview'}` }, { headers: NO_STORE })
  } catch (e) {
    return interviewErrorResponse(e, 'live token')
  }
}

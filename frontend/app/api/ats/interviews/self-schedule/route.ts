import { NextRequest, NextResponse } from 'next/server'
import { interviewFromToken, selfSchedule, slotsFor } from '@/lib/ats/interviews/service'
import { interviewErrorResponse, NO_STORE } from '@/lib/ats/interviews/http'
import { limitRequest } from '@/lib/rate-limit'
import type { AtsInterviewDoc } from '@/lib/ats/interviews/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Only what the candidate needs — no panel emails, no ids beyond the token. */
function view(iv: AtsInterviewDoc) {
  return {
    status: iv.status,
    job_title: iv.job_title || 'Interview',
    stage_name: iv.stage_name || null,
    candidate_name: iv.candidate_name || null,
    mode: iv.mode,
    duration_min: iv.duration_min,
    scheduled_at: iv.status === 'scheduled' ? iv.scheduled_at : null,
    requested_slot: iv.requested_slot ?? null,
    location: iv.mode === 'f2f' ? iv.location_details ?? (iv.location ? { address: iv.location } : null) : null,
    panel_size: iv.panel.length,
  }
}

/** GET ?token= — public: interview summary + open slots (signed self-schedule link). */
export async function GET(req: NextRequest) {
  const limited = await limitRequest(req, 'ats-self-schedule-get', null, 30, 60_000)
  if (limited) return limited
  const token = new URL(req.url).searchParams.get('token')
  try {
    const iv = await interviewFromToken(token, 'sched')
    if (!iv) return NextResponse.json({ error: 'This link has expired or is no longer valid.' }, { status: 404 })
    const canPick = iv.self_schedule && iv.status === 'awaiting_schedule' && !iv.requested_slot
    const { slots, timezone } = canPick ? await slotsFor(iv) : { slots: [], timezone: iv.timezone || 'UTC' }
    return NextResponse.json({ interview: view(iv), timezone, slots, can_pick: canPick }, { headers: NO_STORE })
  } catch (e) {
    return interviewErrorResponse(e, 'self-schedule get')
  }
}

/** POST { token, start } — public: book one of the offered slots. */
export async function POST(req: NextRequest) {
  const limited = await limitRequest(req, 'ats-self-schedule-post', null, 8, 60_000)
  if (limited) return limited
  let body: { token?: unknown; start?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON', code: 'invalid_json' }, { status: 400 }) }
  if (typeof body.start !== 'string' || body.start.length > 40) return NextResponse.json({ error: 'Pick a time.' }, { status: 400 })
  try {
    const iv = await interviewFromToken(body.token, 'sched')
    if (!iv) return NextResponse.json({ error: 'This link has expired or is no longer valid.' }, { status: 404 })
    const r = await selfSchedule(iv, body.start)
    return NextResponse.json({ booked: r.booked, interview: view(r.interview) })
  } catch (e) {
    return interviewErrorResponse(e, 'self-schedule post')
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { interviewFromToken, joinWindowOpen } from '@/lib/ats/interviews/service'
import { mintRoomToken } from '@/lib/ats/interviews/livekit'
import { interviewErrorResponse, NO_STORE } from '@/lib/ats/interviews/http'
import { limitRequest } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET ?token= — public: what the candidate's join page shows. */
export async function GET(req: NextRequest) {
  const limited = await limitRequest(req, 'ats-join-get', null, 60, 60_000)
  if (limited) return limited
  try {
    const iv = await interviewFromToken(new URL(req.url).searchParams.get('token'), 'join')
    if (!iv) return NextResponse.json({ error: 'This link has expired or is no longer valid. Check your latest interview email.' }, { status: 404 })
    return NextResponse.json({
      job_title: iv.job_title || 'Interview',
      candidate_name: iv.candidate_name || null,
      status: iv.status,
      scheduled_at: iv.scheduled_at,
      duration_min: iv.duration_min,
      timezone: iv.timezone || 'UTC',
      window: joinWindowOpen(iv),
      builtin: iv.mode === 'virtual' && (iv.provider || 'livekit') === 'livekit',
      // External meetings: the provider's link (the candidate already has it in the invite).
      external_url: iv.mode === 'virtual' && iv.provider && iv.provider !== 'livekit' ? iv.join_url ?? null : null,
    }, { headers: NO_STORE })
  } catch (e) {
    return interviewErrorResponse(e, 'join get')
  }
}

/** POST { token } — public: LiveKit token for the candidate (no account needed) inside the join window. */
export async function POST(req: NextRequest) {
  const limited = await limitRequest(req, 'ats-join-post', null, 10, 60_000)
  if (limited) return limited
  let body: { token?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON', code: 'invalid_json' }, { status: 400 }) }
  try {
    const iv = await interviewFromToken(body.token, 'join')
    if (!iv) return NextResponse.json({ error: 'This link has expired or is no longer valid.' }, { status: 404 })
    if (iv.mode !== 'virtual' || (iv.provider || 'livekit') !== 'livekit') return NextResponse.json({ error: 'This interview uses another meeting app.' }, { status: 409 })
    const w = joinWindowOpen(iv)
    if (w !== 'open') {
      return NextResponse.json({ error: w === 'early' ? 'The room opens 15 minutes before your interview.' : 'This interview is not open right now.' }, { status: 409 })
    }
    // Identity is fixed by the signed link — one seat per candidate.
    const t = await mintRoomToken(iv.id, `candidate:${iv.candidate_id}`, iv.candidate_name || 'Candidate', 2 * 3600)
    if (!t) return NextResponse.json({ error: 'Video is not available right now. Please contact the recruiter.' }, { status: 503 })
    return NextResponse.json({ ...t, title: iv.job_title || 'Interview' }, { headers: NO_STORE })
  } catch (e) {
    return interviewErrorResponse(e, 'join post')
  }
}

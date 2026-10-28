import { NextRequest, NextResponse } from 'next/server'
import { requireAts, tenantFromRequest } from '@/lib/ats/access'
import { publicInterview } from '@/lib/ats/interviews/db'
import { submitScorecard } from '@/lib/ats/interviews/service'
import { interviewErrorResponse } from '@/lib/ats/interviews/http'
import { limitRequest } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST { ratings: { [criterion id]: 1–5 }, recommendation: strong_yes|yes|no|strong_no, notes? }
 * Only panel members (checked in the service against the stored panel). Resubmitting
 * replaces the caller's card until the panel decision is recorded.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAts([], tenantFromRequest(req))
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { actor } = gate
  if (actor.role === 'client') return NextResponse.json({ error: "Your hiring role can't submit scorecards" }, { status: 403 })
  const limited = await limitRequest(req, 'ats-scorecard', actor.userId, 20, 60_000)
  if (limited) return limited
  const { id } = await params
  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON', code: 'invalid_json' }, { status: 400 }) }
  try {
    const iv = await submitScorecard(actor, id, body)
    const mine = iv.scorecards.find((c) => c.interviewer_id === actor.userId) || null
    return NextResponse.json({ scorecard: mine, interview: { ...publicInterview(iv, { showHost: true }), scorecards: undefined } })
  } catch (e) {
    return interviewErrorResponse(e, 'scorecard')
  }
}

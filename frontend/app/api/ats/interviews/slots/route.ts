import { NextRequest, NextResponse } from 'next/server'
import { requireAts, tenantFromRequest } from '@/lib/ats/access'
import { atsInterviews } from '@/lib/ats/interviews/db'
import { canScheduleInterview } from '@/lib/ats/interviews/access'
import { getInterview, loadContext, slotsFor } from '@/lib/ats/interviews/service'
import { interviewErrorResponse, NO_STORE } from '@/lib/ats/interviews/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ID = /^[A-Za-z0-9_-]{1,64}$/

/** GET ?interview=<id> or ?app=<application id> — free panel slots (recruiter view). */
export async function GET(req: NextRequest) {
  const gate = await requireAts(['admin', 'recruiter'], tenantFromRequest(req))
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { actor } = gate
  const sp = new URL(req.url).searchParams
  const ivId = sp.get('interview')
  const appId = sp.get('app')
  try {
    let iv = ivId && ID.test(ivId) ? await getInterview(actor.tenantId, ivId) : null
    if (!iv && appId && ID.test(appId)) {
      iv = await (await atsInterviews()).findOne(
        { tenant_id: actor.tenantId, application_id: appId, status: { $in: ['awaiting_schedule', 'scheduled'] } },
        { projection: { _id: 0 }, sort: { created_at: -1 } },
      )
    }
    if (!iv) return NextResponse.json({ error: 'Interview not found' }, { status: 404 })
    const { job } = await loadContext(iv)
    if (!canScheduleInterview(actor, iv, job)) return NextResponse.json({ error: 'Interview not found' }, { status: 404 })
    const { slots, timezone } = await slotsFor(iv)
    return NextResponse.json({ interview_id: iv.id, timezone, duration_min: iv.duration_min, slots }, { headers: NO_STORE })
  } catch (e) {
    return interviewErrorResponse(e, 'slots')
  }
}

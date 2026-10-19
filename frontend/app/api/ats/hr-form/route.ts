import { NextRequest, NextResponse } from 'next/server'
import { candidateFormView, formFromToken, submitHrForm } from '@/lib/ats/hr/service'
import { limitRequest } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' }
const GONE = 'This link has expired or was replaced by a newer one. Check your latest email from the hiring team.'

/** GET ?token= — public (signed link): the candidate's HR compensation form with their figures prefilled. */
export async function GET(req: NextRequest) {
  const limited = await limitRequest(req, 'ats-hr-form-get', null, 60, 60_000)
  if (limited) return limited
  try {
    const ctx = await formFromToken(new URL(req.url).searchParams.get('token'))
    if (!ctx) return NextResponse.json({ error: GONE }, { status: 404, headers: NO_STORE })
    return NextResponse.json(await candidateFormView(ctx), { headers: NO_STORE })
  } catch (e) {
    console.error('[ats/hr-form] GET failed:', e)
    return NextResponse.json({ error: 'Could not load the form. Try again.' }, { status: 500, headers: NO_STORE })
  }
}

/**
 * POST { token, experience_level, currency, period, current_ctc, currently_employed,
 *        breakup: { fixed, variable }, expected_ctc, notice_days, negotiable } — public.
 * Validated by parseCompensation; stored as application.compensation (source 'hr_form').
 */
export async function POST(req: NextRequest) {
  const limited = await limitRequest(req, 'ats-hr-form-post', null, 10, 60_000)
  if (limited) return limited
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  try {
    const r = await submitHrForm((body as Record<string, unknown>).token, body)
    if (!r.ok) return NextResponse.json({ error: r.errors[0], errors: r.errors }, { status: r.status, headers: NO_STORE })
    return NextResponse.json({ ok: true }, { headers: NO_STORE })
  } catch (e) {
    console.error('[ats/hr-form] POST failed:', e)
    return NextResponse.json({ error: 'Could not save your details. Try again.' }, { status: 500, headers: NO_STORE })
  }
}

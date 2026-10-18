import { NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { cancelAtPeriodEnd, resumeSubscription } from '@/lib/billing-plans'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/billing/cancel — cancel at period end: the plan stays active until
 * `ends_at`, then lapses. Stripe subscriptions are set to cancel_at_period_end
 * at Stripe first (lib/billing-plans.ts); prepaid plans are DB-only.
 */
export async function POST() {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const res = await cancelAtPeriodEnd(user.id)
    if (!res) return NextResponse.json({ error: 'You have no active paid plan to cancel.' }, { status: 404 })
    return NextResponse.json({ ok: true, cancel_at_period_end: true, access_until: res.ends_at })
  } catch (error) {
    console.error('[billing/cancel]', error)
    return NextResponse.json({ error: 'Could not cancel right now. Please try again.' }, { status: 500 })
  }
}

/** DELETE /api/billing/cancel — "Keep my plan": undo a pending cancel (at Stripe too) before the period ends. */
export async function DELETE() {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const ok = await resumeSubscription(user.id)
    if (!ok) return NextResponse.json({ error: 'There is no pending cancellation to undo.' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[billing/cancel] DELETE', error)
    return NextResponse.json({ error: 'Could not update your plan right now. Please try again.' }, { status: 500 })
  }
}

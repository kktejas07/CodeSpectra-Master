import { NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { billingSubscriptions, BILLING_PLANS } from '@/lib/db/billing'
import { isRazorpayConfigured } from '@/lib/razorpay-server'

export const runtime = 'nodejs'

/**
 * GET /api/billing/me — returns the current user's active subscription
 * (or null) + the public plan catalog + Razorpay readiness flag.
 */
export async function GET(): Promise<NextResponse> {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const subs = await billingSubscriptions()
  const active = await subs.findOne({ user_id: user.id, status: 'active' })

  return NextResponse.json({
    razorpay_configured: await isRazorpayConfigured(),
    subscription:
      active && new Date(active.ends_at) > new Date()
        ? {
            id: active.id,
            plan_id: active.plan_id,
            ends_at: active.ends_at,
            status: active.status,
          }
        : null,
    plans: Object.values(BILLING_PLANS).map((p) => ({
      id: p.id,
      name: p.name,
      amount_paise: p.amount_paise,
      amount_inr: p.amount_paise / 100,
      currency: p.currency,
      kind: p.kind,
      perks: p.perks,
      duration_days: p.duration_days,
    })),
  })
}

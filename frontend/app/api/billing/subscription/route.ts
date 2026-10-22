import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { billingOrders, billingSubscriptions } from '@/lib/db/billing'
import { cancelAtPeriodEnd, resolveBillingPlan, storedPlanLabel } from '@/lib/billing-plans'
import { rateLimitAIRedis } from '@/lib/upstash-rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/billing/subscription — the caller's active subscription (or null),
 * with the plan name / interval / price taken from the order that funded it.
 * Reads the DB directly so it works even when no gateway is configured.
 */
export async function GET() {
  try {
    const user = await getAPIUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })

    const subs = await billingSubscriptions()
    const active = await subs.findOne({ user_id: user.id, status: 'active' }, { projection: { _id: 0 }, sort: { ends_at: -1 } })
    if (!active || new Date(active.ends_at) <= new Date()) {
      return NextResponse.json({ subscription: null, user_email: user.email })
    }
    const order = active.last_order_id
      ? await (await billingOrders()).findOne({ id: active.last_order_id, user_id: user.id }, { projection: { _id: 0 } })
      : null
    const resolved = order ? null : await resolveBillingPlan(active.plan_id).catch(() => null)
    return NextResponse.json({
      subscription: {
        id: active.id,
        plan_id: active.plan_id,
        plan_name: order ? storedPlanLabel(order) : resolved?.name ?? active.plan_id,
        status: active.status,
        starts_at: active.started_at,
        ends_at: active.ends_at,
        trial_ends_at: active.trial_ends_at ?? null,
        cancel_at_period_end: active.cancel_at_period_end === true,
        cancelled_at: active.cancel_at_period_end ? active.cancelled_at ?? null : null,
        interval: order?.interval ?? resolved?.interval ?? 'month',
        amount: order ? (order.amount_paise || 0) / 100 : resolved ? resolved.amount_paise / 100 : null,
        currency: order?.currency ?? resolved?.currency ?? null,
        provider: active.billing_mode === 'stripe_subscription' ? 'stripe' : active.billing_mode === 'razorpay_subscription' ? 'razorpay' : null,
        auto_renew: (active.billing_mode === 'stripe_subscription' || active.billing_mode === 'razorpay_subscription') && active.cancel_at_period_end !== true,
        past_due: active.past_due === true,
        grace_ends_at: active.past_due ? active.grace_ends_at ?? null : null,
      },
      user_email: user.email,
    })
  } catch (error) {
    console.error('[billing/subscription] GET:', error)
    return NextResponse.json({ error: 'Something went wrong. Please try again.', code: 'server_error' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await getAPIUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })

    const rateCheck = await rateLimitAIRedis(req, user.id)
    if (!rateCheck.ok) {
      return NextResponse.json({ error: `Rate limit. Try in ${rateCheck.retryAfterSec}s.` }, { status: 429 })
    }

    const { plan_id } = (await req.json().catch(() => ({}))) as { plan_id?: unknown }
    if (typeof plan_id !== 'string' || !plan_id) return NextResponse.json({ error: 'plan_id is required' }, { status: 400 })

    // Paid plans (and paid billing-cycle changes) are only granted by a
    // gateway-verified payment: /api/billing/verify, the Razorpay/Stripe
    // webhooks or the PhonePe callback. This route may only downgrade to Free.
    if (plan_id !== 'free') {
      return NextResponse.json(
        { error: 'Paid plans must be purchased through checkout.' },
        { status: 402 },
      )
    }

    // Downgrade to Free = cancel at period end (same as /api/billing/cancel):
    // the prepaid period is kept, then the plan lapses to Free.
    const res = await cancelAtPeriodEnd(user.id)
    return NextResponse.json({ ok: true, plan_id, access_until: res?.ends_at ?? null })
  } catch (error) {
    console.error('[billing/subscription] PUT:', error)
    return NextResponse.json({ error: 'Something went wrong. Please try again.', code: 'server_error' }, { status: 500 })
  }
}

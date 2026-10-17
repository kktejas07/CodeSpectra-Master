import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { PaymentService } from '@/lib/payment-service'
import { billingSubscriptions } from '@/lib/db/billing'
import { rateLimitAIRedis } from '@/lib/upstash-rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const user = await getAPIUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const ps = new PaymentService()
    const subscription = await ps.getSubscription(user.id)
    return NextResponse.json({ subscription })
  } catch (error) {
    console.error('[billing/subscription] GET:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await getAPIUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const rateCheck = await rateLimitAIRedis(req, user.id)
    if (!rateCheck.ok) {
      return NextResponse.json({ error: `Rate limit. Try in ${rateCheck.retryAfterSec}s.` }, { status: 429 })
    }

    const { plan_id } = (await req.json().catch(() => ({}))) as { plan_id?: string }
    if (!plan_id) return NextResponse.json({ error: 'plan_id is required' }, { status: 400 })

    // Paid plans (and paid billing-cycle changes) are only granted by a
    // gateway-verified payment: /api/billing/verify, the Razorpay/Stripe
    // webhooks or the PhonePe callback. This route may only downgrade to Free.
    if (plan_id !== 'free') {
      return NextResponse.json(
        { error: 'Paid plans must be purchased through checkout.' },
        { status: 402 },
      )
    }

    const subs = await billingSubscriptions()
    // Downgrade to Free = cancel the active subscription (same as /api/billing/cancel).
    await subs.updateMany({ user_id: user.id, status: 'active' }, { $set: { status: 'cancelled' } })

    return NextResponse.json({ ok: true, plan_id })
  } catch (error) {
    console.error('[billing/subscription] PUT:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

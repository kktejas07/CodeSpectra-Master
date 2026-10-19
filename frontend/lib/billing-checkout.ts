/**
 * Shared handler for POST /api/billing/checkout and the deprecated
 * POST /api/billing/create-order, so both paths behave the same
 * (same plan resolver, coupons, rate limit and error handling).
 */
import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { CheckoutError, PaymentService } from '@/lib/payment-service'
import { hasUserUsedCoupon } from '@/lib/db/billing'
import { rateLimitAIRedis } from '@/lib/upstash-rate-limit'
import { CONTACT_SALES_HREF, isValidPlanId, parseInterval } from '@/lib/billing-plan-mode'

export async function handleCheckoutRequest(req: NextRequest): Promise<NextResponse> {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rateCheck = await rateLimitAIRedis(req, user.id)
  if (!rateCheck.ok) {
    return NextResponse.json({ error: `Rate limit. Try in ${rateCheck.retryAfterSec}s.` }, { status: 429 })
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const planId = body.plan_id
  if (!isValidPlanId(planId)) return NextResponse.json({ error: 'Choose a plan first.' }, { status: 400 })
  const interval = parseInterval(body.interval)
  const country = typeof body.country === 'string' && /^[A-Za-z]{2}$/.test(body.country) ? body.country : null
  const couponCode = typeof body.coupon_code === 'string' ? body.coupon_code.trim().slice(0, 64) : ''

  try {
    let couponId: string | undefined
    if (couponCode) {
      const { validateCoupon } = await import('@/lib/coupon-service')
      const validation = await validateCoupon(couponCode, { target: 'plans' })
      if (!validation.valid || !validation.coupon) {
        return NextResponse.json({ error: validation.error || 'Invalid coupon' }, { status: 400 })
      }
      if (await hasUserUsedCoupon(validation.coupon.id, user.id)) {
        return NextResponse.json({ error: 'You have already used this coupon code.' }, { status: 400 })
      }
      couponId = validation.coupon.id
    }

    const result = await new PaymentService().createCheckout(user.id, user.email, planId, country, couponId, interval)
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof CheckoutError) {
      const status = error.code === 'unknown_plan' ? 404 : 409
      return NextResponse.json(
        { error: error.message, code: error.code, ...(error.code === 'contact_sales' ? { contact_url: CONTACT_SALES_HREF } : {}) },
        { status },
      )
    }
    const msg = (error as Error)?.message || ''
    console.error('[billing/checkout]', error)
    if (msg.includes('No payment provider configured')) {
      return NextResponse.json(
        { error: "Payments aren't set up yet. Contact us to upgrade your plan.", code: 'payments_not_configured' },
        { status: 503 },
      )
    }
    return NextResponse.json({ error: 'Could not start checkout. Please try again.' }, { status: 500 })
  }
}

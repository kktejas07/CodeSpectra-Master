/**
 * Shared handler for POST /api/billing/checkout and the deprecated
 * POST /api/billing/create-order, so both paths behave the same
 * (same plan resolver, coupons, rate limit and error handling).
 */
import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { nativeCheckoutBlock } from '@/lib/billing/native-checkout'
import { CheckoutError, PaymentService } from '@/lib/payment-service'
import { hasUserUsedCoupon } from '@/lib/db/billing'
import { rateLimitAIRedis } from '@/lib/upstash-rate-limit'
import { CONTACT_SALES_HREF, isValidPlanId, parseInterval } from '@/lib/billing-plan-mode'

export async function handleCheckoutRequest(req: NextRequest): Promise<NextResponse> {
  // CORE-038 / SEC-034: the store-rule block lives in the shared handler so
  // every checkout path (incl. the deprecated /api/billing/create-order) gets it.
  const blocked = nativeCheckoutBlock(req)
  if (blocked) return blocked as NextResponse
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
  const headerCountry = req.headers.get('cf-ipcountry') || req.headers.get('x-vercel-ip-country') || ''
  const country = typeof body.country === 'string' && /^[A-Za-z]{2}$/.test(body.country) ? body.country : /^[A-Za-z]{2}$/.test(headerCountry) ? headerCountry.toUpperCase() : null
  // INR for India, USD elsewhere, unless the buyer picked one (lib/billing/plan-prices.ts).
  const { currencyForBuyer } = await import('@/lib/billing/plan-prices')
  const currency = currencyForBuyer({ requested: body.currency, country })
  const { clientIpOrEmpty } = await import('@/lib/client-ip')
  const ip = clientIpOrEmpty(req)
  const { signalHash } = await import('@/lib/billing/referrals')
  const couponCode = typeof body.coupon_code === 'string' ? body.coupon_code.trim().slice(0, 64) : ''

  try {
    let couponId: string | undefined
    if (couponCode) {
      const { validateCoupon } = await import('@/lib/coupon-service')
      const validation = await validateCoupon(couponCode, { target: 'plans', currency })
      if (!validation.valid || !validation.coupon) {
        return NextResponse.json({ error: validation.error || 'Invalid coupon', code: 'coupon_invalid' }, { status: 400 })
      }
      if (await hasUserUsedCoupon(validation.coupon.id, user.id)) {
        return NextResponse.json({ error: 'You have already used this coupon code.', code: 'coupon_user_limit' }, { status: 400 })
      }
      couponId = validation.coupon.id
    }

    const result = await new PaymentService().createCheckout(user.id, user.email, planId, country, couponId, interval, {
      currency,
      // Salted hash only (referral abuse checks, lib/billing/referrals.ts).
      extras: ip ? { fields: { checkout_ip_hash: signalHash(ip) } } : undefined,
    })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof CheckoutError) {
      const status = error.code === 'unknown_plan' ? 404 : error.code.startsWith('coupon_') ? 400 : 409
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

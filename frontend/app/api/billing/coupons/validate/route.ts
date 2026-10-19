import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { validateCoupon } from '@/lib/coupon-service'
import { hasUserUsedCoupon } from '@/lib/db/billing'
import { rateLimitAIRedis } from '@/lib/upstash-rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const user = await getAPIUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const rateCheck = await rateLimitAIRedis(req, user.id)
    if (!rateCheck.ok) {
      return NextResponse.json({ error: `Rate limit. Try in ${rateCheck.retryAfterSec}s.` }, { status: 429 })
    }

    const { code, target, currency } = (await req.json().catch(() => ({}))) as { code?: unknown; target?: unknown; currency?: unknown }
    if (typeof code !== 'string' || !code.trim() || code.length > 64) {
      return NextResponse.json({ error: 'No coupon code provided' }, { status: 400 })
    }
    // Scope + currency are checked here for the preview and again at checkout (CORE-018).
    const result = await validateCoupon(code.trim(), {
      target: target === 'marketplace' ? 'marketplace' : 'plans',
      currency: typeof currency === 'string' && /^[A-Za-z]{3}$/.test(currency) ? currency.toUpperCase() : undefined,
    })
    if (!result.valid) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    if (result.coupon && await hasUserUsedCoupon(result.coupon.id, user.id)) {
      return NextResponse.json({ error: 'You have already used this coupon code.' }, { status: 400 })
    }

    // Whitelist: never return redemptions (other users' names/emails), usage
    // counts or admin fields (D2).
    const c = result.coupon!
    return NextResponse.json({ coupon: {
      code: c.code,
      discount_type: c.discount_type,
      discount_value: c.discount_value,
      currency: c.discount_type === 'flat' ? (c.currency || 'INR') : null,
      trial_duration_days: c.trial_duration_days ?? null,
      valid_until: c.valid_until ?? null,
    } })
  } catch (error) {
    console.error('[billing/coupons/validate]', error)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}

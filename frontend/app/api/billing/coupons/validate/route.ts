import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { validateCoupon } from '@/lib/coupon-service'
import { hasUserUsedCoupon } from '@/lib/db/billing'
import { rateLimitAI } from '@/lib/in-memory-rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const user = await getAPIUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const rateCheck = rateLimitAI(req, user.id)
    if (!rateCheck.ok) {
      return NextResponse.json({ error: `Rate limit. Try in ${rateCheck.retryAfterSec}s.` }, { status: 429 })
    }

    const { code } = await req.json()
    if (!code) {
      return NextResponse.json({ error: 'No coupon code provided' }, { status: 400 })
    }

    const result = await validateCoupon(code)
    if (!result.valid) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    if (result.coupon && await hasUserUsedCoupon(result.coupon.id, user.id)) {
      return NextResponse.json({ error: 'You have already used this coupon code.' }, { status: 400 })
    }

    return NextResponse.json({ coupon: {
      ...result.coupon,
      trial_duration_days: result.coupon?.trial_duration_days,
    } })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}

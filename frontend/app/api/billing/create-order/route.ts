import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { PaymentService } from '@/lib/payment-service'
import { hasUserUsedCoupon } from '@/lib/db/billing'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** @deprecated Use POST /api/billing/checkout instead */
export async function POST(req: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { plan_id, coupon_code } = (await req.json()) as { plan_id?: string; coupon_code?: string }
    const ps = new PaymentService()
    
    let validCouponId: string | undefined = undefined
    if (coupon_code) {
      const { validateCoupon } = await import('@/lib/coupon-service')
      const validation = await validateCoupon(coupon_code)
      if (!validation.valid || !validation.coupon) {
        return NextResponse.json({ error: validation.error || 'Invalid coupon' }, { status: 400 })
      }
      if (await hasUserUsedCoupon(validation.coupon.id, user.id)) {
        return NextResponse.json({ error: 'You have already used this coupon code.' }, { status: 400 })
      }
      validCouponId = validation.coupon.id
    }

    const result = await ps.createCheckout(user.id, user.email, plan_id || 'pro_monthly', null, validCouponId)
    
    // Coupon is already applied inside PaymentService.createCheckout
    
    return NextResponse.json(result)
  } catch (error) {
    const msg = (error as Error).message
    if (msg.includes('No payment provider configured')) {
      return NextResponse.json({ error: msg }, { status: 503 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

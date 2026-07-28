import { NextRequest, NextResponse } from 'next/server'
import { billingCoupons, nowIso } from '@/lib/db/billing'
import { requireAuth } from '@/lib/route-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = await req.json()
    const { code } = body
    if (!code) {
      return NextResponse.json({ error: 'Coupon code is required' }, { status: 400 })
    }

    const couponsCol = await billingCoupons()
    const coupon = await couponsCol.findOne({ code: code.toUpperCase() })

    if (!coupon) {
      return NextResponse.json({ error: 'Invalid coupon code' }, { status: 404 })
    }

    if (!coupon.active) {
      return NextResponse.json({ error: 'Coupon is inactive' }, { status: 400 })
    }

    if (coupon.valid_until && new Date(coupon.valid_until).getTime() < Date.now()) {
      return NextResponse.json({ error: 'Coupon has expired' }, { status: 400 })
    }

    if (coupon.max_uses > 0 && coupon.current_uses >= coupon.max_uses) {
      return NextResponse.json({ error: 'Coupon usage limit reached' }, { status: 400 })
    }

    return NextResponse.json({ 
      ok: true, 
      coupon: {
        code: coupon.code,
        discount_type: coupon.discount_type,
        discount_value: coupon.discount_value,
      } 
    })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { billingCoupons, newId, nowIso } from '@/lib/db/billing'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const user = await getAPIUser()
    if (!user || user.role !== 'superadmin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const couponsCol = await billingCoupons()
    const coupons = await couponsCol.find({}).sort({ created_at: -1 }).toArray()

    return NextResponse.json({ coupons })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAPIUser()
    if (!user || user.role !== 'superadmin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { code, discount_type, discount_value, max_uses, valid_until, trial_duration_days } = body

    if (!code || !discount_type || (discount_type !== 'trial' && discount_value === undefined)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const couponsCol = await billingCoupons()
    const existing = await couponsCol.findOne({ code: code.toUpperCase() })
    if (existing) {
      return NextResponse.json({ error: 'Coupon code already exists' }, { status: 400 })
    }

    const coupon = {
      id: newId(),
      code: code.toUpperCase(),
      discount_type,
      discount_value: discount_type === 'trial' ? 100 : Number(discount_value),
      max_uses: Number(max_uses) || 0,
      current_uses: 0,
      valid_until: valid_until ? new Date(valid_until).toISOString() : undefined,
      active: true,
      trial_duration_days: trial_duration_days ? Number(trial_duration_days) : undefined,
      created_by: user.id,
      created_at: nowIso(),
    }

    await couponsCol.insertOne(coupon)

    return NextResponse.json({ coupon })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}

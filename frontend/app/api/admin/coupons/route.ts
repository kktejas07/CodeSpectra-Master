import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { billingCoupons, newId, nowIso } from '@/lib/db/billing'
import { validateCouponInput } from '@/lib/billing-lifecycle'
import { auditAdmin } from '@/lib/admin-audit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/

export async function GET() {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    const coupons = await (await billingCoupons()).find({}, { projection: { _id: 0 } }).sort({ created_at: -1 }).toArray()
    return NextResponse.json({ coupons })
  } catch (error) {
    console.error('[admin/coupons]', error)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    const parsed = validateCouponInput(await req.json().catch(() => null), false)
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
    const v = parsed.value

    const couponsCol = await billingCoupons()
    if (await couponsCol.findOne({ code: v.code! })) {
      return NextResponse.json({ error: 'Coupon code already exists' }, { status: 400 })
    }
    const coupon = {
      id: newId(),
      code: v.code!,
      discount_type: v.discount_type!,
      discount_value: v.discount_value!,
      max_uses: v.max_uses ?? 0,
      current_uses: 0,
      valid_until: v.valid_until || undefined,
      active: true,
      trial_duration_days: v.trial_duration_days ?? undefined,
      created_by: gate.user.id,
      created_at: nowIso(),
    }
    await couponsCol.insertOne(coupon)
    await auditAdmin(gate.user, 'admin.coupon.create', 'coupon', `coupon/${coupon.id}`, `${coupon.code} ${coupon.discount_type} ${coupon.discount_value}`)
    return NextResponse.json({ coupon })
  } catch (error) {
    console.error('[admin/coupons]', error)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    const id = new URL(req.url).searchParams.get('id') || ''
    if (!ID_RE.test(id)) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const couponsCol = await billingCoupons()
    const existing = await couponsCol.findOne({ id })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const raw = ((await req.json().catch(() => ({}))) || {}) as Record<string, unknown>
    // Code is immutable; validate the rest against the effective type.
    delete raw.code
    if (raw.discount_type === undefined && raw.discount_value !== undefined) raw.discount_type = existing.discount_type
    const parsed = validateCouponInput(raw, true)
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
    const $set = parsed.value as Record<string, unknown>
    if (Object.keys($set).length === 0) return NextResponse.json({ error: 'nothing to update' }, { status: 400 })
    await couponsCol.updateOne({ id }, { $set })
    await auditAdmin(gate.user, 'admin.coupon.update', 'coupon', `coupon/${id}`, JSON.stringify($set))
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[admin/coupons]', error)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    const id = new URL(req.url).searchParams.get('id') || ''
    if (!ID_RE.test(id)) return NextResponse.json({ error: 'id required' }, { status: 400 })
    await (await billingCoupons()).deleteOne({ id })
    await auditAdmin(gate.user, 'admin.coupon.delete', 'coupon', `coupon/${id}`, undefined, 'warning')
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[admin/coupons]', error)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}

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
    const col = await billingCoupons()
    // CORE-018 one-time migration (idempotent): legacy flat coupons had no currency and were
    // applied in any currency. They were created in INR, so pin them to INR and tell the admin.
    const migrated = await col.updateMany(
      { discount_type: 'flat', currency: { $exists: false } } as never,
      { $set: { currency: 'INR', currency_migrated_at: nowIso() } },
    )
    if (migrated.modifiedCount > 0) {
      await auditAdmin(gate.user, 'admin.coupon.currency_migration', 'coupon', 'coupons', `${migrated.modifiedCount} flat coupons set to INR`)
    }
    const coupons = await col.find({}, { projection: { _id: 0 } }).sort({ created_at: -1 }).toArray()
    const needsReview = coupons.filter((c) => c.discount_type === 'flat' && c.currency_migrated_at).map((c) => c.code)
    return NextResponse.json({
      coupons,
      notices: needsReview.length
        ? [`${needsReview.length} fixed-amount coupon${needsReview.length === 1 ? '' : 's'} (${needsReview.slice(0, 10).join(', ')}${needsReview.length > 10 ? '…' : ''}) had no currency and now only apply to INR orders. Open each one, check the currency and save to confirm.`]
        : [],
    })
  } catch (error) {
    console.error('[admin/coupons]', error)
    return NextResponse.json({ error: 'Something went wrong. Please try again.', code: 'server_error' }, { status: 500 })
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
      ...(v.discount_type === 'flat' ? { currency: v.currency } : {}),
      applies_to: v.applies_to ?? 'all',
      marketplace_funding: v.marketplace_funding ?? 'platform_items_only',
      seller_id: null,
      created_by: gate.user.id,
      created_at: nowIso(),
    }
    await couponsCol.insertOne(coupon)
    await auditAdmin(gate.user, 'admin.coupon.create', 'coupon', `coupon/${coupon.id}`, `${coupon.code} ${coupon.discount_type} ${coupon.discount_value}`)
    return NextResponse.json({ coupon })
  } catch (error) {
    console.error('[admin/coupons]', error)
    return NextResponse.json({ error: 'Something went wrong. Please try again.', code: 'server_error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    const id = new URL(req.url).searchParams.get('id') || ''
    if (!ID_RE.test(id)) return NextResponse.json({ error: 'id required', code: 'id_required' }, { status: 400 })
    const couponsCol = await billingCoupons()
    const existing = await couponsCol.findOne({ id })
    if (!existing) return NextResponse.json({ error: 'Not found', code: 'not_found' }, { status: 404 })

    const raw = ((await req.json().catch(() => ({}))) || {}) as Record<string, unknown>
    // Code is immutable; validate the rest against the effective type.
    delete raw.code
    if (raw.discount_type === undefined && raw.discount_value !== undefined) raw.discount_type = existing.discount_type
    const parsed = validateCouponInput(raw, true)
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
    const $set = parsed.value as Record<string, unknown>
    if (Object.keys($set).length === 0) return NextResponse.json({ error: 'nothing to update', code: 'nothing_to_update' }, { status: 400 })
    const effectiveType = ($set.discount_type as string | undefined) ?? existing.discount_type
    if (effectiveType === 'flat' && !$set.currency && !existing.currency) {
      return NextResponse.json({ error: 'Choose the currency for a fixed-amount coupon' }, { status: 400 })
    }
    // Saving a currency confirms it (clears the migration notice).
    if ($set.currency) $set.currency_migrated_at = null
    await couponsCol.updateOne({ id }, { $set })
    await auditAdmin(gate.user, 'admin.coupon.update', 'coupon', `coupon/${id}`, JSON.stringify($set))
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[admin/coupons]', error)
    return NextResponse.json({ error: 'Something went wrong. Please try again.', code: 'server_error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    const id = new URL(req.url).searchParams.get('id') || ''
    if (!ID_RE.test(id)) return NextResponse.json({ error: 'id required', code: 'id_required' }, { status: 400 })
    await (await billingCoupons()).deleteOne({ id })
    await auditAdmin(gate.user, 'admin.coupon.delete', 'coupon', `coupon/${id}`, undefined, 'warning')
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[admin/coupons]', error)
    return NextResponse.json({ error: 'Something went wrong. Please try again.', code: 'server_error' }, { status: 500 })
  }
}

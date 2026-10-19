/**
 * Seller coupons (audit CORE-021) — a seller's own discount codes. They apply
 * only to that seller's items and the seller pays for them (lower earnings).
 *
 *   GET                 → this seller's coupons (+ the platform-promotions opt-in)
 *   POST  {code, discount_type: percentage|flat, discount_value, currency (flat), max_uses?, valid_until?}
 *   PATCH ?id=…         {discount_value?, max_uses?, valid_until?, active?, currency?}
 *   DELETE ?id=…
 *
 * Redeemer names/emails are never returned to sellers; only counts.
 */
import type { NextRequest } from 'next/server'
import { bodyOf, errorResponse, idOk, json, sellerGate } from '@/lib/marketplace/seller-api'
import { billingCoupons, newId, nowIso, type BillingCouponDoc } from '@/lib/db/billing'
import { validateCouponInput } from '@/lib/billing-lifecycle'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_COUPONS_PER_SELLER = 50

function view(c: BillingCouponDoc) {
  return {
    id: c.id, code: c.code, discount_type: c.discount_type, discount_value: c.discount_value,
    currency: c.discount_type === 'flat' ? (c.currency || 'INR') : null,
    max_uses: c.max_uses, current_uses: c.current_uses, valid_until: c.valid_until ?? null,
    active: c.active, created_at: c.created_at,
  }
}

export async function GET(req: NextRequest) {
  const g = await sellerGate(req)
  if ('res' in g) return g.res
  try {
    const rows = await (await billingCoupons()).find({ seller_id: g.seller.id } as never, { projection: { _id: 0, redemptions: 0 } }).sort({ created_at: -1 }).limit(200).toArray()
    return json({ coupons: rows.map(view), accepts_platform_coupons: !!g.seller.accepts_platform_coupons })
  } catch (e) {
    return errorResponse(e, 'seller coupons')
  }
}

export async function POST(req: NextRequest) {
  const g = await sellerGate(req, { approved: true, write: true })
  if ('res' in g) return g.res
  try {
    const raw = await bodyOf(req)
    if (raw.discount_type === 'trial') return json({ error: 'Free-trial codes are for plans only.' }, 400)
    const parsed = validateCouponInput({ ...raw, applies_to: 'marketplace', marketplace_funding: undefined }, false)
    if (!parsed.ok) return json({ error: parsed.error }, 400)
    const v = parsed.value
    const col = await billingCoupons()
    if (await col.countDocuments({ seller_id: g.seller.id } as never) >= MAX_COUPONS_PER_SELLER) {
      return json({ error: `You can have up to ${MAX_COUPONS_PER_SELLER} coupons. Delete old ones first.` }, 400)
    }
    if (await col.findOne({ code: v.code! })) return json({ error: 'That code is taken. Pick another one.' }, 400)
    const coupon: BillingCouponDoc = {
      id: newId(),
      code: v.code!,
      discount_type: v.discount_type!,
      discount_value: v.discount_value!,
      ...(v.discount_type === 'flat' ? { currency: v.currency } : {}),
      max_uses: v.max_uses ?? 0,
      current_uses: 0,
      ...(v.valid_until ? { valid_until: v.valid_until } : {}),
      active: true,
      applies_to: 'marketplace',
      seller_id: g.seller.id,
      created_by: g.user.id,
      created_at: nowIso(),
    }
    await col.insertOne(coupon)
    return json({ coupon: view(coupon) })
  } catch (e) {
    return errorResponse(e, 'seller coupons')
  }
}

export async function PATCH(req: NextRequest) {
  const g = await sellerGate(req, { approved: true, write: true })
  if ('res' in g) return g.res
  try {
    const id = new URL(req.url).searchParams.get('id')
    if (!idOk(id)) return json({ error: 'id required' }, 400)
    const col = await billingCoupons()
    const existing = await col.findOne({ id, seller_id: g.seller.id } as never)
    if (!existing) return json({ error: 'Not found' }, 404)
    const raw = await bodyOf(req)
    // Code, type, scope and owner never change.
    const patch: Record<string, unknown> = {}
    for (const k of ['discount_value', 'max_uses', 'valid_until', 'active', 'currency']) if (raw[k] !== undefined) patch[k] = raw[k]
    if (patch.discount_value !== undefined) patch.discount_type = existing.discount_type
    const parsed = validateCouponInput(patch, true)
    if (!parsed.ok) return json({ error: parsed.error }, 400)
    const $set = { ...parsed.value } as Record<string, unknown>
    delete $set.discount_type
    if (existing.discount_type !== 'flat') delete $set.currency
    if (!Object.keys($set).length) return json({ error: 'Nothing to update' }, 400)
    await col.updateOne({ id, seller_id: g.seller.id } as never, { $set })
    return json({ ok: true })
  } catch (e) {
    return errorResponse(e, 'seller coupons')
  }
}

export async function DELETE(req: NextRequest) {
  const g = await sellerGate(req, { write: true })
  if ('res' in g) return g.res
  try {
    const id = new URL(req.url).searchParams.get('id')
    if (!idOk(id)) return json({ error: 'id required' }, 400)
    const r = await (await billingCoupons()).deleteOne({ id, seller_id: g.seller.id } as never)
    return r.deletedCount ? json({ ok: true }) : json({ error: 'Not found' }, 404)
  } catch (e) {
    return errorResponse(e, 'seller coupons')
  }
}

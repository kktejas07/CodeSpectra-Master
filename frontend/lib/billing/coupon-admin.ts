/**
 * Create a platform coupon (server only) — shared by POST /api/admin/coupons and the
 * copilot's create_coupon proposal (AGT-033), so both validate and store it the same way.
 */
import 'server-only'
import { billingCoupons, newId, nowIso } from '@/lib/db/billing'
import { validateCouponInput } from '@/lib/billing-lifecycle'
import { validateCouponRestrictions } from '@/lib/billing/coupon-eligibility'

export type CouponCreateResult = { ok: true; coupon: Record<string, unknown> & { id: string; code: string } } | { ok: false; status: number; error: string }

/** Validate a coupon body without writing (copilot preview). */
export function checkCouponBody(body: Record<string, unknown>) {
  const parsed = validateCouponInput(body, false)
  if (!parsed.ok) return parsed
  const extra = validateCouponRestrictions(body)
  if (!extra.ok) return extra
  return { ok: true as const, value: parsed.value, extra: extra.value }
}

/** `opts.userId` binds the coupon to one person (system-issued personal codes; never from the admin form). */
export async function createCoupon(actorId: string, body: Record<string, unknown>, opts: { userId?: string } = {}): Promise<CouponCreateResult> {
  const checked = checkCouponBody(body)
  if (!checked.ok) return { ok: false, status: 400, error: checked.error }
  const v = checked.value
  const extra = checked.extra
  const couponsCol = await billingCoupons()
  if (await couponsCol.findOne({ code: v.code! })) return { ok: false, status: 400, error: 'Coupon code already exists' }
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
    per_user_limit: extra.per_user_limit ?? 1,
    plan_ids: extra.plan_ids ?? [],
    first_purchase_only: extra.first_purchase_only ?? false,
    starts_at: extra.starts_at ?? null,
    ...(opts.userId ? { user_id: opts.userId } : {}),
    created_by: actorId,
    created_at: nowIso(),
  }
  try {
    await couponsCol.insertOne(coupon as never)
  } catch (e) {
    if ((e as { code?: number }).code === 11000) return { ok: false, status: 400, error: 'Coupon code already exists' }
    throw e
  }
  return { ok: true, coupon }
}

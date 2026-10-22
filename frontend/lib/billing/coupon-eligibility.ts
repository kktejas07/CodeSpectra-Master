/**
 * Plan-checkout coupon restrictions (pure), on top of the scope / currency
 * rules in ./coupon-rules.ts:
 *   - active, started (starts_at) and not expired (valid_until)
 *   - max redemptions overall (max_uses, 0 = unlimited)
 *   - per-user limit (per_user_limit, default 1)
 *   - plan restriction (plan_ids: plan keys such as "pro"; empty = any plan)
 *   - first purchase only (the buyer has never paid for anything)
 */
import { normalizePlanKey } from '@/lib/entitlements-core'

export interface CouponRestrictions {
  active?: boolean | null
  starts_at?: string | null
  valid_until?: string | null
  max_uses?: number | null
  current_uses?: number | null
  per_user_limit?: number | null
  plan_ids?: string[] | null
  first_purchase_only?: boolean | null
}

export type CouponRefusal =
  | 'coupon_inactive'
  | 'coupon_not_started'
  | 'coupon_expired'
  | 'coupon_used_up'
  | 'coupon_user_limit'
  | 'coupon_wrong_plan'
  | 'coupon_first_purchase_only'

export const COUPON_REFUSAL_MESSAGES: Record<CouponRefusal, string> = {
  coupon_inactive: 'Invalid or inactive coupon code.',
  coupon_not_started: 'This coupon is not active yet.',
  coupon_expired: 'Coupon has expired.',
  coupon_used_up: 'Coupon usage limit reached.',
  coupon_user_limit: 'You have already used this coupon code.',
  coupon_wrong_plan: 'This coupon does not apply to this plan.',
  coupon_first_purchase_only: 'This coupon is only for your first purchase.',
}

export function perUserLimit(c: Pick<CouponRestrictions, 'per_user_limit'>): number {
  const n = Number(c.per_user_limit)
  return Number.isInteger(n) && n >= 1 && n <= 1000 ? n : 1
}

export function couponEligibility(
  c: CouponRestrictions,
  ctx: { planId: string; userRedemptions: number; hasPaidBefore: boolean; now?: Date },
): { ok: true } | { ok: false; code: CouponRefusal } {
  const now = (ctx.now ?? new Date()).getTime()
  if (c.active === false) return { ok: false, code: 'coupon_inactive' }
  if (c.starts_at && Date.parse(c.starts_at) > now) return { ok: false, code: 'coupon_not_started' }
  if (c.valid_until && Date.parse(c.valid_until) < now) return { ok: false, code: 'coupon_expired' }
  const max = Number(c.max_uses) || 0
  if (max > 0 && (Number(c.current_uses) || 0) >= max) return { ok: false, code: 'coupon_used_up' }
  if (ctx.userRedemptions >= perUserLimit(c)) return { ok: false, code: 'coupon_user_limit' }
  const plans = (c.plan_ids || []).map((p) => normalizePlanKey(p) ?? p).filter(Boolean)
  if (plans.length) {
    const key = normalizePlanKey(ctx.planId) ?? ctx.planId
    if (!plans.includes(key) && !plans.includes(ctx.planId)) return { ok: false, code: 'coupon_wrong_plan' }
  }
  if (c.first_purchase_only && ctx.hasPaidBefore) return { ok: false, code: 'coupon_first_purchase_only' }
  return { ok: true }
}

/** Validate the extra admin fields (create / patch). Returns whitelisted values or an error. */
export function validateCouponRestrictions(raw: Record<string, unknown>): { ok: true; value: Partial<CouponRestrictions> } | { ok: false; error: string } {
  const out: Partial<CouponRestrictions> = {}
  if (raw.per_user_limit !== undefined && raw.per_user_limit !== null && raw.per_user_limit !== '') {
    const n = Number(raw.per_user_limit)
    if (!Number.isInteger(n) || n < 1 || n > 1000) return { ok: false, error: 'Uses per person must be 1–1000' }
    out.per_user_limit = n
  }
  if (raw.plan_ids !== undefined) {
    if (!Array.isArray(raw.plan_ids) || raw.plan_ids.length > 20 || !raw.plan_ids.every((p) => typeof p === 'string' && /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(p))) {
      return { ok: false, error: 'Plans must be a list of plan ids' }
    }
    out.plan_ids = [...new Set((raw.plan_ids as string[]).map((p) => p.toLowerCase()))]
  }
  if (raw.first_purchase_only !== undefined) {
    if (typeof raw.first_purchase_only !== 'boolean') return { ok: false, error: 'first_purchase_only must be true or false' }
    out.first_purchase_only = raw.first_purchase_only
  }
  if (raw.starts_at !== undefined) {
    if (raw.starts_at === null || raw.starts_at === '') out.starts_at = null
    else {
      const t = Date.parse(String(raw.starts_at))
      if (!Number.isFinite(t)) return { ok: false, error: 'Start date must be a date' }
      out.starts_at = new Date(t).toISOString()
    }
  }
  return { ok: true, value: out }
}

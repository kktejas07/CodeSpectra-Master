/**
 * Pure subscription lifecycle rules (trial windows, trial expiry, cancel at
 * period end). No DB imports so they can be unit tested.
 */

export interface CouponLike {
  discount_type?: string | null
  trial_duration_days?: number | null
}

export interface LifecycleSub {
  status?: string | null
  ends_at?: string | null
  trial_ends_at?: string | null
  trial_order_id?: string | null
  last_order_id?: string | null
  cancel_at_period_end?: boolean | null
}

const MAX_TRIAL_DAYS = 365

/** Days a trial coupon funds, or null when the coupon is not a valid trial. */
export function trialDaysForCoupon(coupon: CouponLike | null | undefined): number | null {
  if (!coupon || coupon.discount_type !== 'trial') return null
  const d = Number(coupon.trial_duration_days)
  if (!Number.isInteger(d) || d < 1 || d > MAX_TRIAL_DAYS) return null
  return d
}

/**
 * The trial-expiry job may only end a subscription whose current period was
 * funded by the trial order itself. Any later paid order (which clears the
 * trial marker, and moves last_order_id) keeps the paid period.
 */
export function shouldExpireTrial(sub: LifecycleSub, now: Date = new Date()): boolean {
  if (sub.status !== 'active' || !sub.trial_ends_at) return false
  const t = Date.parse(sub.trial_ends_at)
  if (!Number.isFinite(t) || t > now.getTime()) return false
  if (!sub.trial_order_id) return false // legacy marker without an owner: never kill a period on it
  return sub.last_order_id === sub.trial_order_id
}

/** Whether the user still has the plan right now (cancel keeps access until ends_at). */
export function hasAccess(sub: LifecycleSub | null | undefined, now: Date = new Date()): boolean {
  if (!sub || sub.status !== 'active' || !sub.ends_at) return false
  const end = Date.parse(sub.ends_at)
  return Number.isFinite(end) && end > now.getTime()
}

/** Status shown to the user: 'cancelling' = cancelled, access until period end. */
export function displayStatus(sub: LifecycleSub | null | undefined, now: Date = new Date()): 'active' | 'cancelling' | 'ended' {
  if (!hasAccess(sub, now)) return 'ended'
  return sub!.cancel_at_period_end ? 'cancelling' : 'active'
}

export type CouponInput = {
  code?: string
  discount_type?: 'percentage' | 'flat' | 'trial'
  discount_value?: number
  max_uses?: number
  valid_until?: string | null
  trial_duration_days?: number | null
  active?: boolean
}

/**
 * Validate an admin coupon create (partial=false) or patch (partial=true).
 * Returns the whitelisted fields or an error message (D20).
 */
export function validateCouponInput(raw: unknown, partial: boolean): { ok: true; value: CouponInput } | { ok: false; error: string } {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const out: CouponInput = {}
  if (!partial || b.code !== undefined) {
    const code = typeof b.code === 'string' ? b.code.trim().toUpperCase() : ''
    if (!/^[A-Z0-9_-]{3,32}$/.test(code)) return { ok: false, error: 'Code must be 3–32 letters, numbers, _ or -' }
    out.code = code
  }
  const type = b.discount_type
  if (!partial || type !== undefined) {
    if (type !== 'percentage' && type !== 'flat' && type !== 'trial') return { ok: false, error: 'Discount type must be percentage, flat or trial' }
    out.discount_type = type
  }
  if (out.discount_type === 'trial') {
    out.discount_value = 100
  } else if (!partial || b.discount_value !== undefined) {
    const v = Number(b.discount_value)
    if (!Number.isFinite(v) || v <= 0) return { ok: false, error: 'Discount value must be greater than 0' }
    if ((out.discount_type ?? 'percentage') === 'percentage' && v > 100) return { ok: false, error: 'A percentage discount cannot exceed 100' }
    if (v > 1_000_000) return { ok: false, error: 'Discount value is too large' }
    out.discount_value = v
  }
  if (!partial || b.max_uses !== undefined) {
    const m = b.max_uses === undefined || b.max_uses === null || b.max_uses === '' ? 0 : Number(b.max_uses)
    if (!Number.isInteger(m) || m < 0 || m > 1_000_000) return { ok: false, error: 'Max uses must be a whole number (0 = unlimited)' }
    out.max_uses = m
  }
  if (b.valid_until !== undefined) {
    if (b.valid_until === null || b.valid_until === '') out.valid_until = null
    else {
      const t = Date.parse(String(b.valid_until))
      if (!Number.isFinite(t)) return { ok: false, error: 'Valid until must be a date' }
      out.valid_until = new Date(t).toISOString()
    }
  }
  if (out.discount_type === 'trial' || b.trial_duration_days !== undefined) {
    const d = b.trial_duration_days === undefined || b.trial_duration_days === null || b.trial_duration_days === '' ? null : Number(b.trial_duration_days)
    if (out.discount_type === 'trial' && (d === null || !Number.isInteger(d) || d < 1 || d > 365)) {
      return { ok: false, error: 'Trial length must be 1–365 days' }
    }
    if (d !== null && (!Number.isInteger(d) || d < 1 || d > 365)) return { ok: false, error: 'Trial length must be 1–365 days' }
    out.trial_duration_days = d
  }
  if (b.active !== undefined) {
    if (typeof b.active !== 'boolean') return { ok: false, error: 'active must be true or false' }
    out.active = b.active
  }
  return { ok: true, value: out }
}

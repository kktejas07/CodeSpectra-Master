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
  /** Flat coupons only (CORE-018). */
  currency?: 'INR' | 'USD'
  applies_to?: 'all' | 'plans' | 'marketplace'
  marketplace_funding?: 'platform_items_only' | 'platform_funded'
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
  // CORE-018: a fixed amount means nothing without its currency.
  if (b.currency !== undefined && b.currency !== null && b.currency !== '') {
    if (b.currency !== 'INR' && b.currency !== 'USD') return { ok: false, error: 'Currency must be INR or USD' }
    out.currency = b.currency
  }
  if (!partial && out.discount_type === 'flat' && !out.currency) {
    return { ok: false, error: 'Choose the currency for a fixed-amount coupon' }
  }
  if (b.applies_to !== undefined) {
    if (b.applies_to !== 'all' && b.applies_to !== 'plans' && b.applies_to !== 'marketplace') return { ok: false, error: 'Applies to must be all, plans or marketplace' }
    out.applies_to = b.applies_to
  }
  if (b.marketplace_funding !== undefined) {
    if (b.marketplace_funding !== 'platform_items_only' && b.marketplace_funding !== 'platform_funded') return { ok: false, error: 'Marketplace funding must be platform_items_only or platform_funded' }
    out.marketplace_funding = b.marketplace_funding
  }
  return { ok: true, value: out }
}

// ─── Stripe auto-renewal (pure rules) ───────────────────────────────────────

/** Days a past-due Stripe subscription keeps access after a failed renewal. */
export function graceDays(raw: string | undefined = process.env.BILLING_GRACE_DAYS): number {
  const n = Number(raw)
  return Number.isInteger(n) && n >= 0 && n <= 30 ? n : 7
}

/**
 * Access end after a failed renewal: `days` from the failure, never earlier
 * than the period already paid for. An existing grace window is never pushed
 * out by a later failure (Stripe retries several times).
 */
export function graceEndsAt(input: { failedAt: Date; endsAt?: string | null; currentGraceEndsAt?: string | null; days: number }): string {
  const existing = input.currentGraceEndsAt ? Date.parse(input.currentGraceEndsAt) : NaN
  if (Number.isFinite(existing)) {
    const paid = input.endsAt ? Date.parse(input.endsAt) : NaN
    return new Date(Math.max(existing, Number.isFinite(paid) ? paid : 0)).toISOString()
  }
  const grace = input.failedAt.getTime() + input.days * 86_400_000
  const paid = input.endsAt ? Date.parse(input.endsAt) : NaN
  return new Date(Math.max(grace, Number.isFinite(paid) ? paid : 0)).toISOString()
}

export type StripeSubOutcome = 'active' | 'past_due' | 'ended' | 'pending'

/** What a Stripe subscription status means for access here. */
export function stripeSubOutcome(status: string | null | undefined): StripeSubOutcome {
  switch (status) {
    case 'active':
    case 'trialing':
      return 'active'
    case 'past_due':
      return 'past_due'
    case 'canceled':
    case 'unpaid':
    case 'incomplete_expired':
      return 'ended'
    default:
      return 'pending' // incomplete / paused: the first payment or a resume decides
  }
}

/** A past-due subscription whose grace window has run out (the sweep downgrades it). */
export function graceExpired(sub: { status?: string | null; past_due?: boolean | null; grace_ends_at?: string | null }, now: Date = new Date()): boolean {
  if (sub.status !== 'active' || !sub.past_due || !sub.grace_ends_at) return false
  const t = Date.parse(sub.grace_ends_at)
  return Number.isFinite(t) && t <= now.getTime()
}

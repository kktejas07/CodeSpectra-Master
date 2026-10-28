import { describe, it, expect } from 'vitest'
import { currenciesOf, currencyForBuyer, parsePlanPrices, priceFor, yearlySavingsPct } from '@/lib/billing/plan-prices'
import { prorationQuote } from '@/lib/billing/proration'
import { canTransition, nextSubState, stateHasAccess, subState } from '@/lib/billing/subscription-state'
import { financialYear, formatInvoiceNumber, gstBreakdown, isValidGstin } from '@/lib/billing/gst'
import { couponEligibility, perUserLimit, validateCouponRestrictions } from '@/lib/billing/coupon-eligibility'
import { decideReferralReward, paymentFingerprintSource, referralAbuse, rewardDueAt } from '@/lib/billing/referral-reward'
import { monthlyValue, revenueMetrics, type MetricSub } from '@/lib/billing/metrics'
import { domainMatches, licenceAmount, licenceLive, parseSeatEmails, planSeatAssignment, renewalEnd, seatsFree } from '@/lib/billing/licence-rules'
import { decideEntitlement } from '@/lib/billing/entitlement-features'
import { memberDiscountSplit } from '@/lib/billing/member-discount'
import { mergePlanDefinition, pickEffectivePlanKey } from '@/lib/entitlements-core'

const NOW = new Date('2026-10-23T06:00:00.000Z')
const DAY = 86_400_000
const iso = (ms: number) => new Date(ms).toISOString()

describe('plan prices (minor units, per currency)', () => {
  it('validates and drops empty / zero prices', () => {
    const r = parsePlanPrices({ INR: { month: 49900, year: 499000 }, USD: { month: 0, year: null } })
    expect(r).toEqual({ ok: true, prices: { INR: { month: 49900, year: 499000 } } })
    expect(parsePlanPrices({ INR: { month: 499.5 } }).ok).toBe(false)
    expect(parsePlanPrices({ EUR: { month: 100 } }).ok).toBe(false)
    expect(parsePlanPrices({ INR: { month: -1 } }).ok).toBe(false)
  })
  it('looks up a price, lists currencies, computes the yearly saving', () => {
    const p = { INR: { month: 49900, year: 499000 }, USD: { month: 900 } }
    expect(priceFor(p, 'INR', 'year')).toBe(499000)
    expect(priceFor(p, 'USD', 'year')).toBeNull()
    expect(priceFor(p, 'EUR', 'month')).toBeNull()
    expect(currenciesOf(p)).toEqual(['INR', 'USD'])
    expect(yearlySavingsPct(p, 'INR')).toBe(17)
    expect(yearlySavingsPct(p, 'USD')).toBe(0)
  })
  it('India pays in INR, everyone else in USD, an explicit choice wins', () => {
    expect(currencyForBuyer({ country: 'IN' })).toBe('INR')
    expect(currencyForBuyer({ country: 'us' })).toBe('USD')
    expect(currencyForBuyer({ country: 'IN', requested: 'USD' })).toBe('USD')
    expect(currencyForBuyer({ requested: 'EUR', fallback: 'INR' })).toBe('INR')
  })
})

describe('proration', () => {
  const base = { currentStart: iso(NOW.getTime() - 10 * DAY), currentEnd: iso(NOW.getTime() + 20 * DAY), currentInterval: 'month' as const, currentCurrency: 'INR', newCurrency: 'INR', now: NOW }
  it('same-cycle upgrade pays the difference for the time left and keeps the end date', () => {
    const q = prorationQuote({ ...base, currentAmount: 30000, newAmount: 60000, newInterval: 'month' })
    expect(q).toMatchObject({ ok: true, kind: 'upgrade_same_cycle', chargeNow: 20000, credit: 0, periodEnd: base.currentEnd })
  })
  it('monthly → yearly credits the unused month against a new year', () => {
    const q = prorationQuote({ ...base, currentAmount: 30000, newAmount: 300000, newInterval: 'year' })
    expect(q.ok && q.kind).toBe('new_period_with_credit')
    if (q.ok) {
      expect(q.credit).toBe(20000)
      expect(q.chargeNow).toBe(280000)
      expect(Date.parse(q.periodEnd)).toBe(NOW.getTime() + 365 * DAY)
    }
  })
  it('downgrades (cheaper plan, or year → month) wait for renewal; same plan is no change', () => {
    expect(prorationQuote({ ...base, currentAmount: 60000, newAmount: 30000, newInterval: 'month' })).toMatchObject({ kind: 'downgrade_at_renewal', chargeNow: 0 })
    expect(prorationQuote({ ...base, currentInterval: 'year', currentAmount: 300000, newAmount: 30000, newInterval: 'month' })).toMatchObject({ kind: 'downgrade_at_renewal' })
    expect(prorationQuote({ ...base, currentAmount: 30000, newAmount: 30000, newInterval: 'month', samePlan: true })).toMatchObject({ kind: 'no_change' })
  })
  it('refuses currency changes, ended periods and bad input', () => {
    expect(prorationQuote({ ...base, newCurrency: 'USD', currentAmount: 30000, newAmount: 900, newInterval: 'month' })).toEqual({ ok: false, reason: 'currency_mismatch' })
    expect(prorationQuote({ ...base, currentEnd: iso(NOW.getTime() - 1), currentAmount: 1, newAmount: 2, newInterval: 'month' })).toEqual({ ok: false, reason: 'period_over' })
    expect(prorationQuote({ ...base, currentAmount: 1.5, newAmount: 2, newInterval: 'month' })).toEqual({ ok: false, reason: 'invalid' })
  })
  it('a free / trial period gives no credit', () => {
    const q = prorationQuote({ ...base, currentAmount: 0, newAmount: 300000, newInterval: 'year' })
    expect(q).toMatchObject({ credit: 0, chargeNow: 300000 })
  })
})

describe('subscription state machine', () => {
  const live = { status: 'active', ends_at: iso(NOW.getTime() + DAY) }
  it('maps stored rows to states', () => {
    expect(subState(null, NOW)).toBe('expired')
    expect(subState(live, NOW)).toBe('active')
    expect(subState({ ...live, past_due: true }, NOW)).toBe('past_due')
    expect(subState({ ...live, cancel_at_period_end: true }, NOW)).toBe('cancelled')
    expect(subState({ ...live, trial_ends_at: live.ends_at, trial_order_id: 'o1', last_order_id: 'o1' }, NOW)).toBe('trialing')
    expect(subState({ ...live, trial_ends_at: live.ends_at, trial_order_id: 'o1', last_order_id: 'o2' }, NOW)).toBe('active')
    expect(subState({ status: 'active', ends_at: iso(NOW.getTime() - 1) }, NOW)).toBe('expired')
  })
  it('allows only valid transitions (replays are ignored)', () => {
    expect(nextSubState('active', 'payment_failed')).toBe('past_due')
    expect(nextSubState('past_due', 'payment_succeeded')).toBe('active')
    expect(nextSubState('past_due', 'grace_expired')).toBe('expired')
    expect(nextSubState('cancelled', 'resume')).toBe('active')
    expect(nextSubState('trialing', 'payment_succeeded')).toBe('active')
    expect(canTransition('expired', 'resume')).toBe(false)
    expect(canTransition('active', 'resume')).toBe(false)
    expect(stateHasAccess('past_due')).toBe(true)
    expect(stateHasAccess('expired')).toBe(false)
  })
})

describe('GST invoices', () => {
  it('financial year runs April → March in IST', () => {
    expect(financialYear('2026-10-23T00:00:00Z')).toBe('2026-27')
    expect(financialYear('2027-03-31T18:00:00Z')).toBe('2026-27')
    expect(financialYear('2027-03-31T19:00:00Z')).toBe('2027-28') // 00:30 IST on 1 April
    expect(financialYear('2027-01-05T00:00:00Z')).toBe('2026-27')
  })
  it('formats sequential invoice numbers', () => {
    expect(formatInvoiceNumber('cs', '2026-27', 42)).toBe('CS/2627/000042')
    expect(formatInvoiceNumber('', '2026-27', 0)).toBe('CS/2627/000001')
    expect(formatInvoiceNumber('ABCDE', '2026-27', 999999).length).toBeLessThanOrEqual(16)
  })
  it('checks GSTIN format, state and check digit', () => {
    expect(isValidGstin('27AAPFU0939F1ZV')).toBe(true)
    expect(isValidGstin('27aapfu0939f1zv')).toBe(true)
    expect(isValidGstin('27AAPFU0939F1ZW')).toBe(false)
    expect(isValidGstin('99AAPFU0939F1ZV')).toBe(false)
    expect(isValidGstin('ABC')).toBe(false)
  })
  it('splits an inclusive amount into CGST+SGST in-state, IGST across states, none for exports', () => {
    const intra = gstBreakdown({ amount: 49900, currency: 'INR', supplierState: '36', buyerState: '36' })
    expect(intra).toMatchObject({ kind: 'intra_state', taxable: 42288, cgst: 3806, sgst: 3806, igst: 0 })
    expect(intra.taxable + intra.cgst + intra.sgst).toBe(49900)
    const inter = gstBreakdown({ amount: 49900, currency: 'INR', supplierState: '36', buyerGstin: '27AAPFU0939F1ZV' })
    expect(inter).toMatchObject({ kind: 'inter_state', placeOfSupply: '27', igst: 7612 })
    expect(inter.taxable + inter.igst).toBe(49900)
    expect(gstBreakdown({ amount: 900, currency: 'USD', supplierState: '36' })).toMatchObject({ kind: 'export', taxable: 900, igst: 0 })
    expect(gstBreakdown({ amount: 49900, currency: 'INR', supplierState: '36', buyerCountry: 'AE' }).kind).toBe('export')
    // No buyer state: place of supply defaults to the supplier's state.
    expect(gstBreakdown({ amount: 100, currency: 'INR', supplierState: '36' }).kind).toBe('intra_state')
  })
})

describe('coupon restrictions', () => {
  const ctx = { planId: 'pro_monthly', userRedemptions: 0, hasPaidBefore: false, now: NOW }
  it('accepts a plain coupon', () => {
    expect(couponEligibility({ active: true }, ctx)).toEqual({ ok: true })
  })
  it('refuses inactive, not started, expired and used-up coupons', () => {
    expect(couponEligibility({ active: false }, ctx)).toEqual({ ok: false, code: 'coupon_inactive' })
    expect(couponEligibility({ starts_at: iso(NOW.getTime() + DAY) }, ctx)).toEqual({ ok: false, code: 'coupon_not_started' })
    expect(couponEligibility({ valid_until: iso(NOW.getTime() - DAY) }, ctx)).toEqual({ ok: false, code: 'coupon_expired' })
    expect(couponEligibility({ max_uses: 5, current_uses: 5 }, ctx)).toEqual({ ok: false, code: 'coupon_used_up' })
    expect(couponEligibility({ max_uses: 0, current_uses: 500 }, ctx)).toEqual({ ok: true })
  })
  it('per-person limit defaults to 1', () => {
    expect(perUserLimit({})).toBe(1)
    expect(couponEligibility({}, { ...ctx, userRedemptions: 1 })).toEqual({ ok: false, code: 'coupon_user_limit' })
    expect(couponEligibility({ per_user_limit: 3 }, { ...ctx, userRedemptions: 2 })).toEqual({ ok: true })
  })
  it('plan restrictions match legacy ids to plan keys', () => {
    expect(couponEligibility({ plan_ids: ['pro'] }, ctx)).toEqual({ ok: true })
    expect(couponEligibility({ plan_ids: ['enterprise'] }, ctx)).toEqual({ ok: false, code: 'coupon_wrong_plan' })
  })
  it('first-purchase-only', () => {
    expect(couponEligibility({ first_purchase_only: true }, { ...ctx, hasPaidBefore: true })).toEqual({ ok: false, code: 'coupon_first_purchase_only' })
  })
  it('validates the admin fields', () => {
    expect(validateCouponRestrictions({ per_user_limit: 2, plan_ids: ['Pro'], first_purchase_only: true })).toEqual({ ok: true, value: { per_user_limit: 2, plan_ids: ['pro'], first_purchase_only: true } })
    expect(validateCouponRestrictions({ per_user_limit: 0 }).ok).toBe(false)
    expect(validateCouponRestrictions({ plan_ids: ['bad id'] }).ok).toBe(false)
  })
})

describe('referral rewards', () => {
  const settings = { yearly_cap: 2 }
  const due = rewardDueAt('2026-09-01T00:00:00Z')
  it('is due 30 days after the first paid period starts (or at its end if sooner)', () => {
    expect(due).toBe('2026-10-01T00:00:00.000Z')
    expect(rewardDueAt('2026-09-01T00:00:00Z', '2026-09-15T00:00:00Z')).toBe('2026-09-15T00:00:00.000Z')
  })
  it('grants after the first paid month; waits before; voids on refund, lapse, cap', () => {
    const b = { dueAt: due, now: NOW, orderStatus: 'paid', refereePlanLive: true, abuse: null, rewardsThisYear: 0, settings }
    expect(decideReferralReward(b)).toBe('grant')
    expect(decideReferralReward({ ...b, now: new Date('2026-09-20T00:00:00Z') })).toBe('wait')
    expect(decideReferralReward({ ...b, orderStatus: 'refunded' })).toBe('void_refunded')
    expect(decideReferralReward({ ...b, refereePlanLive: false })).toBe('void_lapsed')
    expect(decideReferralReward({ ...b, rewardsThisYear: 2 })).toBe('void_cap')
    // CORE-037: a shared IP alone (campus Wi-Fi) goes to admin review; device / payment still void.
    expect(decideReferralReward({ ...b, abuse: 'same_ip' })).toBe('review')
    expect(decideReferralReward({ ...b, abuse: 'same_device' })).toBe('void_abuse')
    expect(decideReferralReward({ ...b, abuse: 'same_payment' })).toBe('void_abuse')
    expect(decideReferralReward({ ...b, abuse: 'same_ip', rewardsThisYear: 2 })).toBe('void_cap')
    expect(decideReferralReward({ ...b, abuse: 'same_ip', now: new Date('2026-09-20T00:00:00Z') })).toBe('wait')
  })
  it('abuse checks: same device, payment instrument or IP', () => {
    const none = { deviceIds: [], ips: [], paymentFingerprints: [] }
    expect(referralAbuse({ referrer: { ...none, deviceIds: ['d1'] }, referee: { ...none, deviceIds: ['d1'] } })).toBe('same_device')
    expect(referralAbuse({ referrer: { ...none, paymentFingerprints: ['p'] }, referee: { ...none, paymentFingerprints: ['p'] } })).toBe('same_payment')
    expect(referralAbuse({ referrer: { ...none, ips: ['h'] }, referee: { ...none, ips: ['h'] } })).toBe('same_ip')
    expect(referralAbuse({ referrer: { ...none, ips: [''] }, referee: { ...none, ips: [''] } })).toBeNull()
  })
  it('payment fingerprint sources', () => {
    expect(paymentFingerprintSource({ card: { fingerprint: 'fp1' } })).toBe('card:fp1')
    expect(paymentFingerprintSource({ vpa: 'A@okhdfc' })).toBe('vpa:a@okhdfc')
    expect(paymentFingerprintSource({ method: 'netbanking' })).toBeNull()
  })
})

describe('revenue metrics', () => {
  const sub = (id: string, start: number, end: number, amount: number, interval: 'month' | 'year' = 'month', currency = 'INR'): MetricSub =>
    ({ id, status: 'active', started_at: iso(NOW.getTime() + start * DAY), ends_at: iso(NOW.getTime() + end * DAY), amount_minor: amount, currency, interval })
  it('MRR normalises yearly plans; ARR = 12 × MRR; trials and free rows are ignored', () => {
    const m = revenueMetrics([sub('a', -5, 25, 49900), sub('b', -100, 265, 480000, 'year'), { ...sub('t', -1, 6, 49900), trial: true }, sub('z', -1, 29, 0)], NOW)
    expect(m).toHaveLength(1)
    expect(m[0]).toMatchObject({ currency: 'INR', mrr: 49900 + 40000, arr: (49900 + 40000) * 12, activeSubscriptions: 2 })
    expect(monthlyValue({ amount_minor: 1200, interval: 'year' })).toBe(100)
  })
  it('churn over the window, per currency', () => {
    const m = revenueMetrics([sub('a', -40, -5, 1000), sub('b', -40, 20, 1000), sub('c', -40, 20, 1000), sub('u', -40, 20, 900, 'month', 'USD')], NOW, 30)
    const inr = m.find((x) => x.currency === 'INR')!
    expect(inr).toMatchObject({ startSubscriptions: 3, churnedSubscriptions: 1, logoChurnPct: 33.33, revenueChurnPct: 33.33, mrr: 2000 })
    expect(m.find((x) => x.currency === 'USD')!.logoChurnPct).toBe(0)
  })
  it('a renewal (same id, new row) is not churn', () => {
    const m = revenueMetrics([sub('a', -40, -5, 1000), sub('a', -5, 25, 1000)], NOW, 30)
    expect(m[0].churnedSubscriptions).toBe(0)
  })
})

describe('licences', () => {
  const lic = { status: 'active', starts_at: iso(NOW.getTime() - DAY), ends_at: iso(NOW.getTime() + DAY), seats: 10, seats_used: 7 }
  it('liveness, free seats, price', () => {
    expect(licenceLive(lic, NOW)).toBe(true)
    expect(licenceLive({ ...lic, ends_at: iso(NOW.getTime() - 1) }, NOW)).toBe(false)
    expect(licenceLive({ ...lic, status: 'pending' }, NOW)).toBe(false)
    expect(seatsFree(lic)).toBe(3)
    expect(licenceAmount(50, 299900)).toBe(14_995_000)
    expect(licenceAmount(0, 100)).toBe(0)
  })
  it('parses CSV / pasted emails, skipping a header and reporting bad rows', () => {
    const r = parseSeatEmails('email,name\nA@x.edu,Ann\nb@x.edu\nnot-an-email\n\n"c@x.edu";C\na@x.edu')
    expect(r.emails).toEqual(['a@x.edu', 'b@x.edu', 'c@x.edu'])
    expect(r.invalid).toEqual([4])
  })
  it('assigns within free seats and skips existing holders', () => {
    expect(planSeatAssignment(['a', 'b', 'c', 'd'], new Set(['b']), 2)).toEqual({ assign: ['a', 'c'], skipped: ['b'], overLimit: ['d'] })
  })
  it('domain rule covers sub-domains only on a dot boundary', () => {
    expect(domainMatches('x@students.vnr.edu.in', ['vnr.edu.in'])).toBe(true)
    expect(domainMatches('x@vnr.edu.in', ['vnr.edu.in'])).toBe(true)
    expect(domainMatches('x@evilvnr.edu.in', ['vnr.edu.in'])).toBe(false)
  })
  it('renewal adds a year to the later of now and the current end', () => {
    expect(renewalEnd(iso(NOW.getTime() + 10 * DAY), NOW)).toEqual({ stillLive: true, end: iso(NOW.getTime() + 375 * DAY) })
    expect(renewalEnd(iso(NOW.getTime() - 10 * DAY), NOW)).toEqual({ stillLive: false, end: iso(NOW.getTime() + 365 * DAY) })
  })
})

describe('entitlements', () => {
  const free = mergePlanDefinition('free', null)
  const pro = mergePlanDefinition('pro', null)
  it('built-in defaults per plan', () => {
    expect(decideEntitlement(free, 'company_tests_tough')).toMatchObject({ allowed: false })
    expect(decideEntitlement(pro, 'company_tests_tough')).toMatchObject({ allowed: true })
    expect(decideEntitlement(free, 'interview_sim_sessions_per_day')).toMatchObject({ allowed: true, limit: 1 })
    expect(decideEntitlement(pro, 'interview_sim_sessions_per_day').limit).toBe(5)
    expect(decideEntitlement(mergePlanDefinition('enterprise', null), 'interview_sim_sessions_per_day').limit).toBe(Infinity)
    expect(decideEntitlement(free, 'mentor_discount_pct')).toMatchObject({ allowed: false, limit: 0 })
    expect(decideEntitlement(pro, 'cert_discount_pct').limit).toBe(20)
  })
  it('admin-edited plan features win; percentages cap at 100; unknown plans deny', () => {
    const edited = { ...pro, features: [...pro.features, { key: 'mentor_discount_pct', label: '', description: '', enabled: true, limit: 150, type: 'count' as const }, { key: 'offline_packs', label: '', description: '', enabled: false, type: 'boolean' as const }] }
    expect(decideEntitlement(edited, 'mentor_discount_pct').limit).toBe(100)
    expect(decideEntitlement(edited, 'offline_packs').allowed).toBe(false)
    expect(decideEntitlement(mergePlanDefinition('custom_x', null), 'offline_packs').allowed).toBe(false)
  })
  it('superadmin is never gated', () => {
    expect(decideEntitlement(free, 'offline_packs', { superadmin: true })).toMatchObject({ allowed: true })
  })
  it('a licence seat grants Pro unless the user already has a higher plan', () => {
    const now = NOW
    const live = { plan_id: 'enterprise', status: 'active', ends_at: iso(NOW.getTime() + DAY) }
    expect(pickEffectivePlanKey({ licencePlan: 'pro', now })).toEqual({ key: 'pro', source: 'licence' })
    expect(pickEffectivePlanKey({ subscription: live, licencePlan: 'pro', now })).toEqual({ key: 'enterprise', source: 'subscription' })
    expect(pickEffectivePlanKey({ subscription: { ...live, plan_id: 'pro' }, licencePlan: 'pro', now })).toEqual({ key: 'pro', source: 'subscription' })
    expect(pickEffectivePlanKey({ userPlan: 'enterprise', licencePlan: 'pro', now })).toEqual({ key: 'enterprise', source: 'override' })
  })
})

describe('member discounts (marketplace)', () => {
  it('discounts mentor sessions and certification items only, platform-funded', () => {
    const r = memberDiscountSplit(
      [{ category: 'mentoring', gross: 100000 }, { category: 'books', gross: 50000 }, { category: 'courses', tags: ['certification'], gross: 20000 }],
      { mentor: 10, cert: 20 },
    )
    expect(r).toEqual({ amount: 10000 + 4000, eligible: [true, false, true], platformFunded: [true, false, true] })
  })
  it('nothing to discount → null', () => {
    expect(memberDiscountSplit([{ category: 'books', gross: 100 }], { mentor: 10, cert: 0 })).toBeNull()
    expect(memberDiscountSplit([{ category: 'mentoring', gross: 100 }], { mentor: 0, cert: 0 })).toBeNull()
  })
})

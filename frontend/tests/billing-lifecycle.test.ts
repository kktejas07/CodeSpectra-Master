import { describe, it, expect, vi } from 'vitest'
import { parsePlanPrice, planCheckoutMode } from '@/lib/billing-plan-mode'
import {
  trialDaysForCoupon,
  shouldExpireTrial,
  hasAccess,
  displayStatus,
  validateCouponInput,
} from '@/lib/billing-lifecycle'
import { resolveInviteRole, decideAccept } from '@/lib/org-invitations-core'

vi.mock('@/lib/db/billing', () => ({ billingCoupons: vi.fn(), billingSubscriptions: vi.fn() }))

const NOW = new Date('2026-10-18T12:00:00.000Z')

describe('price parsing (display = charge)', () => {
  it('strips thousands separators and currency text', () => {
    expect(parsePlanPrice('1,499')).toBe(1499)
    expect(parsePlanPrice('₹1,499/month')).toBe(1499)
    expect(parsePlanPrice('$29.99/mo')).toBe(29.99)
    expect(parsePlanPrice('Rs. 499')).toBe(499)
    expect(parsePlanPrice(49)).toBe(49)
  })
  it('free and non-numeric prices', () => {
    expect(parsePlanPrice('Free')).toBe(0)
    expect(parsePlanPrice('')).toBe(0)
    expect(parsePlanPrice('Contact us')).toBeNull()
    expect(parsePlanPrice(NaN)).toBeNull()
  })
  it('"Contact us" plans are contact-sales, never Free', () => {
    expect(planCheckoutMode({ id: 'team', price: 'Contact us' })).toBe('contact_sales')
    expect(planCheckoutMode({ id: 'team', price: '1,499' })).toBe('checkout')
    expect(planCheckoutMode({ id: 'team', price: '1,499', contactSales: true })).toBe('contact_sales')
  })
})

describe('calculateDiscount', () => {
  it('clamps bad coupon values (never raises the price, never below 0)', async () => {
    const { calculateDiscount } = await import('@/lib/coupon-service')
    expect(calculateDiscount(10000, { discount_type: 'percentage', discount_value: 25 }, 'INR')).toBe(7500)
    expect(calculateDiscount(10000, { discount_type: 'percentage', discount_value: 150 }, 'INR')).toBe(0)
    expect(calculateDiscount(10000, { discount_type: 'percentage', discount_value: -50 }, 'INR')).toBe(10000)
    expect(calculateDiscount(10000, { discount_type: 'flat', discount_value: 30 }, 'INR')).toBe(7000)
    expect(calculateDiscount(10000, { discount_type: 'flat', discount_value: 500 }, 'INR')).toBe(0)
  })
})

describe('trial coupons', () => {
  it('only valid trial coupons fund a trial window', () => {
    expect(trialDaysForCoupon({ discount_type: 'trial', trial_duration_days: 14 })).toBe(14)
    expect(trialDaysForCoupon({ discount_type: 'percentage', trial_duration_days: 14 })).toBeNull()
    expect(trialDaysForCoupon({ discount_type: 'trial', trial_duration_days: 0 })).toBeNull()
    expect(trialDaysForCoupon(null)).toBeNull()
  })

  it('the expiry job ends a trial period that is over', () => {
    expect(shouldExpireTrial({
      status: 'active', trial_ends_at: '2026-10-17T00:00:00Z', trial_order_id: 'o1', last_order_id: 'o1',
    }, NOW)).toBe(true)
  })

  it('a later paid order keeps the paid period (D5)', () => {
    // Paid renewal after the trial: last_order_id moved on.
    expect(shouldExpireTrial({
      status: 'active', trial_ends_at: '2026-10-17T00:00:00Z', trial_order_id: 'o1', last_order_id: 'o2',
    }, NOW)).toBe(false)
    // Legacy marker without a trial order id is never trusted to end a period.
    expect(shouldExpireTrial({ status: 'active', trial_ends_at: '2026-10-17T00:00:00Z', last_order_id: 'o2' }, NOW)).toBe(false)
  })

  it('a trial still running is not expired', () => {
    expect(shouldExpireTrial({
      status: 'active', trial_ends_at: '2026-10-30T00:00:00Z', trial_order_id: 'o1', last_order_id: 'o1',
    }, NOW)).toBe(false)
  })
})

describe('cancel at period end (D8)', () => {
  const sub = { status: 'active', ends_at: '2026-11-01T00:00:00Z', cancel_at_period_end: true }
  it('keeps access until ends_at', () => {
    expect(hasAccess(sub, NOW)).toBe(true)
    expect(displayStatus(sub, NOW)).toBe('cancelling')
  })
  it('lapses after ends_at', () => {
    expect(hasAccess(sub, new Date('2026-11-02T00:00:00Z'))).toBe(false)
    expect(displayStatus(sub, new Date('2026-11-02T00:00:00Z'))).toBe('ended')
  })
  it('an uncancelled plan is active', () => {
    expect(displayStatus({ ...sub, cancel_at_period_end: false }, NOW)).toBe('active')
  })
})

describe('admin coupon validation (D20)', () => {
  it('accepts a valid percentage coupon', () => {
    const r = validateCouponInput({ code: 'save20', discount_type: 'percentage', discount_value: 20, max_uses: 100 }, false)
    expect(r).toEqual({ ok: true, value: { code: 'SAVE20', discount_type: 'percentage', discount_value: 20, max_uses: 100 } })
  })
  it('rejects negative, >100% and junk values', () => {
    expect(validateCouponInput({ code: 'X1Y', discount_type: 'percentage', discount_value: -5 }, false).ok).toBe(false)
    expect(validateCouponInput({ code: 'X1Y', discount_type: 'percentage', discount_value: 150 }, false).ok).toBe(false)
    expect(validateCouponInput({ code: 'X1Y', discount_type: 'flat', discount_value: 10, max_uses: -1 }, false).ok).toBe(false)
    expect(validateCouponInput({ code: '<b>', discount_type: 'flat', discount_value: 10 }, false).ok).toBe(false)
    expect(validateCouponInput({ code: 'X1Y', discount_type: 'bogus', discount_value: 10 }, false).ok).toBe(false)
  })
  it('trial coupons need a 1–365 day length and are always 100%', () => {
    expect(validateCouponInput({ code: 'TRY14', discount_type: 'trial' }, false).ok).toBe(false)
    const r = validateCouponInput({ code: 'TRY14', discount_type: 'trial', trial_duration_days: 14 }, false)
    expect(r.ok && r.value.discount_value).toBe(100)
  })
})

describe('organisation invitations (D31)', () => {
  const invite = { status: 'pending', email: 'a@x.com', expires_at: '2026-10-25T00:00:00Z', role: 'tenant_admin', organization_id: 't1' }
  it('tenant admins invite members only; superadmin may invite an org admin', () => {
    expect(resolveInviteRole('tenant_admin', 'tenant_admin')).toBe('user')
    expect(resolveInviteRole('superadmin', 'tenant_admin')).toBe('tenant_admin')
    expect(resolveInviteRole('superadmin', 'superadmin')).toBe('user')
  })
  it('honours the invited role on accept', () => {
    expect(decideAccept({ invite, userEmail: 'A@x.com', userRole: 'user', userTenantId: null, tenantActive: true, now: NOW }))
      .toEqual({ ok: true, role: 'tenant_admin' })
  })
  it('never fakes success for a user already in another organisation', () => {
    const r = decideAccept({ invite, userEmail: 'a@x.com', userRole: 'user', userTenantId: 't2', tenantActive: true, now: NOW })
    expect(r.ok).toBe(false)
    expect(!r.ok && r.status).toBe(409)
  })
  it('rejects expired, used or other-account invitations', () => {
    expect(decideAccept({ invite: { ...invite, expires_at: '2026-10-01T00:00:00Z' }, userEmail: 'a@x.com', userRole: 'user', userTenantId: null, tenantActive: true, now: NOW }).ok).toBe(false)
    expect(decideAccept({ invite: { ...invite, status: 'accepted' }, userEmail: 'a@x.com', userRole: 'user', userTenantId: null, tenantActive: true, now: NOW }).ok).toBe(false)
    expect(decideAccept({ invite, userEmail: 'b@x.com', userRole: 'user', userTenantId: null, tenantActive: true, now: NOW }).ok).toBe(false)
  })
  it('a superadmin keeps their role', () => {
    expect(decideAccept({ invite, userEmail: 'a@x.com', userRole: 'superadmin', userTenantId: null, tenantActive: true, now: NOW }))
      .toEqual({ ok: true, role: 'superadmin' })
  })
})

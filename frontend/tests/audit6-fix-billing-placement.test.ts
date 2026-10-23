/**
 * Audit-6 fixes: SEC-034 (native-app block on every checkout path),
 * SEC-035 / CORE-049 (personal recovery and win-back coupons), CORE-048
 * (placement assignment progress), CORE-047 (onboarding org picker).
 * Run: npx vitest run tests/audit6-fix-billing-placement.test.ts
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { couponEligibility } from '@/lib/billing/coupon-eligibility'
import { recoveryCouponAllowed, RECOVERY_COUPON_COOLDOWN_DAYS } from '@/lib/automation/nudges/rules'
import { assignmentProgress } from '@/lib/assistants/placement/assignments'
import { buildPlacementReport } from '@/lib/assistants/placement/select'

const ROOT = join(__dirname, '..')
const NOW = new Date('2026-10-23T10:00:00Z')
const DAY = 86_400_000

describe('SEC-035 / CORE-049: personal coupons', () => {
  const ctx = { planId: 'pro', userRedemptions: 0, hasPaidBefore: false, now: NOW }
  it('only the bound user can redeem it; unknown caller fails closed', () => {
    expect(couponEligibility({ user_id: 'u1' }, { ...ctx, userId: 'u1' })).toEqual({ ok: true })
    expect(couponEligibility({ user_id: 'u1' }, { ...ctx, userId: 'u2' })).toEqual({ ok: false, code: 'coupon_not_yours' })
    expect(couponEligibility({ user_id: 'u1' }, ctx)).toEqual({ ok: false, code: 'coupon_not_yours' })
    expect(couponEligibility({}, { ...ctx, userId: 'u2' })).toEqual({ ok: true })
  })
  it('one recovery coupon per person per 90 days', () => {
    expect(RECOVERY_COUPON_COOLDOWN_DAYS).toBe(90)
    expect(recoveryCouponAllowed(null, NOW)).toBe(true)
    expect(recoveryCouponAllowed(new Date(NOW.getTime() - 10 * DAY).toISOString(), NOW)).toBe(false)
    expect(recoveryCouponAllowed(new Date(NOW.getTime() - 91 * DAY).toISOString(), NOW)).toBe(true)
  })
  it('both issuers bind the coupon to the person', () => {
    expect(readFileSync(join(ROOT, 'lib/automation/system/nudges-billing.ts'), 'utf8')).toMatch(/\{ userId: String\(o\.user_id\) \}/)
    expect(readFileSync(join(ROOT, 'lib/assistants/revenue/service.ts'), 'utf8')).toMatch(/applies_to: 'plans' \}, \{ userId \}\)/)
    // Both redemption paths pass the buyer to the eligibility check.
    expect(readFileSync(join(ROOT, 'lib/payment-service.ts'), 'utf8')).toMatch(/planId: plan\.id,\s*userId,/)
    expect(readFileSync(join(ROOT, 'lib/billing/quote.ts'), 'utf8')).toMatch(/userId: input\.userId/)
  })
})

describe('SEC-034: deprecated create-order refuses the app shell', () => {
  afterEach(() => { vi.doUnmock('@/lib/route-auth'); delete process.env.NATIVE_IAP_ENABLED })
  it('returns native_purchase_blocked before auth', async () => {
    vi.resetModules()
    const getAPIUser = vi.fn(async () => null)
    vi.doMock('@/lib/route-auth', () => ({ getAPIUser }))
    const { POST } = await import('@/app/api/billing/create-order/route')
    const req = new Request('http://x/api/billing/create-order', { method: 'POST', body: '{}', headers: { 'user-agent': 'Mozilla/5.0 CodeSpectraAndroid/1' } })
    const res = await POST(req as never)
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('native_purchase_blocked')
    expect(getAPIUser).not.toHaveBeenCalled()
  })
})

describe('CORE-048: placement assignment progress', () => {
  const a = { pattern_id: 'tcs-nqt', created_at: '2026-10-20T00:00:00Z' }
  const students = [
    { student_id: 's1', user_id: 'u1', name: 'Asha' },
    { student_id: 's2', user_id: 'u2', name: 'Bala' },
    { student_id: 's3', user_id: 'u3', name: 'Chitra' },
  ]
  it('counts completions after the assignment for that pattern only', () => {
    const p = assignmentProgress(a, students, [
      { userId: 'u1', patternId: 'tcs-nqt', status: 'completed', createdAt: '2026-10-21T00:00:00Z' },
      { userId: 'u2', patternId: 'tcs-nqt', status: 'in_progress', createdAt: '2026-10-22T00:00:00Z' },
      { userId: 'u3', patternId: 'tcs-nqt', status: 'completed', createdAt: '2026-10-01T00:00:00Z' }, // before: doesn't count
      { userId: 'u3', patternId: 'infosys', status: 'completed', createdAt: '2026-10-22T00:00:00Z' }, // other test
    ])
    expect(p).toMatchObject({ total: 3, completed: 1, started: 1, pending: 2 })
    expect(p.pending_students.map((s) => s.name)).toEqual(['Bala', 'Chitra'])
    expect(p.pending_students[0].started).toBe(true)
  })
  it('the weekly report mentions unfinished assignments', () => {
    const base = { college: 'SNIST', students: 10, active: 5, readiness_avg: 50, weak_areas: [], drives_open: [], applications_week: 0, offers_week: 0, to_nudge: 0 }
    expect(buildPlacementReport(base, NOW).lines.join(' ')).not.toContain('practice assignment')
    const r = buildPlacementReport({ ...base, assignments_pending: 7, assignments_open: 2 }, NOW)
    expect(r.lines.join(' ')).toContain('7 student(s) have not finished 2 practice assignment(s)')
    expect(r.numbers.assignments_pending).toBe(7)
  })
})

describe('CORE-047: onboarding checklist for a superadmin', () => {
  it('the page lets a superadmin pick an organisation and passes ?tenant=', () => {
    const src = readFileSync(join(ROOT, 'app/dashboard/admin/onboarding/page.tsx'), 'utf8')
    expect(src).toContain('/api/admin/agent/tenants')
    expect(src).toContain('`/api/assistants/onboarding${q}`')
    expect(src).toContain("t('onboarding.orgPick')")
  })
})

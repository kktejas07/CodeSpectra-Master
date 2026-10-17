import { describe, it, expect } from 'vitest'
import {
  normalizePlanKey,
  pickEffectivePlanKey,
  mergePlanDefinition,
  limitFor,
  aiAllowanceFor,
  withinLimit,
  highestPlanKey,
  isSubscriptionLive,
  creditPeriod,
  assertCreditAmount,
} from '@/lib/entitlements-core'
import type { PlanDefinition } from '@/lib/plans-client'

const NOW = new Date('2026-10-18T12:00:00.000Z')
const future = '2026-11-18T12:00:00.000Z'
const past = '2026-10-01T12:00:00.000Z'

describe('normalizePlanKey', () => {
  it('maps legacy checkout ids to plan keys', () => {
    expect(normalizePlanKey('pro_monthly')).toBe('pro')
    expect(normalizePlanKey('pro_yearly')).toBe('pro')
    expect(normalizePlanKey('Enterprise')).toBe('enterprise')
  })
  it('one-time packs are not plans', () => {
    expect(normalizePlanKey('problem_pack_50')).toBeNull()
  })
  it('rejects junk', () => {
    expect(normalizePlanKey('')).toBeNull()
    expect(normalizePlanKey({ $ne: 1 })).toBeNull()
    expect(normalizePlanKey('a b')).toBeNull()
  })
})

describe('pickEffectivePlanKey (one resolver: subscription first)', () => {
  it('a live paid subscription grants its plan even when user.plan is unset', () => {
    expect(pickEffectivePlanKey({ subscription: { plan_id: 'pro_monthly', status: 'active', ends_at: future }, now: NOW }))
      .toEqual({ key: 'pro', source: 'subscription' })
  })
  it('an expired or cancelled subscription grants nothing', () => {
    expect(pickEffectivePlanKey({ subscription: { plan_id: 'pro', status: 'active', ends_at: past }, now: NOW }).key).toBe('free')
    expect(pickEffectivePlanKey({ subscription: { plan_id: 'pro', status: 'cancelled', ends_at: future }, now: NOW }).key).toBe('free')
  })
  it('falls back to the admin override, then free', () => {
    expect(pickEffectivePlanKey({ userPlan: 'enterprise', now: NOW })).toEqual({ key: 'enterprise', source: 'override' })
    expect(pickEffectivePlanKey({ now: NOW })).toEqual({ key: 'free', source: 'default' })
  })
  it('the higher tier wins when both exist', () => {
    const sub = { plan_id: 'pro', status: 'active', ends_at: future }
    expect(pickEffectivePlanKey({ subscription: sub, userPlan: 'enterprise', now: NOW }).key).toBe('enterprise')
    expect(pickEffectivePlanKey({ subscription: sub, userPlan: 'free', now: NOW }).key).toBe('pro')
  })
  it('a cancel-at-period-end subscription keeps access until ends_at', () => {
    expect(isSubscriptionLive({ plan_id: 'pro', status: 'active', ends_at: future }, NOW)).toBe(true)
  })
})

describe('plan limits', () => {
  it('fills limits a stored plan lacks from the defaults for the same key', () => {
    const dbPro: PlanDefinition = { plan: 'pro', name: 'Pro', description: '', features: [{ key: 'max_scans_per_day', label: '', description: '', enabled: true, limit: 7, type: 'count' }] }
    const merged = mergePlanDefinition('pro', dbPro)
    expect(limitFor(merged, 'max_scans_per_day')).toBe(7)
    expect(limitFor(merged, 'max_seats')).toBe(25)
  })
  it('unknown plan keys get the free defaults (deny by default)', () => {
    const merged = mergePlanDefinition('mystery', null)
    expect(limitFor(merged, 'max_scans_per_day')).toBe(10)
    expect(limitFor(merged, 'max_seats')).toBe(5)
  })
  it('-1 and 0 are unlimited, disabled is 0', () => {
    const p: PlanDefinition = {
      plan: 'x', name: 'x', description: '', features: [
        { key: 'a', label: '', description: '', enabled: true, limit: -1, type: 'count' },
        { key: 'b', label: '', description: '', enabled: true, limit: 0, type: 'count' },
        { key: 'c', label: '', description: '', enabled: false, limit: 50, type: 'count' },
      ],
    }
    expect(limitFor(p, 'a')).toBe(Infinity)
    expect(limitFor(p, 'b')).toBe(Infinity)
    expect(limitFor(p, 'c')).toBe(0)
  })
  it('withinLimit', () => {
    expect(withinLimit(10, 9)).toBe(true)
    expect(withinLimit(10, 10)).toBe(false)
    expect(withinLimit(Infinity, 1e9)).toBe(true)
  })
  it('AI allowance follows the plan', () => {
    expect(aiAllowanceFor(mergePlanDefinition('free', null))).toBe(10)
    expect(aiAllowanceFor(mergePlanDefinition('pro', null))).toBe(1000)
    expect(aiAllowanceFor(mergePlanDefinition('enterprise', null))).toBe(5000)
  })
  it('organisation plan = highest tier', () => {
    expect(highestPlanKey([null, 'free', 'pro_monthly'])).toBe('pro')
    expect(highestPlanKey(['enterprise', 'pro'])).toBe('enterprise')
    expect(highestPlanKey([])).toBe('free')
  })
})

describe('credit spend guards', () => {
  it('only positive integers within the cap', () => {
    expect(assertCreditAmount(1)).toBe(1)
    expect(assertCreditAmount(10)).toBe(10)
    for (const bad of [0, -1, -100000, 1.5, NaN, Infinity, '5', null, undefined, 101]) {
      expect(() => assertCreditAmount(bad as unknown)).toThrow(RangeError)
    }
  })
  it('a paid plan starts a fresh period at its allowance (legacy free balance)', () => {
    expect(creditPeriod({ balance: 3, resetAt: future, creditsPlan: undefined, planKey: 'pro', allowance: 1000, now: NOW }))
      .toEqual({ balance: 1000, reset: true })
  })
  it('keeps the balance within a period on the same plan', () => {
    expect(creditPeriod({ balance: 3, resetAt: future, creditsPlan: 'free', planKey: 'free', allowance: 10, now: NOW }))
      .toEqual({ balance: 3, reset: false })
  })
  it('resets when the period ended or the plan changed', () => {
    expect(creditPeriod({ balance: 0, resetAt: past, creditsPlan: 'free', planKey: 'free', allowance: 10, now: NOW }).balance).toBe(10)
    expect(creditPeriod({ balance: 900, resetAt: future, creditsPlan: 'pro', planKey: 'free', allowance: 10, now: NOW }).balance).toBe(10)
  })
  it('never reports a negative balance', () => {
    expect(creditPeriod({ balance: -50, resetAt: future, creditsPlan: 'free', planKey: 'free', allowance: 10, now: NOW }).balance).toBe(0)
  })
})

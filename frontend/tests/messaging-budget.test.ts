/**
 * Audit-6 automation fixes: the shared per-person messaging budget (AUTO-094)
 * and the pure rules behind AUTO-092 / 093 / 096 / 098 / 100 / 103.
 */
import { describe, expect, it } from 'vitest'
import { alreadyCounted, budgetAllows, classForMailCategory, classPriority, dunningBudgetObject, heldRetryAt, isCapped, isoWeekKey, isServiceEvent, messageDedupeKey, messageDedupePrefix, MESSAGE_CLASSES, workflowMailClass } from '@/lib/messaging/budget-rules'
import { autoRenews, cohortRisk, followUpTooOld, nextSourceHealth, sourceHealthAction } from '@/lib/automation/nudges/rules'
import { needsExpiryReminder } from '@/lib/automation/system/rules'
import { reminderTopic } from '@/lib/assistants/revenue/signals'
import { NOTIFICATION_BUDGET_CLASS, NOTIFICATION_TYPES } from '@/lib/notifications'

const H = 3_600_000
const D = 24 * H
const now = new Date('2026-10-23T10:00:00Z')
const at = (ms: number) => new Date(now.getTime() + ms).toISOString()
const caps = { daily: 2, weekly: 6 }

describe('message classes', () => {
  it('receipts, security, payment, legal and subscribed messages bypass the cap; nudges and digests are capped', () => {
    for (const c of ['transactional', 'security', 'payment', 'legal', 'subscribed'] as const) expect(isCapped(c)).toBe(false)
    for (const c of ['engagement', 'marketing', 'digest', 'deadline'] as const) expect(isCapped(c)).toBe(true)
    expect(MESSAGE_CLASSES).toHaveLength(9)
  })
  it('only deadline reminders get the extra daily slot', () => {
    expect(classPriority('deadline')).toBe('high')
    expect(classPriority('engagement')).toBe('normal')
    const two = [{ at: at(-H) }, { at: at(-2 * H) }]
    expect(budgetAllows('engagement', two, now, caps)).toEqual({ ok: false, reason: 'daily_cap' })
    expect(budgetAllows('marketing', two, now, caps).ok).toBe(false)
    expect(budgetAllows('deadline', two, now, caps).ok).toBe(true)
    // A second deadline reminder the same day still fits the +1 slot only.
    const withDeadline = [{ at: at(-H), class: 'deadline' }, { at: at(-2 * H), class: 'engagement' }]
    expect(budgetAllows('deadline', withDeadline, now, caps).ok).toBe(true)
    expect(budgetAllows('deadline', [...withDeadline, { at: at(-3 * H), class: 'engagement' }], now, caps).ok).toBe(false)
  })
  it('uncapped classes always pass, even over the weekly cap', () => {
    const week = Array.from({ length: 10 }, (_, i) => ({ at: at(-(i + 1) * H) }))
    expect(budgetAllows('payment', week, now, caps).ok).toBe(true)
    expect(budgetAllows('legal', week, now, caps).ok).toBe(true)
    expect(budgetAllows('subscribed', week, now, caps).ok).toBe(true)
  })
  it('maps automation email categories', () => {
    expect(classForMailCategory('engagement')).toBe('engagement')
    expect(classForMailCategory('events')).toBe('deadline')
    expect(classForMailCategory('reports')).toBe('digest')
    expect(classForMailCategory('billing')).toBe('payment')
    expect(classForMailCategory('security')).toBe('security')
    expect(classForMailCategory('hiring')).toBe('transactional')
    expect(classForMailCategory('assessment')).toBe('transactional')
  })
})

describe('opted-in schedules and deadlines (AUTO-108 / CORE-050)', () => {
  const daily = (days: number, cls = 'engagement') => Array.from({ length: days }, (_, i) => ({ at: at(-(i * D + H)), class: cls }))
  it('a daily message the person chose is never held, even after a full week of them', () => {
    // WhatsApp practice + study-plan reminder + daily digest: 3 a day for 7 days.
    for (let day = 0; day < 7; day++) for (let n = 0; n < 3; n++) expect(budgetAllows('subscribed', daily(day * 3), now, caps).ok).toBe(true)
  })
  it('marketing volume never blocks the first deadline reminder of the day', () => {
    const week = daily(6, 'marketing') // weekly cap of 6 used up by tips / offers
    expect(budgetAllows('engagement', week, now, caps)).toEqual({ ok: false, reason: 'weekly_cap' })
    expect(budgetAllows('deadline', week, now, caps).ok).toBe(true)
    const busyDay = [{ at: at(-H), class: 'marketing' }, { at: at(-2 * H), class: 'engagement' }, { at: at(-3 * H), class: 'engagement' }]
    expect(budgetAllows('deadline', busyDay, now, caps).ok).toBe(true)
  })
  it('deadline reminders get one extra slot on the weekly limit too', () => {
    const week = [{ at: at(-H), class: 'deadline' }, ...daily(5, 'engagement').map((h, i) => ({ ...h, at: at(-(i + 1) * D - H) }))]
    expect(week).toHaveLength(6)
    expect(budgetAllows('deadline', week, now, caps).ok).toBe(true) // 6 < weekly 6 + 1
    expect(budgetAllows('deadline', [...week, { at: at(-2 * H), class: 'engagement' }], now, caps)).toEqual({ ok: false, reason: 'weekly_cap' })
  })
})

describe('one logical message, several channels (CORE-051)', () => {
  it('the second channel of a counted message is not counted again', () => {
    const h = [{ at: at(-H), class: 'digest', topic: 'weekly-digest', object: '2026-W43' }]
    expect(alreadyCounted(h, 'weekly-digest', '2026-W43')).toBe(true)
    expect(alreadyCounted(h, 'weekly-digest', '2026-W44')).toBe(false)
    expect(alreadyCounted(h, null, '2026-W43')).toBe(false)
  })
})

describe('held messages are retried (AUTO-109)', () => {
  it('a held job waits 6 hours and gives up after 3 days', () => {
    expect(heldRetryAt(at(-H), now)?.toISOString()).toBe(at(6 * H))
    expect(heldRetryAt(at(-2 * D), now)).not.toBeNull()
    expect(heldRetryAt(at(-3 * D), now)).toBeNull()
    expect(heldRetryAt(undefined, now)?.toISOString()).toBe(at(6 * H))
  })
})

describe('workflow email class (AUTO-115)', () => {
  it('only service events may send transactional mail', () => {
    expect(workflowMailClass('transactional', 'candidate.applied')).toBe('transactional')
    expect(workflowMailClass('transactional', 'interview.scheduled')).toBe('transactional')
    expect(workflowMailClass('transactional', 'assessment.invite.expiring')).toBe('transactional')
    expect(workflowMailClass('transactional', 'user.inactive')).toBe('engagement')
    expect(workflowMailClass('transactional', 'learn.post.published')).toBe('engagement')
    expect(workflowMailClass('transactional', null)).toBe('engagement') // manual / schedule / webhook
    expect(workflowMailClass('engagement', 'candidate.applied')).toBe('engagement')
    expect(isServiceEvent('cohort.member_at_risk')).toBe(false)
  })
})

describe('dunning vs the revenue assistant (AUTO-117)', () => {
  it('ordinary steps share the assistant topic/day; the final notice has its own object', () => {
    expect(dunningBudgetObject('sub_1', 'ep', { key: 'd3' }, now)).toBe('sub_1:2026-10-23')
    expect(dunningBudgetObject('sub_1', 'ep', { key: 'd7', final: true }, now)).toBe('sub_1:final:ep')
    expect(reminderTopic('payment:sub_1:2026-11-01', now)?.object).toBe(dunningBudgetObject('sub_1', 'ep', { key: 'd3' }, now))
  })
})

describe('dedupe keys', () => {
  it('one key per (person, topic, object); ids only', () => {
    const a = messageDedupeKey('u:1', 'mentor-feedback', 'bk_9')
    expect(a).toBe('msg:mentor-feedback:bk_9:u:1')
    expect(messageDedupeKey('u:2', 'mentor-feedback', 'bk_9')).not.toBe(a)
    expect(messageDedupeKey('u:1', 'mentor-feedback', 'bk_10')).not.toBe(a)
    expect(a.startsWith(messageDedupePrefix('mentor-feedback', 'bk_9'))).toBe(true)
  })
  it('weekly reports share an ISO week key', () => {
    expect(isoWeekKey(new Date('2026-10-19T03:30:00Z'))).toBe('2026-W43') // Monday
    expect(isoWeekKey(new Date('2026-10-25T23:00:00Z'))).toBe('2026-W43') // Sunday
    expect(isoWeekKey(new Date('2026-10-26T00:00:00Z'))).toBe('2026-W44')
    expect(isoWeekKey(new Date('2021-01-01T12:00:00Z'))).toBe('2020-W53')
  })
  it('revenue assistant reminders use the same topic as the automatic ones (AUTO-098)', () => {
    expect(reminderTopic('renewal:sub_1:2026-11-01', now)).toEqual({ class: 'deadline', topic: 'plan-renewal', object: 'sub_1:2026-11-01:2026-10-23', objectPrefix: 'sub_1:2026-11-01:' })
    expect(reminderTopic('payment:sub_1:2026-11-01', now)).toMatchObject({ class: 'payment', topic: 'payment-failed', object: 'sub_1:2026-10-23' })
    expect(reminderTopic('licence:lic_1:2026-12-01', now)).toMatchObject({ topic: 'licence-renewal', object: 'lic_1:2026-12-01:2026-10-23' })
    expect(reminderTopic('seats:lic_1:50', now)).toBeNull()
  })
})

describe('notification types (AUTO-105)', () => {
  it('reminder types are registered with a category, icon and link', () => {
    for (const t of ['drive.reminder', 'drive.no_show', 'assessment.reminder', 'pro_cert.expiring', 'cohort.reminder', 'cohort.staff', 'talent.invite', 'talent.update', 'hiring.nudge', 'ats.bgv', 'billing.licence_expiring', 'billing.renewal_reminder', 'billing.upgrade_offer', 'streak.saver', 'study_plan.reminder']) {
      const info = NOTIFICATION_TYPES[t as keyof typeof NOTIFICATION_TYPES]
      expect(info, t).toBeTruthy()
      expect(info.category).not.toBe('general')
      expect(info.default_link.startsWith('/')).toBe(true)
    }
  })
  it('engagement types are capped when sent with notify(); receipts are not listed', () => {
    expect(NOTIFICATION_BUDGET_CLASS['streak.saver']).toBe('engagement')
    expect(NOTIFICATION_BUDGET_CLASS['billing.upgrade_offer']).toBe('marketing')
    expect(NOTIFICATION_BUDGET_CLASS.newsletter).toBe('marketing')
    expect(NOTIFICATION_BUDGET_CLASS['study_plan.reminder']).toBe('subscribed')
    expect(NOTIFICATION_BUDGET_CLASS['billing.payment_success']).toBeUndefined()
    expect(NOTIFICATION_BUDGET_CLASS['auth.password_changed']).toBeUndefined()
  })
})

describe('auto-renew (AUTO-093)', () => {
  it('one answer for plan-expiry and renewal-nudges', () => {
    const rzp = { status: 'active', billing_mode: 'razorpay_subscription' }
    const stripe = { status: 'active', billing_mode: 'stripe_subscription' }
    expect(autoRenews(rzp)).toBe(true)
    expect(needsExpiryReminder(rzp, true)).toBe(false)
    expect(autoRenews(stripe, false)).toBe(false)
    expect(needsExpiryReminder(stripe, false)).toBe(true)
    expect(autoRenews({ ...rzp, cancel_at_period_end: true })).toBe(false)
    expect(needsExpiryReminder({ ...rzp, cancel_at_period_end: true }, true)).toBe(true)
    expect(needsExpiryReminder({ status: 'active', billing_mode: 'prepaid' }, true)).toBe(true)
  })
})

describe('queued follow-ups (AUTO-092)', () => {
  it('drops jobs older than a few days', () => {
    expect(followUpTooOld(at(-2 * D), now)).toBe(false)
    expect(followUpTooOld(at(-90 * D), now)).toBe(true)
    expect(followUpTooOld(undefined, now)).toBe(false)
  })
})

describe('cohort at-risk (AUTO-096)', () => {
  const base = { pastDue: [], submittedIds: new Set<string>(), lastActivityAt: null, joinedAt: at(-20 * D) }
  it('counts inactivity from the cohort start, not an early enrolment', () => {
    expect(cohortRisk({ ...base, startsAt: at(-H), hadRecentWork: true }, now).at_risk).toBe(false)
    expect(cohortRisk({ ...base, startsAt: at(-8 * D), hadRecentWork: true }, now)).toMatchObject({ at_risk: true, days_inactive: 8 })
  })
  it('a quiet week with nothing scheduled is not "inactive"', () => {
    expect(cohortRisk({ ...base, startsAt: at(-10 * D), hadRecentWork: false }, now).at_risk).toBe(false)
    expect(cohortRisk({ ...base, pastDue: [{ id: 'a' }, { id: 'b' }], startsAt: at(-10 * D), hadRecentWork: false }, now).reasons).toEqual(['missed_assignments'])
  })
})

describe('feed source health (AUTO-103)', () => {
  const pull = (n: number, o: { ok?: boolean; empty?: boolean } = {}) => ({ id: 's', last_run_at: at(n * H), ok: o.ok ?? true, error: o.ok === false ? 'boom' : o.empty ? 'No items fetched' : null, empty: o.empty })
  it('a source switched back on is watched again', () => {
    const disabled = { id: 's', seen_run_at: at(-48 * H), bad_streak: 9, first_bad_at: at(-9 * D), last_good_at: at(-10 * D), last_error: 'boom', alerted_at: at(-8 * D), disabled_at: at(-2 * D) }
    let h = nextSourceHealth(disabled, pull(-30, { ok: false }))
    expect(h.disabled_at).toBeNull()
    expect(h.bad_streak).toBe(1)
    h = nextSourceHealth(nextSourceHealth(h, pull(-20, { ok: false })), pull(-10, { ok: false }))
    expect(sourceHealthAction(h, now)).toBe('alert')
  })
  it('a small events calendar returning nothing is not broken', () => {
    let h = nextSourceHealth(null, pull(-100, { empty: true }))
    for (let i = 1; i <= 10; i++) h = nextSourceHealth(h, pull(-100 + i * 10, { empty: true }))
    expect(h.bad_streak).toBe(0)
  })
  it('a source that used to return items and goes empty for 3 days counts as bad', () => {
    let h = nextSourceHealth(null, pull(-100))
    h = nextSourceHealth(h, pull(-90, { empty: true }))
    expect(h.bad_streak).toBe(0)
    h = nextSourceHealth(h, pull(-10, { empty: true }))
    expect(h.bad_streak).toBe(1)
    expect(nextSourceHealth(h, pull(-1)).empty_since).toBeNull()
  })
})

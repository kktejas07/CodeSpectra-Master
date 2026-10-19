/**
 * Built-in automation rules: scheduling windows, dunning schedule, expiry
 * reminders, reconciliation state machine, abandoned attempts, reminder
 * windows, re-engagement buckets, hiring nudges, auto-grade mapping, ops
 * alert thresholds, LinkedIn links, quotas, alert de-dup keys.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/mongodb', () => ({ getMongoDb: async () => { throw new Error('no db in unit tests') } }))
import {
  applyGrades, detailsToGrade, dueDunningStep, expiryReminderDay, hiringNudgeFor, inactivityBucket, isSpike, linkedInAddUrl,
  localHour, needsExpiryReminder, reconcileAction, reconcileOutcome, reminderWindow, shouldFinalizeAttempt, staleCrons, windowKeyFor,
} from '@/lib/automation/system/rules'
import { overLimit, quotaKey } from '@/lib/automation/quotas'
import { alertWindowKey, chatPayload } from '@/lib/automation/alerts'

const D = (s: string) => new Date(s)
const DAY = 86_400_000

describe('scheduling windows', () => {
  it('interval windows change every N minutes', () => {
    const c = { kind: 'interval' as const, minutes: 15 }
    expect(windowKeyFor(c, D('2026-01-01T10:00:00Z'))).toBe(windowKeyFor(c, D('2026-01-01T10:14:59Z')))
    expect(windowKeyFor(c, D('2026-01-01T10:15:00Z'))).not.toBe(windowKeyFor(c, D('2026-01-01T10:14:59Z')))
  })
  it('daily jobs are due from their hour until the end of the day', () => {
    const c = { kind: 'daily' as const, hourUtc: 3, minuteUtc: 30 }
    expect(windowKeyFor(c, D('2026-01-01T03:29:00Z'))).toBeNull()
    expect(windowKeyFor(c, D('2026-01-01T03:30:00Z'))).toBe('d:2026-01-01')
    expect(windowKeyFor(c, D('2026-01-01T23:59:00Z'))).toBe('d:2026-01-01')
  })
  it('weekly jobs anchor on the weekday', () => {
    const c = { kind: 'weekly' as const, weekdayUtc: 1, hourUtc: 8 } // Monday 08:00
    expect(windowKeyFor(c, D('2026-01-05T07:00:00Z'))).toBeNull() // Monday before 8
    expect(windowKeyFor(c, D('2026-01-05T08:00:00Z'))).toBe('w:2026-01-05')
    expect(windowKeyFor(c, D('2026-01-08T12:00:00Z'))).toBe('w:2026-01-05') // Thursday same week
    expect(windowKeyFor(c, D('2026-01-12T09:00:00Z'))).toBe('w:2026-01-12')
  })
})

describe('dunning schedule (AU-03)', () => {
  const start = '2026-01-01T00:00:00Z'
  it('sends day 0, 3 and 7 once each, latest first after a pause', () => {
    expect(dueDunningStep(start, D('2026-01-01T01:00:00Z'), [], true)?.key).toBe('day0')
    expect(dueDunningStep(start, D('2026-01-02T00:00:00Z'), ['day0'], true)).toBeNull()
    expect(dueDunningStep(start, D('2026-01-04T00:00:00Z'), ['day0'], true)?.key).toBe('day3')
    const last = dueDunningStep(start, D('2026-01-08T00:00:00Z'), ['day0', 'day3'], true)
    expect(last?.key).toBe('day7')
    expect(last?.channels).toContain('whatsapp')
    expect(dueDunningStep(start, D('2026-01-20T00:00:00Z'), ['day0', 'day3', 'day7'], true)).toBeNull()
    // Paused for 10 days: only the latest step goes out, never all three.
    expect(dueDunningStep(start, D('2026-01-11T00:00:00Z'), [], true)?.key).toBe('day7')
  })
  it('stops once paid', () => {
    expect(dueDunningStep(start, D('2026-01-04T00:00:00Z'), ['day0'], false)).toBeNull()
  })
})

describe('plan expiry reminders (AU-04)', () => {
  const now = D('2026-01-01T12:00:00Z')
  it('fires 7, 3 and 1 days before, once per window', () => {
    expect(expiryReminderDay(new Date(now.getTime() + 6.5 * DAY).toISOString(), now)).toBe(7)
    expect(expiryReminderDay(new Date(now.getTime() + 5 * DAY).toISOString(), now)).toBeNull()
    expect(expiryReminderDay(new Date(now.getTime() + 2.2 * DAY).toISOString(), now)).toBe(3)
    expect(expiryReminderDay(new Date(now.getTime() + 0.3 * DAY).toISOString(), now)).toBe(1)
    expect(expiryReminderDay(new Date(now.getTime() - DAY).toISOString(), now)).toBeNull()
  })
  it('skips plans Stripe will renew', () => {
    expect(needsExpiryReminder({ status: 'active', billing_mode: 'prepaid' }, true)).toBe(true)
    expect(needsExpiryReminder({ status: 'active', billing_mode: 'stripe_subscription' }, true)).toBe(false)
    expect(needsExpiryReminder({ status: 'active', billing_mode: 'stripe_subscription', cancel_at_period_end: true }, true)).toBe(true)
    expect(needsExpiryReminder({ status: 'active', billing_mode: 'stripe_subscription' }, false)).toBe(true)
    expect(needsExpiryReminder({ status: 'active', past_due: true }, true)).toBe(false)
    expect(needsExpiryReminder({ status: 'expired' }, true)).toBe(false)
  })
})

describe('payment reconciliation state machine (AU-05)', () => {
  const now = D('2026-01-01T12:00:00Z')
  const ago = (m: number) => new Date(now.getTime() - m * 60_000).toISOString()
  it('checks only stuck, recent, unsettled orders', () => {
    expect(reconcileAction({ status: 'created', created_at: ago(5) }, now)).toBe('skip')
    expect(reconcileAction({ status: 'created', created_at: ago(11) }, now)).toBe('check')
    expect(reconcileAction({ status: 'attempted', created_at: ago(23 * 60) }, now)).toBe('check')
    expect(reconcileAction({ status: 'attempted', created_at: ago(25 * 60) }, now)).toBe('give_up')
    expect(reconcileAction({ status: 'paid', created_at: ago(30) }, now)).toBe('skip')
    expect(reconcileAction({ status: 'failed', created_at: ago(30) }, now)).toBe('skip')
  })
  it('maps gateway answers to a local outcome', () => {
    expect(reconcileOutcome('paid', 60_000)).toBe('paid')
    expect(reconcileOutcome('failed', 60_000)).toBe('failed')
    expect(reconcileOutcome('expired', 60_000)).toBe('failed')
    expect(reconcileOutcome('pending', 60 * 60_000)).toBe('pending')
    expect(reconcileOutcome('unknown', 25 * 3_600_000)).toBe('failed')
  })
})

describe('abandoned attempts (AU-02)', () => {
  const now = D('2026-01-01T12:00:00Z')
  it('finalises only past deadline + grace and only once', () => {
    const base = { deadlineMs: now.getTime() - 10 * 60_000, graceMs: 7 * 60_000, submittedForAttempt: false, answeredCount: 3 }
    expect(shouldFinalizeAttempt(base, now)).toBe(true)
    expect(shouldFinalizeAttempt({ ...base, graceMs: 15 * 60_000 }, now)).toBe(false)
    expect(shouldFinalizeAttempt({ ...base, submittedForAttempt: true }, now)).toBe(false)
    expect(shouldFinalizeAttempt({ ...base, deadlineMs: null }, now)).toBe(false)
  })
})

describe('reminder windows (AU-09 / A-051 / A-003)', () => {
  const now = D('2026-01-01T12:00:00Z')
  it('24h and 1h windows', () => {
    expect(reminderWindow(new Date(now.getTime() + 20 * 3_600_000).toISOString(), now)).toBe('24h')
    expect(reminderWindow(new Date(now.getTime() + 61 * 60_000).toISOString(), now)).toBe('24h')
    expect(reminderWindow(new Date(now.getTime() + 59 * 60_000).toISOString(), now)).toBe('1h')
    expect(reminderWindow(new Date(now.getTime() + 25 * 3_600_000).toISOString(), now)).toBeNull()
    expect(reminderWindow(new Date(now.getTime() - 1).toISOString(), now)).toBeNull()
    expect(reminderWindow(null, now)).toBeNull()
  })
})

describe('re-engagement (AU-12)', () => {
  const now = D('2026-01-31T12:00:00Z')
  it('buckets 7 / 14 / 30 days, one day wide', () => {
    expect(inactivityBucket(new Date(now.getTime() - 7.5 * DAY), now)).toBe(7)
    expect(inactivityBucket(new Date(now.getTime() - 8.1 * DAY).toISOString(), now)).toBeNull()
    expect(inactivityBucket(new Date(now.getTime() - 14.2 * DAY), now)).toBe(14)
    expect(inactivityBucket(new Date(now.getTime() - 30 * DAY), now)).toBe(30)
    expect(inactivityBucket(null, now)).toBeNull()
  })
  it('reads the local hour of a time zone', () => {
    expect(localHour(D('2026-01-01T14:30:00Z'), 'Asia/Kolkata')).toBe(20)
    expect(localHour(D('2026-01-01T14:30:00Z'), 'Not/AZone')).toBe(14)
  })
})

describe('hiring nudges (AU-07)', () => {
  const now = D('2026-01-10T00:00:00Z')
  const entered = (days: number) => new Date(now.getTime() - days * DAY).toISOString()
  it('warns the day before an SLA auto-reject', () => {
    expect(hiringNudgeFor({ type: 'screening', sla_days: 5 }, entered(4.5), now, 5, false)).toBe('sla_warning')
    expect(hiringNudgeFor({ type: 'screening', sla_days: 5 }, entered(5.5), now, 5, false)).toBeNull()
  })
  it('flags idle stages, pending offers and unfinished assessments', () => {
    expect(hiringNudgeFor({ type: 'virtual_interview' }, entered(6), now, 5, false)).toBe('idle')
    expect(hiringNudgeFor({ type: 'virtual_interview' }, entered(2), now, 5, false)).toBeNull()
    expect(hiringNudgeFor({ type: 'offer' }, entered(3.5), now, 5, false)).toBe('offer_pending')
    expect(hiringNudgeFor({ type: 'assessment' }, entered(2.5), now, 5, false)).toBe('assessment_pending')
    expect(hiringNudgeFor({ type: 'assessment' }, entered(2.5), now, 5, true)).toBeNull()
    expect(hiringNudgeFor({ type: 'hired' }, entered(30), now, 5, false)).toBeNull()
  })
})

describe('auto-grade mapping (AU-01)', () => {
  const details = [
    { qId: 'mcq', correct: true, points: 10, answer: 'A' },
    { qId: 'code', correct: false, points: 20, answer: 'print(1)', pending_review: true },
    { qId: 'essay', correct: false, points: 10, answer: 'Because…', pending_review: true },
    { qId: 'blank', correct: false, points: 10, answer: '', pending_review: true },
    { qId: 'human', correct: false, points: 10, answer: 'x', pending_review: true, requires_human_review: true, awarded: 4 },
  ]
  it('grades only pending answers that have content and are not waiting for a person', () => {
    expect(detailsToGrade(details).map((d) => d.qId)).toEqual(['code', 'essay'])
  })
  it('applies awarded points, clamps them and recomputes score + pending', () => {
    const r = applyGrades(details, {
      code: { recommended: 25, feedback: '5/5 tests passed', graded_by: 'piston' },
      essay: { recommended: 6, feedback: 'ok', requires_human_review: false, confidence: 0.9 },
    })
    expect(r.graded).toBe(2)
    expect(r.details.find((d) => d.qId === 'code')?.awarded).toBe(20) // clamped to max
    // mcq 10 + code 20 + essay 6 + human 4 (still pending)
    expect(r.score).toBe(40)
    expect(r.pending).toBe(true) // 'blank' and 'human' remain pending
    const done = applyGrades(details.filter((d) => d.qId !== 'blank' && d.qId !== 'human'), { code: { recommended: 0, feedback: 'failed' }, essay: { recommended: 10, feedback: 'great' } })
    expect(done.pending).toBe(false)
    expect(done.details.find((d) => d.qId === 'code')?.correct).toBe(false)
  })
})

describe('ops alerts (AU-13)', () => {
  const now = D('2026-01-01T12:00:00Z')
  it('finds stale heartbeats', () => {
    const rows = [
      { id: 'scheduler-loop', last_run_at: new Date(now.getTime() - 20 * 60_000).toISOString(), last_status: 'ok' as const },
      { id: 'ats-sla', last_run_at: new Date(now.getTime() - 20 * 3_600_000).toISOString(), last_status: 'ok' as const },
    ]
    expect(staleCrons(rows, { 'scheduler-loop': 1, 'ats-sla': 1440, 'never-ran': 1 }, now)).toEqual(['scheduler-loop'])
  })
  it('detects spikes', () => {
    expect(isSpike(5, 10)).toBe(true)
    expect(isSpike(4, 5)).toBe(false)
    expect(isSpike(6, 100)).toBe(false)
  })
  it('de-duplicates alerts per hour and formats chat messages', () => {
    expect(alertWindowKey('x', D('2026-01-01T12:01:00Z'))).toBe(alertWindowKey('x', D('2026-01-01T12:59:00Z')))
    expect(alertWindowKey('x', D('2026-01-01T13:00:00Z'))).not.toBe(alertWindowKey('x', D('2026-01-01T12:59:00Z')))
    expect(String(chatPayload({ key: 'k', title: 'T', detail: 'D', severity: 'critical', link: '/x' }, 'https://a.b').text)).toContain('<https://a.b/x|Open in CodeSpectra>')
  })
})

describe('certificates (AU-16) and quotas', () => {
  it('builds a LinkedIn add-to-profile link', () => {
    const u = new URL(linkedInAddUrl({ title: 'Backend screen', verifyUrl: 'https://app/cert/verify/abc', issuedAt: '2026-03-04T00:00:00Z', certId: 'abc' }))
    expect(u.hostname).toBe('www.linkedin.com')
    expect(u.searchParams.get('name')).toBe('Backend screen')
    expect(u.searchParams.get('issueMonth')).toBe('3')
    expect(u.searchParams.get('certUrl')).toBe('https://app/cert/verify/abc')
  })
  it('keys quotas per tenant and day', () => {
    expect(quotaKey('t1', 'emails', D('2026-01-01T23:59:00Z'))).toBe('t1:2026-01-01:emails')
    // AUTO-012: organisation workflows send from the platform's domain — 500 a day.
    expect(overLimit(501, 'emails')).toBe(true)
    expect(overLimit(500, 'emails')).toBe(false)
  })
})

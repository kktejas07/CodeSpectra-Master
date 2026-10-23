/**
 * W15 nudge automations: pure selection / scheduling rules, the shared
 * frequency cap and the localized message catalog.
 */
import { describe, expect, it } from 'vitest'
import {
  autoRenews, bgvDaysOverdue, capAllows, certRenewalStep, checkoutRecoveryStep, cohortRisk, driveClosedAt, dueLadderStep, employerWeekEmpty,
  extractLinks, inviteLadderStep, isDriveNoShow, nextSourceHealth, offerDeadline, offerStep, passRate, pickForLearner, recoveryCouponCode,
  sessionOutcome, sourceHealthAction, stalenessReasons, talentInviteStep, weeklyReportDue,
} from '@/lib/automation/nudges/rules'
import { nudgeMail, nudgeNote } from '@/lib/automation/nudges/text'
import { hasOutboundKey, OUTBOUND_CATALOGS } from '@/lib/i18n/outbound'
import { WORKFLOW_TEMPLATES } from '@/lib/automation/templates'
import { isKnownEventType } from '@/lib/automation/event-types'
import { NudgeSettingsPatch } from '@/lib/automation/nudges/settings'

const H = 3_600_000
const D = 24 * H
const now = new Date('2026-03-02T10:00:00Z')
const at = (ms: number) => new Date(now.getTime() + ms).toISOString()

describe('shared frequency cap', () => {
  const caps = { daily: 2, weekly: 4 }
  it('allows up to the daily cap, then blocks', () => {
    expect(capAllows([], now, caps)).toEqual({ ok: true })
    expect(capAllows([{ at: at(-H) }], now, caps).ok).toBe(true)
    expect(capAllows([{ at: at(-H) }, { at: at(-2 * H) }], now, caps)).toEqual({ ok: false, reason: 'daily_cap' })
  })
  it('gives deadline nudges one extra daily slot but never beats the weekly cap', () => {
    expect(capAllows([{ at: at(-H) }, { at: at(-2 * H) }], now, caps, 'high').ok).toBe(true)
    const week = [at(-H), at(-2 * D), at(-3 * D), at(-4 * D)].map((a) => ({ at: a }))
    expect(capAllows(week, now, caps, 'high')).toEqual({ ok: false, reason: 'weekly_cap' })
  })
  it('ignores sends older than 7 days and in the future', () => {
    expect(capAllows([{ at: at(-8 * D) }, { at: at(-9 * D) }, { at: at(H) }], now, { daily: 1, weekly: 1 }).ok).toBe(true)
  })
})

describe('deadline ladders', () => {
  it('sends only the closest due step, never backwards', () => {
    expect(dueLadderStep(at(60 * H), now, [72, 24, 2], [])).toBe(72)
    expect(dueLadderStep(at(10 * H), now, [72, 24, 2], [])).toBe(24)
    expect(dueLadderStep(at(10 * H), now, [72, 24, 2], ['24h'])).toBeNull()
    expect(dueLadderStep(at(60 * H), now, [72, 24, 2], ['2h'])).toBeNull()
    expect(dueLadderStep(at(-H), now, [72], [])).toBeNull()
    expect(dueLadderStep(null, now, [72], [])).toBeNull()
  })
  it('invite ladder: 72 h and 2 h only, stop on submission, 24 h belongs to the cron', () => {
    const inv = { status: 'pending', expires_at: at(70 * H) }
    expect(inviteLadderStep(inv, now, false)).toBe(72)
    expect(inviteLadderStep(inv, now, true)).toBeNull()
    expect(inviteLadderStep({ ...inv, expires_at: at(20 * H) }, now, false)).toBeNull()
    expect(inviteLadderStep({ ...inv, expires_at: at(H) }, now, false)).toBe(2)
    expect(inviteLadderStep({ ...inv, expires_at: at(H), reminder_steps: ['2h'] }, now, false)).toBeNull()
    expect(inviteLadderStep({ ...inv, status: 'used' }, now, false)).toBeNull()
    // The cron already sent 24 h: no going back to the 72 h step.
    expect(inviteLadderStep({ status: 'pending', expires_at: at(60 * H), reminded_at: at(-H) }, now, false)).toBeNull()
  })
  it('certificate renewal: 14 and 1 day after the existing 60-day notice, stop when renewed', () => {
    expect(certRenewalStep({ status: 'active', expires_at: at(13 * D), reminder_sent_at: at(-40 * D) }, now, false)).toBe(14)
    expect(certRenewalStep({ status: 'active', expires_at: at(20 * H) }, now, false)).toBe(1)
    expect(certRenewalStep({ status: 'active', expires_at: at(50 * D) }, now, false)).toBeNull()
    expect(certRenewalStep({ status: 'renewed', expires_at: at(13 * D) }, now, false)).toBeNull()
    expect(certRenewalStep({ status: 'active', expires_at: at(13 * D), renewal_steps: ['336h'] }, now, false)).toBeNull()
  })
})

describe('learner pick', () => {
  const plan = {
    status: 'active',
    weak_areas: [{ key: 'dsa::graphs', label: 'Graphs', priority: 5, mastery: 0.3 }, { key: 'sql', label: 'SQL', priority: 2, mastery: 0.5 }],
    week: { items: [
      { id: '1', title: 'SQL joins', href: '/practice/sql', area_key: 'sql', kind: 'practice' },
      { id: '2', title: 'BFS post', href: '/learn/bfs', area_key: 'dsa::graphs', kind: 'learn' },
      { id: '3', title: 'Graph set', href: '/practice/graphs', area_key: 'dsa::graphs', kind: 'practice' },
    ] },
  }
  it('takes practice in the highest-priority weak area', () => {
    expect(pickForLearner(plan)).toEqual({ title: 'Graph set', href: '/practice/graphs', area: 'Graphs' })
  })
  it('skips done items, external links and inactive plans', () => {
    expect(pickForLearner({ ...plan, week: { items: [{ id: 'x', title: 'X', href: 'https://evil.example', kind: 'practice' }] } })).toBeNull()
    expect(pickForLearner({ ...plan, status: 'finished' })).toBeNull()
    expect(pickForLearner(null)).toBeNull()
  })
})

describe('checkout recovery', () => {
  const o = { status: 'created', created_at: at(-2 * H) }
  it('1 h resume, 24 h coupon, gives up after 3 days or once paid', () => {
    expect(checkoutRecoveryStep(o, now, [], false)).toBe('1h')
    expect(checkoutRecoveryStep({ ...o, created_at: at(-30 * H) }, now, ['1h'], false)).toBe('24h')
    expect(checkoutRecoveryStep({ ...o, created_at: at(-30 * H) }, now, ['24h'], false)).toBeNull()
    expect(checkoutRecoveryStep({ ...o, created_at: at(-4 * D) }, now, [], false)).toBeNull()
    expect(checkoutRecoveryStep({ ...o, created_at: at(-20 * 60_000) }, now, [], false)).toBeNull()
    expect(checkoutRecoveryStep(o, now, [], true)).toBeNull()
    expect(checkoutRecoveryStep({ ...o, status: 'paid' }, now, [], false)).toBeNull()
  })
  it('coupon codes look right and are unguessable-ish', () => {
    const c = recoveryCouponCode()
    expect(c).toMatch(/^BACK-[A-HJ-NP-Z2-9]{8}$/)
    expect(recoveryCouponCode(() => 0)).toBe('BACK-AAAAAAAA')
  })
  it('auto-renew detection', () => {
    expect(autoRenews({ status: 'active', billing_mode: 'stripe_subscription' })).toBe(true)
    expect(autoRenews({ status: 'active', billing_mode: 'stripe_subscription', cancel_at_period_end: true })).toBe(false)
    expect(autoRenews({ status: 'active', billing_mode: 'prepaid' })).toBe(false)
  })
})

describe('drives, offers, background checks', () => {
  it('no-shows only after joining closed + grace', () => {
    const closed = driveClosedAt({ start_at: at(-3 * H), duration_min: 60, late_join_min: 15 })
    expect(isDriveNoShow({ state: 'not_started', started_at: null }, closed, now)).toBe(true)
    expect(isDriveNoShow({ state: 'submitted' }, closed, now)).toBe(false)
    expect(isDriveNoShow({ state: 'not_started' }, driveClosedAt({ start_at: at(-H), duration_min: 45 }), now)).toBe(false)
  })
  it('offer steps: 2 d candidate, 5 d recruiter, expiry at the deadline', () => {
    const entered = at(-2.5 * D)
    const deadline = offerDeadline(entered, null, 7)
    expect(offerStep(entered, now, deadline, [])).toBe('candidate_2d')
    expect(offerStep(entered, now, deadline, ['candidate_2d'])).toBeNull()
    expect(offerStep(at(-5.5 * D), now, offerDeadline(at(-5.5 * D), null, 7), ['candidate_2d'])).toBe('recruiter_5d')
    expect(offerStep(at(-8 * D), now, offerDeadline(at(-8 * D), null, 7), ['candidate_2d', 'recruiter_5d'])).toBe('expired')
    expect(offerStep(at(-8 * D), now, offerDeadline(at(-8 * D), null, 7), ['expired'])).toBeNull()
    expect(offerDeadline(entered, '2026-03-04T00:00:00Z', 7)).toBe('2026-03-04T00:00:00.000Z')
  })
  it('BGV overdue counts vendor checks in progress past the SLA only', () => {
    expect(bgvDaysOverdue({ status: 'in_progress' }, at(-8.5 * D), now, 7)).toBe(2)
    expect(bgvDaysOverdue({ status: 'in_progress' }, at(-3 * D), now, 7)).toBe(0)
    expect(bgvDaysOverdue({ status: 'verified' }, at(-30 * D), now, 7)).toBe(0)
    expect(bgvDaysOverdue({ status: 'in_progress', info_request: { message: 'x' } }, at(-30 * D), now, 7)).toBe(0)
  })
})

describe('mentor sessions', () => {
  const b = { end: at(-20 * 60_000), status: 'booked' }
  it('no-show sides for built-in video, rating ask later, nothing for cancelled', () => {
    expect(sessionOutcome(b, null, true, now, false)).toBe('no_show_both')
    expect(sessionOutcome(b, { buyer: 'x' }, true, now, false)).toBe('no_show_mentor')
    expect(sessionOutcome(b, { mentor: 'x' }, true, now, false)).toBe('no_show_learner')
    expect(sessionOutcome(b, { buyer: 'x', mentor: 'y' }, true, now, false)).toBe('wait')
    expect(sessionOutcome({ ...b, end: at(-3 * H) }, { buyer: 'x', mentor: 'y' }, true, now, false)).toBe('feedback')
    expect(sessionOutcome({ ...b, end: at(-3 * H) }, null, false, now, true)).toBe('done')
    expect(sessionOutcome({ ...b, status: 'cancelled' }, null, true, now, false)).toBe('done')
    expect(sessionOutcome({ end: at(-5 * 60_000) }, null, true, now, false)).toBe('wait')
  })
})

describe('weekly employer report', () => {
  it('due Monday from 09:00 in the member’s time zone', () => {
    // Monday 2026-03-02 10:00 UTC = 15:30 IST, 05:00 New York.
    expect(weeklyReportDue(now, 'Asia/Kolkata')).toBe('2026-03-02')
    expect(weeklyReportDue(now, 'America/New_York')).toBeNull()
    expect(weeklyReportDue(new Date('2026-03-03T10:00:00Z'), 'UTC')).toBeNull()
    expect(weeklyReportDue(now, 'Not/AZone')).toBe('2026-03-02')
  })
  it('empty weeks send nothing; pass rate rounds', () => {
    const empty = { tests_sent: 0, tests_completed: 0, pass_rate: null, integrity_flags: 3, stage_moves: 0, hires: 0, drives: 0, drive_candidates: 0, talent_accepted: 0 }
    expect(employerWeekEmpty(empty)).toBe(true)
    expect(employerWeekEmpty({ ...empty, hires: 1 })).toBe(false)
    expect(passRate([{ score: 1, max: 1, pass: 100 }, { score: 0, max: 1, pass: 100 }, { score: 1, max: 1, pass: 100 }])).toBe(67)
    expect(passRate([])).toBeNull()
  })
})

describe('feed source health', () => {
  const pull = (n: number, ok: boolean) => ({ id: 's', last_run_at: at(n * H), ok, error: ok ? null : 'boom' })
  it('counts each pull once, alerts at 3 bad, disables after 7 days, resets on success', () => {
    let h = nextSourceHealth(null, pull(-200, false))
    h = nextSourceHealth(h, pull(-200, false)) // same pull again: no change
    expect(h.bad_streak).toBe(1)
    h = nextSourceHealth(nextSourceHealth(h, pull(-100, false)), pull(-50, false))
    expect(h.bad_streak).toBe(3)
    expect(sourceHealthAction(h, now)).toBe('disable')
    expect(sourceHealthAction({ ...h, first_bad_at: at(-2 * D) }, now)).toBe('alert')
    expect(sourceHealthAction({ ...h, first_bad_at: at(-2 * D), alerted_at: at(-H) }, now)).toBeNull()
    expect(nextSourceHealth(h, pull(-1, true)).bad_streak).toBe(0)
  })
})

describe('content freshness', () => {
  it('flags age, deprecated APIs and dead links', () => {
    expect(stalenessReasons({ updated_at: at(-400 * D), text: 'fine' }, now)).toEqual(['older_than_12_months'])
    expect(stalenessReasons({ updated_at: at(-D), text: 'use componentWillMount and urllib2' }, now)).toEqual(['deprecated:React legacy lifecycle methods', 'deprecated:urllib2 (Python 2)'])
    expect(stalenessReasons({ updated_at: at(-D), text: 'ok', dead_links: 2 }, now)).toEqual(['dead_links:2'])
  })
  it('extracts links', () => {
    expect(extractLinks('see https://a.dev/x. and (https://b.dev/y) https://a.dev/x', 5)).toEqual(['https://a.dev/x', 'https://b.dev/y'])
  })
})

describe('cohorts and talent invites', () => {
  it('at risk on 2 missed assignments or 7 quiet days', () => {
    const base = { pastDue: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], submittedIds: new Set(['a']), lastActivityAt: at(-D), joinedAt: at(-30 * D) }
    expect(cohortRisk(base, now)).toMatchObject({ at_risk: true, missed: 2, reasons: ['missed_assignments'] })
    expect(cohortRisk({ ...base, submittedIds: new Set(['a', 'b']), lastActivityAt: at(-8 * D) }, now)).toMatchObject({ at_risk: true, reasons: ['inactive'], days_inactive: 8 })
    expect(cohortRisk({ ...base, submittedIds: new Set(['a', 'b']) }, now).at_risk).toBe(false)
  })
  it('talent invite reminders: day 3 and last day, only while pending', () => {
    const inv = { status: 'pending', created_at: at(-3.5 * D), expires_at: at(5 * D) }
    expect(talentInviteStep(inv, now, [])).toBe('day3')
    expect(talentInviteStep(inv, now, ['day3'])).toBeNull()
    expect(talentInviteStep({ ...inv, expires_at: at(10 * H) }, now, ['day3'])).toBe('last_day')
    expect(talentInviteStep({ ...inv, status: 'accepted' }, now, [])).toBeNull()
  })
})

describe('messages and templates', () => {
  const ids: [string, string[]][] = [
    ['inviteSoon', []], ['inviteLast', []], ['comeBack', ['bodyNoArea', 'streak']], ['comeBackRebuild', []], ['checkout', []], ['checkoutCoupon', []], ['checkoutLate', []],
    ['licenceRenewal', []], ['autoRenew', []], ['certRenew', []], ['certLast', []], ['driveTomorrow', []], ['driveSoon', []], ['offerWaiting', []], ['offerWaitingNoDate', []],
    ['bgvWeekly', []], ['weekly', ['tests', 'passRate', 'flags', 'pipeline', 'drives', 'talent']], ['cohortRisk', ['bodyMissed']], ['cohortStaff', []],
    ['sessionFeedback', []], ['mentorNoShow', []], ['learnerNoShow', []], ['referralReward', ['bodyMonth', 'share']], ['talentInvite', ['bodyLast']],
  ]
  it('every nudge email has its catalog keys in all languages', () => {
    for (const [id, extra] of ids) {
      for (const part of ['subject', 'heading', 'body', 'reason', ...extra]) expect(hasOutboundKey('email', `auto.nudge.${id}.${part}`), `${id}.${part}`).toBe(true)
      for (const l of ['hi', 'te'] as const) expect(OUTBOUND_CATALOGS.email[l][`auto.nudge.${id}.subject`], `${l} ${id}`).toBeTruthy()
    }
  })
  it('renders English from the catalog with keys for other languages', () => {
    const m = nudgeMail({ id: 'inviteLast', category: 'assessment', params: { exam: 'DSA', date: '2 Mar' }, name: 'Asha', cta: { url: '/x' } })
    expect(m.subject).toBe('Last chance: DSA closes in 2 hours')
    expect(m.bodyText).toContain('Hi Asha,')
    expect(m.cta?.label).toBe('Take the test now')
    expect(m.i18n?.subject.key).toBe('auto.nudge.inviteLast.subject')
    const n = nudgeNote('offer', { title: 'expiredTitle', message: 'expiredMessage' }, { job: 'SDE', candidate: 'Asha' })
    expect(n.title).toBe('Offer expired: SDE')
    expect(hasOutboundKey('notify', n.message_i18n.key)).toBe(true)
  })
  it('new templates use known events and are organisation-safe', () => {
    const ours = ['invite-ladder', 'offer-follow-ups', 'offer-expired-alert', 'drive-no-show-follow-up', 'bgv-overdue-alert', 'cohort-at-risk', 'talent-invite-follow-up', 'licence-renewal-alert']
    for (const id of ours) {
      const t = WORKFLOW_TEMPLATES.find((x) => x.id === id)
      expect(t, id).toBeTruthy()
      expect(t!.platformOnly).toBeFalsy()
      expect(isKnownEventType(t!.event_type)).toBe(true)
    }
  })
  it('settings validation keeps safe bounds', () => {
    expect(NudgeSettingsPatch.safeParse({ checkout_coupon_pct: 50 }).success).toBe(false)
    expect(NudgeSettingsPatch.safeParse({ cap_daily: 0 }).success).toBe(false)
    expect(NudgeSettingsPatch.safeParse({ cap_daily: 3, freshness_ai_monthly_usd: 1.5 }).success).toBe(true)
    expect(NudgeSettingsPatch.safeParse({ unknown: 1 }).success).toBe(false)
  })
})

/**
 * Audit-7 fixes: AUTO-110 (mentor no-show notice is transactional), AUTO-111
 * (always-on pre-charge notice), AUTO-112 (offers are unsubscribable marketing),
 * CORE-052 / AGT-046 (held offers / reminders retried, not marked done),
 * CORE-053 (recruiter told when the "pick a time" e-mail was not sent).
 * Run: npx vitest run tests/audit7-fix-messaging-offers.test.ts
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NOTIFICATION_BUDGET_CLASS, notificationMailCategory } from '@/lib/notifications'
import { BILLING_NUDGE_AUTOMATIONS } from '@/lib/automation/system/nudges-billing'
import { pendingGiveUp, PENDING_MAX_DAYS } from '@/lib/assistants/store'
import { inviteNoticeKey } from '@/lib/ats/interviews/notify'

const ROOT = join(__dirname, '..')
const src = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const NOW = new Date('2026-10-24T10:00:00Z')
const DAY = 86_400_000

describe('AUTO-112: win-back / upgrade offers are marketing e-mail', () => {
  it('capped as marketing and sent with an unsubscribable category', () => {
    for (const t of ['billing.winback_offer', 'billing.upgrade_offer']) {
      expect(NOTIFICATION_BUDGET_CLASS[t]).toBe('marketing')
      expect(notificationMailCategory(t, 'billing')).toBe('engagement')
    }
  })
  it('real billing / security notices stay non-unsubscribable', () => {
    expect(notificationMailCategory('billing.payment_failed', 'billing')).toBe('billing')
    expect(notificationMailCategory('billing.plan_expiring', 'billing')).toBe('billing')
    expect(notificationMailCategory('auth.login', 'security')).toBe('security')
    expect(notificationMailCategory('interview.scheduled', 'hiring')).toBe('transactional')
  })
})

describe('AUTO-111: pre-charge notice for auto-renew is always on', () => {
  it('its own locked automation, separate from the off-by-default renewal nudges', () => {
    const notice = BILLING_NUDGE_AUTOMATIONS.find((a) => a.id === 'auto-renew-notice')
    expect(notice?.locked).toBe(true)
    expect(notice?.run).toBeTypeOf('function')
    expect(BILLING_NUDGE_AUTOMATIONS.find((a) => a.id === 'renewal-nudges')?.defaultOn).toBe(false)
  })
  it('sent as an uncapped legal notice', () => {
    const s = src('lib/automation/system/nudges-billing.ts')
    const body = s.slice(s.indexOf('export async function runAutoRenewNotices'))
    expect(body).toMatch(/class: 'legal', topic: 'auto-renew-notice'/)
  })
})

describe('AUTO-110: missed paid session notice to the learner', () => {
  it('is transactional (never held by the cap)', () => {
    const s = src('lib/automation/system/nudges-learning.ts')
    expect(s).toMatch(/noshow:buyer`, now, priority: 'high', class: 'transactional'/)
  })
})

describe('CORE-052 / AGT-046: held sends', () => {
  it('retry for at most PENDING_MAX_DAYS attempts or days', () => {
    const created = new Date(NOW.getTime() - DAY).toISOString()
    expect(pendingGiveUp(1, created, NOW)).toBe(false)
    expect(pendingGiveUp(PENDING_MAX_DAYS, created, NOW)).toBe(true)
    expect(pendingGiveUp(1, new Date(NOW.getTime() - (PENDING_MAX_DAYS + 1) * DAY).toISOString(), NOW)).toBe(true)
    expect(pendingGiveUp(1, 'not a date', NOW)).toBe(true)
  })
  it('offers mark done only when delivered; the win-back checks room before minting', () => {
    const s = src('lib/assistants/revenue/service.ts')
    expect(s).toMatch(/if \(sent\) await markOnce\('revenue', `done:\$\{signalKey\}`/)
    const wb = s.slice(s.indexOf('export async function sendWinbackOffer'), s.indexOf('export async function retryHeldSends'))
    expect(wb.indexOf('budgetHasRoom')).toBeGreaterThan(-1)
    expect(wb.indexOf('budgetHasRoom')).toBeLessThan(wb.indexOf('createCoupon('))
    expect(s).toMatch(/retryHeldSends\(now\)/)
  })
  it('placement releases the cooldown and pro-certs unclaim the reminder when held', () => {
    expect(src('lib/assistants/placement/service.ts')).toMatch(/releaseMark\('placement', `nudge:\$\{st\.id\}`\)/)
    expect(src('lib/pro-certs/service.ts')).toMatch(/\$set: \{ reminder_sent_at: null \}/)
  })
})

describe('CORE-053: recruiter notice when the invite e-mail did not go out', () => {
  it('no notice when it was e-mailed', () => {
    expect(inviteNoticeKey({ email: 'sent', whatsapp: false })).toBeNull()
    expect(inviteNoticeKey({ email: 'sent', whatsapp: true })).toBeNull()
  })
  it('says why, and whether WhatsApp went', () => {
    expect(inviteNoticeKey({ email: 'unsubscribed', whatsapp: false })).toBe('interview.inviteNotSentUnsubscribed')
    expect(inviteNoticeKey({ email: 'unsubscribed', whatsapp: true })).toBe('interview.inviteNotSentUnsubscribedWa')
    expect(inviteNoticeKey({ email: 'no_email', whatsapp: false })).toBe('interview.inviteNotSentNoEmail')
    expect(inviteNoticeKey({ email: 'failed', whatsapp: true })).toBe('interview.inviteNotSentFailedWa')
  })
  it('every key exists in en / hi / te', () => {
    for (const l of ['en', 'hi', 'te']) {
      const n = JSON.parse(src(`lib/i18n/messages/${l}/notify.json`)) as Record<string, string>
      for (const why of ['Unsubscribed', 'NoEmail', 'Failed']) for (const wa of ['', 'Wa']) expect(n[`interview.inviteNotSent${why}${wa}`]).toContain('{name}')
      expect(n['interview.inviteNotSentTitle']).toBeTruthy()
      const h = JSON.parse(src(`lib/i18n/messages/${l}/hiring.json`)) as Record<string, string>
      for (const k of ['inviteNotSentUnsubscribed', 'inviteNotSentNoEmail', 'inviteNotSentFailed', 'inviteWentByWhatsapp', 'inviteShareAnotherWay']) expect(h[k]).toBeTruthy()
    }
  })
})

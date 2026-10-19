/**
 * sendEmail respects the suppression list (A-038) and queues temporary
 * failures in the outbox (A-036); automation emails carry a working signed
 * unsubscribe link and honour unsubscribes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FakeDb } from './helpers/fake-mongo'

const db = { current: new FakeDb() }
vi.mock('@/lib/mongodb', () => ({ getMongoDb: async () => db.current }))
const postal = { mode: 'ok' as 'ok' | 'down' | 'reject', sent: [] as string[] }
vi.mock('@/lib/transactional-mail', () => ({
  sendEmailViaPostal: vi.fn(async (p: { to: string }) => {
    if (postal.mode === 'down') throw new Error('Postal API error (502): bad gateway')
    if (postal.mode === 'reject') throw new Error('Postal API error (422): invalid address')
    postal.sent.push(p.to)
    return { messageId: 123 }
  }),
}))

import { sendEmail } from '@/lib/send-email'
import { suppressAddress } from '@/lib/automation/outbox'
import { __resetAutomationIndexes } from '@/lib/automation/store'
import { isUnsubscribed, recordUnsubscribe, renderAutomationEmail, unsubscribeToken, unsubscribeUrl, verifyUnsubscribeToken, sendAutomationEmail } from '@/lib/automation/mailer'

beforeEach(() => {
  db.current = new FakeDb()
  __resetAutomationIndexes()
  postal.mode = 'ok'
  postal.sent = []
})

describe('sendEmail', () => {
  it('skips suppressed addresses', async () => {
    await suppressAddress('bounce@x.io', 'hard_bounce')
    const r = await sendEmail('Bounce@x.io', { subject: 's', html: 'h' })
    expect(r).toMatchObject({ success: false, suppressed: true })
    expect(postal.sent).toEqual([])
    expect((await sendEmail('fine@x.io', { subject: 's', html: 'h' })).success).toBe(true)
  })
  it('queues temporary failures, not permanent ones', async () => {
    postal.mode = 'down'
    const r = await sendEmail('a@x.io', { subject: 's', html: 'h' })
    expect(r).toMatchObject({ success: false, queued: true })
    postal.mode = 'reject'
    const r2 = await sendEmail('b@x.io', { subject: 's', html: 'h' })
    expect(r2.queued).toBeUndefined()
    expect(db.current.collection('email_outbox').docs.map((d) => d.to)).toEqual(['a@x.io'])
    // A retry from the outbox itself is never queued again.
    postal.mode = 'down'
    await sendEmail('c@x.io', { subject: 's', html: 'h' }, undefined, { outboxId: 'o1' })
    expect(db.current.collection('email_outbox').docs).toHaveLength(1)
  })
})

describe('automation emails', () => {
  it('signs unsubscribe links per address and scope', () => {
    const t = unsubscribeToken('a@x.io', 'engagement')
    expect(verifyUnsubscribeToken('A@x.io', 'engagement', t)).toBe(true)
    expect(verifyUnsubscribeToken('a@x.io', 'all', t)).toBe(false)
    expect(verifyUnsubscribeToken('b@x.io', 'engagement', t)).toBe(false)
    expect(unsubscribeUrl('a@x.io', 'events')).toContain('/api/automation/unsubscribe?e=a%40x.io&s=events&t=')
  })
  it('renders an unsubscribe footer and escapes content', () => {
    const html = renderAutomationEmail({ heading: '<Hi>', bodyText: 'a & b\n\nnext', cta: { label: 'Go', url: '/dashboard' } }, { unsubscribeUrl: 'https://u/unsub', manageUrl: 'https://u/prefs', category: 'engagement' })
    expect(html).toContain('&lt;Hi&gt;')
    expect(html).toContain('a &amp; b')
    expect(html).toContain('href="https://u/unsub"')
    expect(html).toMatch(/Unsubscribe from tips and reminders/)
    // javascript: links are never rendered as buttons
    expect(renderAutomationEmail({ heading: 'x', bodyText: 'y', cta: { label: 'X', url: 'javascript:alert(1)' } }, { unsubscribeUrl: 'u', manageUrl: 'm', category: 'events' })).not.toContain('javascript:')
  })
  it('honours unsubscribes (billing notices still go out) and the once-key', async () => {
    await recordUnsubscribe('a@x.io', 'engagement')
    expect(await isUnsubscribed('a@x.io', 'engagement')).toBe(true)
    expect(await isUnsubscribed('a@x.io', 'events')).toBe(false)
    expect(await sendAutomationEmail({ to: 'a@x.io', subject: 's', heading: 'h', bodyText: 'b', category: 'engagement' })).toBe('skipped_unsubscribed')
    expect(await sendAutomationEmail({ to: 'a@x.io', subject: 's', heading: 'h', bodyText: 'b', category: 'billing', onceKey: 'k1' })).toBe('sent')
    expect(await sendAutomationEmail({ to: 'a@x.io', subject: 's', heading: 'h', bodyText: 'b', category: 'billing', onceKey: 'k1' })).toBe('duplicate')
    await recordUnsubscribe('z@x.io', 'all')
    expect(await sendAutomationEmail({ to: 'z@x.io', subject: 's', heading: 'h', bodyText: 'b', category: 'events' })).toBe('skipped_unsubscribed')
  })
  it('respects a user who switched email off', async () => {
    await db.current.collection('user').insertOne({ id: 'u1', email: 'off@x.io' })
    await db.current.collection('notification_preferences').insertOne({ user_id: 'u1', type: 'email', enabled: false })
    expect(await sendAutomationEmail({ to: 'off@x.io', subject: 's', heading: 'h', bodyText: 'b', category: 'events' })).toBe('skipped_preferences')
  })
})

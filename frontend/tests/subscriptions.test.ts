/**
 * Subscriptions (lib/subscriptions) + events notifications: double opt-in,
 * explicit WhatsApp consent with YES/STOP keywords, unsubscribe tokens,
 * filter matching, quiet hours / 24 h session rule, idempotent sends with
 * retries, bounces, weekly digest + alerts on an in-memory DB.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeDb } from './helpers/fake-mongo'

const db = vi.hoisted(() => ({ current: null as unknown as import('./helpers/fake-mongo').FakeDb }))
const mail = vi.hoisted(() => ({ sent: [] as { to: string; subject: string; html: string }[], fail: false, id: 0 }))

vi.mock('@/lib/mongodb', () => ({ getMongoDb: async () => db.current }))
vi.mock('@/lib/upstash-rate-limit', () => ({ rateLimitRedis: async () => ({ ok: true }) }))
vi.mock('@/lib/send-email', () => ({
  sendEmail: vi.fn(async (to: string, t: { subject: string; html: string }) => {
    if (mail.fail) return { success: false, postalMessageId: null, error: `rejected ${to}` }
    mail.sent.push({ to, ...t })
    return { success: true, postalMessageId: ++mail.id, error: null }
  }),
}))
vi.mock('@/lib/ats/screening/config', () => ({ getPlatformConfig: async () => ({ whatsapp: {} }), whatsappReady: () => false }))
vi.mock('@/lib/session', async () => {
  const { createHmac } = await import('node:crypto')
  const KEY = 'test-secret'
  const sig = (s: string) => createHmac('sha256', KEY).update(s).digest('base64url')
  return {
    deriveServerKey: async (label: string) => new Uint8Array(createHmac('sha256', KEY).update(label).digest()),
    signPurposeToken: async (purpose: string, data: Record<string, unknown>) => {
      const body = Buffer.from(JSON.stringify({ purpose, data, exp: Date.now() + 72 * 3600_000 })).toString('base64url')
      return `${body}.${sig(body)}`
    },
    verifyPurposeToken: async (purpose: string, token: string) => {
      const [body, s] = String(token || '').split('.')
      if (!body || sig(body) !== s) return null
      const p = JSON.parse(Buffer.from(body, 'base64url').toString())
      return p.purpose === purpose && p.exp > Date.now() ? p.data : null
    },
  }
})

import {
  subscribe, confirmEmail, unsubscribe, updatePreferences, getByLink, handleWhatsAppInbound, handleEmailBounce,
  sendSubscriberEmail, sendSubscriberWhatsApp, setSavedEvent, subscribersCsv, unsubscribePatch, matchesEventFilters,
  normalizeEventFilters, inQuietHours, inWhatsAppSession, linkToken, deliveryKey,
} from '@/lib/subscriptions'
import { __resetSubscriptionIndexes } from '@/lib/subscriptions/store'
import { __resetSubscriptionSettingsCache } from '@/lib/subscriptions/settings'
import { linkTokenWithKey, verifyLinkTokenWithKey } from '@/lib/subscriptions/tokens'
import { simulatedOutbox } from '@/lib/ats/screening/providers/whatsapp'
import { runAlerts, runDigest, runReminders } from '@/lib/events-feed/notify'
import { EVENTS_FEED_DEFAULTS } from '@/lib/events-feed/settings'
import { toDoc } from '@/lib/events-feed/pipeline'
import { sanitizeEvent } from '@/lib/events-feed/normalize'
import { __resetEventsFeedIndexes } from '@/lib/events-feed/store'
import type { SubscriberDoc } from '@/lib/subscriptions/types'

const subs = () => db.current.collection('subscriptions').docs as unknown as SubscriberDoc[]
const tokenFrom = (html: string) => decodeURIComponent(html.match(/subscriptions\/confirm\?t=([^"&]+)/)![1])

beforeEach(() => {
  db.current = new FakeDb()
  __resetSubscriptionIndexes()
  __resetSubscriptionSettingsCache()
  __resetEventsFeedIndexes()
  mail.sent = []
  mail.fail = false
  simulatedOutbox.length = 0
})

describe('pure helpers', () => {
  it('event filter matching: kinds, themes, prize, online vs countries', () => {
    const ev = { kind: 'hackathon' as const, mode: 'in_person' as const, country: 'IN', themes: ['ai-ml'], prize_usd_minor: 50_000 }
    expect(matchesEventFilters(ev, undefined)).toBe(true)
    expect(matchesEventFilters(ev, { kinds: ['ctf'] })).toBe(false)
    expect(matchesEventFilters(ev, { themes: ['AI ML'] })).toBe(true)
    expect(matchesEventFilters(ev, { min_prize_usd_minor: 100_000 })).toBe(false)
    expect(matchesEventFilters(ev, { modes: ['online'] })).toBe(false)
    expect(matchesEventFilters(ev, { modes: ['online'], countries: ['IN'] })).toBe(true)
    expect(matchesEventFilters({ ...ev, mode: 'online', country: null }, { modes: ['online'], countries: ['US'] })).toBe(true)
    expect(matchesEventFilters({ ...ev, mode: 'hybrid' }, { countries: ['IN'] })).toBe(true)
    expect(matchesEventFilters({ ...ev, country: 'US' }, { modes: ['in_person'], countries: ['IN'] })).toBe(false)
    expect(normalizeEventFilters({ kinds: ['hackathon', 'bogus'], countries: ['in', 'India'], themes: ['AI / ML'], min_prize_usd_minor: 1.5 })).toEqual({ kinds: ['hackathon'], countries: ['IN'], themes: ['ai-ml'] })
  })
  it('quiet hours (wrapping midnight, per time zone) and the 24 h session window', () => {
    const at = new Date('2026-10-19T17:00:00Z') // 22:30 IST, 13:00 New York
    expect(inQuietHours(at, 'Asia/Kolkata', 21, 8)).toBe(true)
    expect(inQuietHours(at, 'America/New_York', 21, 8)).toBe(false)
    expect(inQuietHours(at, 'Asia/Kolkata', 9, 9)).toBe(false)
    expect(inWhatsAppSession('2026-10-19T00:00:00Z', at)).toBe(true)
    expect(inWhatsAppSession('2026-10-18T16:00:00Z', at)).toBe(false)
    expect(inWhatsAppSession(null, at)).toBe(false)
  })
  it('link tokens: bound to id, nonce and scope', () => {
    const key = new Uint8Array(32).fill(1)
    const t = linkTokenWithKey(key, 's1', 'n1', 'manage')
    expect(verifyLinkTokenWithKey(key, 's1', 'n1', 'manage', t)).toBe(true)
    expect(verifyLinkTokenWithKey(key, 's2', 'n1', 'manage', t)).toBe(false)
    expect(verifyLinkTokenWithKey(key, 's1', 'n2', 'manage', t)).toBe(false)
    expect(verifyLinkTokenWithKey(key, 's1', 'n1', 'email', t)).toBe(false)
    expect(verifyLinkTokenWithKey(key, 's1', 'n1', 'manage', 'x'.repeat(32))).toBe(false)
  })
  it('unsubscribe scopes', () => {
    const s = { email_status: 'active' as const, whatsapp_status: 'active' as const, topics: ['events' as const, 'blog' as const] }
    expect(unsubscribePatch(s, 'topic:blog')).toEqual({ topics: ['events'] })
    expect(unsubscribePatch({ ...s, topics: ['events'] }, 'topic:events')).toMatchObject({ topics: [], email_status: 'unsubscribed', whatsapp_status: 'unsubscribed' })
    expect(unsubscribePatch(s, 'email')).toEqual({ email_status: 'unsubscribed' })
    expect(unsubscribePatch({ ...s, email_status: 'bounced' as never }, 'all')).toMatchObject({ email_status: 'bounced', whatsapp_status: 'unsubscribed', topics: [] })
  })
  it('CSV export neutralises formulas', () => {
    const csv = subscribersCsv([{ id: '1', email: '=cmd@x.com', email_status: 'active', phone: null, whatsapp_status: 'none', topics: ['events'], filters: {}, timezone: 'UTC', created_at: 'now' } as unknown as SubscriberDoc])
    expect(csv.split('\n')[1]).toContain("'=cmd@x.com")
  })
})

describe('email double opt-in', () => {
  it('pending until the link is confirmed; link is single-use', async () => {
    const r = await subscribe({ email: 'Asha@Example.com', channels: ['email'], topics: ['events'], filters: { events: { kinds: ['hackathon'] } } })
    expect(r).toMatchObject({ ok: true, email: 'confirmation_sent' })
    expect(subs()[0]).toMatchObject({ email: 'asha@example.com', email_status: 'pending' })
    expect(mail.sent).toHaveLength(1)
    expect(mail.sent[0].html).toContain('Unsubscribe')
    const token = tokenFrom(mail.sent[0].html)
    expect((await confirmEmail('garbage')).ok).toBe(false)
    const c = await confirmEmail(token)
    expect(c.ok).toBe(true)
    expect(subs()[0]).toMatchObject({ email_status: 'active', topics: ['events'], filters: { events: { kinds: ['hackathon'] } }, pending: null })
    expect(await confirmEmail(token)).toMatchObject({ ok: true, already: true })
  })

  it('a public request cannot change an active subscriber’s topics without confirmation', async () => {
    await subscribe({ email: 'a@x.com', user_id: 'u1', channels: ['email'], topics: ['events'] }, { emailVerified: true })
    expect(subs()[0]).toMatchObject({ email_status: 'active', topics: ['events'] })
    expect(mail.sent).toHaveLength(0) // own account email: no double opt-in
    await subscribe({ email: 'a@x.com', channels: ['email'], topics: ['blog'] })
    expect(subs()[0].topics).toEqual(['events'])
    expect(subs()[0].pending?.topics).toEqual(['events', 'blog'])
    await confirmEmail(tokenFrom(mail.sent[0].html))
    expect(subs()[0].topics).toEqual(['events', 'blog'])
  })

  it('validates input', async () => {
    expect(await subscribe({ email: 'nope', channels: ['email'], topics: ['events'] })).toMatchObject({ ok: false })
    expect(await subscribe({ email: 'a@x.com', channels: [], topics: ['events'] })).toMatchObject({ ok: false })
    expect(await subscribe({ email: 'a@x.com', channels: ['email'], topics: ['bogus' as never] })).toMatchObject({ ok: false })
  })
})

describe('WhatsApp consent', () => {
  it('needs the consent box, stays pending until YES/START, STOP turns it off', async () => {
    expect(await subscribe({ phone: '98765 43210', channels: ['whatsapp'], topics: ['events'] })).toMatchObject({ ok: false })
    const r = await subscribe({ phone: '98765 43210', channels: ['whatsapp'], topics: ['events'], whatsapp_consent: true, timezone: 'Asia/Kolkata' })
    expect(r).toMatchObject({ ok: true, whatsapp: 'confirmation_sent' })
    expect(subs()[0]).toMatchObject({ phone: '+919876543210', whatsapp_status: 'pending' })
    expect(subs()[0].whatsapp_consent?.text).toMatch(/STOP/)
    // No opt-in template configured and no open session → nothing sent yet (they can message START).
    expect(simulatedOutbox).toHaveLength(0)

    expect(await handleWhatsAppInbound({ from: '919876543210', text: 'hello', at: new Date().toISOString() })).toBe('touched')
    expect(await handleWhatsAppInbound({ from: '919876543210', text: 'YES' })).toBe('started')
    expect(subs()[0]).toMatchObject({ whatsapp_status: 'active', topics: ['events'] })
    expect(simulatedOutbox.at(-1)?.text).toMatch(/subscribed/i) // in-session reply

    expect(await handleWhatsAppInbound({ from: '919876543210', text: 'stop' })).toBe('stopped')
    expect(subs()[0].whatsapp_status).toBe('unsubscribed')
    expect(await handleWhatsAppInbound({ from: '15550001111', text: 'STOP' })).toBe('ignored')
  })

  it('does not reply when another handler (hiring screening) already answered', async () => {
    await subscribe({ phone: '+15550002222', channels: ['whatsapp'], topics: ['events'], whatsapp_consent: true })
    await handleWhatsAppInbound({ from: '15550002222', text: 'START' }, { replied: true })
    expect(subs()[0].whatsapp_status).toBe('active')
    expect(simulatedOutbox).toHaveLength(0)
  })
})

describe('manage + unsubscribe links', () => {
  it('valid token loads and unsubscribes; wrong / rotated tokens fail', async () => {
    await subscribe({ email: 'b@x.com', user_id: 'u2', channels: ['email'], topics: ['events', 'blog'] }, { emailVerified: true })
    const sub = subs()[0]
    const t = await linkToken(sub.id, sub.token_nonce, 'manage')
    expect(await getByLink(sub.id, t)).not.toBeNull()
    expect(await getByLink(sub.id, 'x'.repeat(32))).toBeNull()
    expect((await unsubscribe(sub.id, 'bad', 'all')).ok).toBe(false)
    expect((await unsubscribe(sub.id, t, 'topic:blog')).ok).toBe(true)
    expect(subs()[0]).toMatchObject({ topics: ['events'], email_status: 'active' })
    expect((await updatePreferences(sub.id, t, { filters: { events: { modes: ['online'] } } })).ok).toBe(true)
    expect(subs()[0].filters).toEqual({ events: { modes: ['online'] } })
    expect((await unsubscribe(sub.id, t, 'email')).ok).toBe(true)
    expect(subs()[0].email_status).toBe('unsubscribed')
    subs()[0].token_nonce = 'rotated'
    expect(await getByLink(sub.id, t)).toBeNull()
  })
})

describe('idempotent sends, retries, bounces, quiet hours, 24 h rule', () => {
  async function activeSub(): Promise<SubscriberDoc> {
    await subscribe({ email: 'c@x.com', user_id: 'u3', phone: '+15550003333', channels: ['email', 'whatsapp'], topics: ['events'], whatsapp_consent: true, timezone: 'America/New_York' }, { emailVerified: true, phoneVerified: true })
    return subs()[0]
  }
  const job = { type: 'alert', ref: 'ef_1', topic: 'events' as const, subject: 'S', heading: 'H', bodyHtml: '<p>x</p>', reason: 'r' }

  it('one email per (subscriber, type, ref, channel); failed sends retry up to 3 times', async () => {
    const s = await activeSub()
    expect(await sendSubscriberEmail(s, job)).toBe('sent')
    expect(await sendSubscriberEmail(s, job)).toBe('duplicate')
    expect(mail.sent).toHaveLength(1)
    mail.fail = true
    const j2 = { ...job, ref: 'ef_2' }
    expect(await sendSubscriberEmail(s, j2)).toBe('failed')
    expect(await sendSubscriberEmail(s, j2)).toBe('failed')
    expect(await sendSubscriberEmail(s, j2)).toBe('failed')
    expect(await sendSubscriberEmail(s, j2)).toBe('duplicate') // attempts exhausted
    const row = db.current.collection('subscription_deliveries').docs.find((d) => d.key === deliveryKey(s.id, 'alert', 'ef_2', 'email'))!
    expect(row).toMatchObject({ status: 'failed', attempts: 3 })
    expect(row.error).not.toContain('c@x.com') // no PII in logs
  })

  it('bounces stop email (hard at once, soft after 3)', async () => {
    const s = await activeSub()
    await sendSubscriberEmail(s, job)
    expect(await handleEmailBounce(mail.id, 'bounced')).toBe(true)
    expect(subs()[0].email_status).toBe('bounced')
    expect(await sendSubscriberEmail(subs()[0], { ...job, ref: 'ef_9' })).toBe('skipped')
    expect(await handleEmailBounce(99999, 'bounced')).toBe(false)
  })

  it('WhatsApp: deferred in quiet hours, template outside the 24 h window, text inside it', async () => {
    const s = await activeSub()
    const night = new Date('2026-10-20T03:00:00Z') // 23:00 New York
    const day = new Date('2026-10-20T15:00:00Z') // 11:00 New York
    const wa = { type: 'alert', ref: 'ef_1', topic: 'events' as const, text: 'New event', template: { name: 'event_alert', language: 'en', params: ['T', 'D', 'L'] } }
    expect(await sendSubscriberWhatsApp(s, { ...wa, now: night })).toBe('deferred')
    expect(await sendSubscriberWhatsApp(s, { ...wa, now: day })).toBe('sent')
    expect(simulatedOutbox.at(-1)?.kind).toBe('template:event_alert')
    expect(await sendSubscriberWhatsApp(s, { ...wa, now: day })).toBe('duplicate')
    expect(await sendSubscriberWhatsApp(s, { ...wa, ref: 'ef_2', template: null, now: day })).toBe('skipped') // no template, no session
    const inSession = { ...s, whatsapp_last_inbound_at: new Date(day.getTime() - 3600_000).toISOString() }
    expect(await sendSubscriberWhatsApp(inSession, { ...wa, ref: 'ef_3', template: null, now: day })).toBe('sent')
    expect(simulatedOutbox.at(-1)?.kind).toBe('text')
    expect(await sendSubscriberWhatsApp({ ...s, whatsapp_consent: null }, { ...wa, ref: 'ef_4', now: day })).toBe('skipped')
  })
})

describe('events notifications end to end', () => {
  const NOW = new Date('2026-10-19T15:00:00Z')
  function seedEvents() {
    const col = db.current.collection('events_feed')
    const mk = (id: string, over: Record<string, unknown>) => {
      const e = sanitizeEvent({ source: 'simulated', source_id: id, title: `Event ${id}`, url: `https://e.example/${id}`, organiser: null, kind: 'hackathon', mode: 'online', location: { city: null, country: null }, starts_at: '2026-11-01T00:00:00Z', ends_at: '2026-11-02T00:00:00Z', registration_deadline: null, prize: null, themes: [], image: null, description_summary: '' })!
      col.docs.push({ ...toDoc(e, [], '2026-10-19T12:00:00.000Z'), ...over })
    }
    mk('online', {})
    mk('ctf', { kind: 'ctf' })
    mk('india', { mode: 'in_person', location: { city: 'Pune', country: 'IN' }, registration_deadline: '2026-10-20T12:00:00Z' })
    mk('hidden', { status: 'hidden' })
    return col.docs.map((d) => d.id as string)
  }

  it('weekly digest goes once per week, filtered per subscriber', async () => {
    seedEvents()
    await subscribe({ email: 'd@x.com', user_id: 'u4', channels: ['email'], topics: ['events'], filters: { events: { kinds: ['ctf'] } } }, { emailVerified: true })
    await subscribe({ email: 'e@x.com', user_id: 'u5', channels: ['email'], topics: ['blog'] }, { emailVerified: true })
    const r1 = await runDigest(NOW, EVENTS_FEED_DEFAULTS, '2026-W43')
    expect(r1.sent).toBe(1)
    expect(mail.sent).toHaveLength(1)
    expect(mail.sent[0].to).toBe('d@x.com')
    expect(mail.sent[0].html).toContain('Event ctf')
    expect(mail.sent[0].html).not.toContain('Event online')
    expect(mail.sent[0].html).not.toContain('Event hidden')
    expect(mail.sent[0].html).toMatch(/utm_source=codespectra/)
    expect(mail.sent[0].html).toContain('/subscriptions/manage?')
    const r2 = await runDigest(NOW, EVENTS_FEED_DEFAULTS, '2026-W43')
    expect(r2.duplicate).toBe(1)
    expect(mail.sent).toHaveLength(1)
  })

  it('instant WhatsApp alerts match filters, once per event', async () => {
    seedEvents()
    await subscribe({ phone: '+15550004444', user_id: 'u6', channels: ['whatsapp'], topics: ['events'], whatsapp_consent: true, filters: { events: { countries: ['IN'] } }, timezone: 'UTC' }, { phoneVerified: true })
    const settings = { ...EVENTS_FEED_DEFAULTS, whatsapp_template_alert: 'event_alert' }
    const r1 = await runAlerts(NOW, settings)
    expect(r1.sent).toBe(1)
    expect(simulatedOutbox).toHaveLength(1)
    expect(simulatedOutbox[0].text).toContain('Event india')
    expect((await runAlerts(NOW, settings)).duplicate).toBe(1)
  })

  it('deadline reminders only for saved events closing within 48 h', async () => {
    const ids = seedEvents()
    await setSavedEvent({ id: 'u7', email: 'f@x.com' }, ids[2], true, NOW)
    await setSavedEvent({ id: 'u7', email: 'f@x.com' }, ids[0], true, NOW)
    const r = await runReminders(NOW, EVENTS_FEED_DEFAULTS)
    expect(r.sent).toBe(1)
    expect(mail.sent[0]).toMatchObject({ to: 'f@x.com' })
    expect(mail.sent[0].subject).toContain('Event india')
    expect((await runReminders(NOW, EVENTS_FEED_DEFAULTS)).sent).toBe(0)
  })
})

describe('wave 3 review fixes', () => {
  it('W3-04: a signed-in user can not bind someone else’s subscription by typing their email', async () => {
    const victim = await subscribe({ email: 'victim@x.com', channels: ['email'], topics: ['events'] })
    expect(victim.ok).toBe(true)
    // attacker is signed in as u-evil, but the email is not theirs → emailVerified false
    await subscribe({ email: 'victim@x.com', user_id: 'u-evil', channels: ['email'], topics: ['blog'] }, { emailVerified: false })
    expect(subs()[0].user_id).toBeNull()
    expect(subs()[0].email_status).toBe('pending') // still needs the owner's confirmation
    // a brand-new record is not linked either until the account proves the address
    await subscribe({ email: 'other@x.com', user_id: 'u-evil', channels: ['email'], topics: ['events'] })
    expect(subs().find((s) => s.email === 'other@x.com')?.user_id).toBeNull()
    // the real owner (account email = this address) links it
    await subscribe({ email: 'victim@x.com', user_id: 'u-victim', channels: ['email'], topics: ['events'] }, { emailVerified: true })
    expect(subs()[0].user_id).toBe('u-victim')
  })

  it('W3-15: conflicts answer exactly like a fresh request and mail the manage link instead', async () => {
    await subscribe({ email: 'a1@x.com', user_id: 'u1', channels: ['email'], topics: ['events'] }, { emailVerified: true })
    await subscribe({ phone: '+15550009999', channels: ['whatsapp'], topics: ['events'], whatsapp_consent: true })
    mail.sent = []
    const fresh = await subscribe({ email: 'brand-new@x.com', phone: '+15550008888', channels: ['email', 'whatsapp'], topics: ['events'], whatsapp_consent: true })
    const clash = await subscribe({ email: 'a1@x.com', phone: '+15550009999', channels: ['email', 'whatsapp'], topics: ['events'], whatsapp_consent: true })
    const strip = (r: Record<string, unknown>) => ({ ok: r.ok, error: r.error, email: r.email, whatsapp: r.whatsapp })
    expect(strip(clash as never)).toEqual(strip(fresh as never))
    const manage = mail.sent.find((m) => m.to === 'a1@x.com')
    expect(manage?.html).toContain('/subscriptions/manage?')
    expect(subs().filter((s) => s.email === 'a1@x.com')).toHaveLength(1)
  })

  it('W3-16: STOP ALL / END / QUIT / "stop please" opt out; a failed write propagates (webhook retries)', async () => {
    for (const [n, word] of ['STOP ALL', 'end', 'Quit!', 'stop please', 'OPT-OUT'].entries()) {
      const phone = `+1555000700${n}`
      await subscribe({ phone, channels: ['whatsapp'], topics: ['events'], whatsapp_consent: true })
      await handleWhatsAppInbound({ from: phone.slice(1), text: 'YES' })
      expect(await handleWhatsAppInbound({ from: phone.slice(1), text: word })).toBe('stopped')
      expect(subs().find((s) => s.phone === phone)?.whatsapp_status).toBe('unsubscribed')
    }
    await subscribe({ phone: '+15550007777', channels: ['whatsapp'], topics: ['events'], whatsapp_consent: true })
    const c = db.current.collection('subscriptions')
    const orig = c.updateOne.bind(c)
    c.updateOne = vi.fn(async () => { throw new Error('db down') }) as never
    await expect(handleWhatsAppInbound({ from: '15550007777', text: 'STOP' })).rejects.toThrow(/db down/)
    c.updateOne = orig
    expect(await handleWhatsAppInbound({ from: '15550007777', text: 'STOP' })).toBe('stopped') // Meta's redelivery
  })
})

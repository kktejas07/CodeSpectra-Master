/**
 * PWA web push payload builder + preference rules (lib/pwa/push-payload.ts).
 * Run: npx vitest run tests/pwa-push.test.ts
 */
import { describe, it, expect } from 'vitest'
import { buildWebPushMessage, isGoneStatus, MAX_PUSH_BYTES, pushAllowed, safePushLink, serializeWebPush } from '@/lib/pwa/push-payload'
import { subscribeSchema } from '@/lib/pwa/push-schemas'

describe('buildWebPushMessage', () => {
  it('keeps title, body, link and the notification id as tag', () => {
    const m = buildWebPushMessage({ title: 'Results released', body: 'You placed 3rd', link: '/dashboard/events', data: { type: 'hackathon.results', category: 'hackathon' } }, { notificationId: 'n_1' })
    expect(m).toEqual({
      v: 1,
      title: 'Results released',
      body: 'You placed 3rd',
      url: '/dashboard/events',
      tag: 'n_1',
      data: { type: 'hackathon.results', category: 'hackathon', notification_id: 'n_1' },
    })
  })

  it('drops metadata that is not an allow-listed id (no PII on the lock screen)', () => {
    const m = buildWebPushMessage({ title: 't', data: { type: 'x', email: 'a@b.c', phone: '999', score: '88' } })
    expect(Object.keys(m.data)).toEqual(['type'])
  })

  it('clips long text and collapses whitespace', () => {
    const m = buildWebPushMessage({ title: 'x'.repeat(200), body: 'a  b\n\nc ' + 'y'.repeat(500) })
    expect(m.title.length).toBeLessThanOrEqual(80)
    expect(m.body.length).toBeLessThanOrEqual(240)
    expect(m.body.startsWith('a b c')).toBe(true)
  })

  it('falls back to a default title and the dashboard link', () => {
    const m = buildWebPushMessage({ title: '   ', link: 'https://evil.example' })
    expect(m.title).toBe('CodeSpectra')
    expect(m.url).toBe('/dashboard')
  })

  it('only allows same-origin relative links', () => {
    expect(safePushLink('/dashboard/x?y=1')).toBe('/dashboard/x?y=1')
    expect(safePushLink('//evil.example')).toBe('/dashboard')
    expect(safePushLink('/\\evil.example')).toBe('/dashboard')
    expect(safePushLink('javascript:alert(1)')).toBe('/dashboard')
    expect(safePushLink(undefined)).toBe('/dashboard')
  })
})

describe('serializeWebPush', () => {
  it('stays under the push size cap', () => {
    const m = buildWebPushMessage({ title: '标题'.repeat(40), body: '😀'.repeat(400), link: '/' + 'a'.repeat(500) })
    const out = serializeWebPush(m)
    expect(new TextEncoder().encode(out).length).toBeLessThanOrEqual(MAX_PUSH_BYTES)
    expect(JSON.parse(out).v).toBe(1)
  })

  it('is plain JSON for normal messages', () => {
    const m = buildWebPushMessage({ title: 'Hi', body: 'There' })
    expect(JSON.parse(serializeWebPush(m))).toEqual(m)
  })
})

describe('pushAllowed', () => {
  it('defaults to on', () => expect(pushAllowed(null, null)).toBe(true))
  it('honours the channel switch', () => expect(pushAllowed({ enabled: false }, null)).toBe(false))
  it('honours the per-type switch', () => {
    expect(pushAllowed({ enabled: true }, { enabled: false })).toBe(false)
    expect(pushAllowed(null, { enabled: true, push: false })).toBe(false)
    expect(pushAllowed(null, { enabled: true })).toBe(true)
  })
})

describe('subscription cleanup + validation', () => {
  it('404 and 410 mean the subscription is gone', () => {
    expect(isGoneStatus(404)).toBe(true)
    expect(isGoneStatus(410)).toBe(true)
    expect(isGoneStatus(429)).toBe(false)
    expect(isGoneStatus(undefined)).toBe(false)
  })

  it('accepts a browser subscription and rejects junk', () => {
    const ok = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) } }
    expect(subscribeSchema.safeParse(ok).success).toBe(true)
    expect(subscribeSchema.safeParse({ ...ok, endpoint: 'http://insecure.example/x' }).success).toBe(false)
    expect(subscribeSchema.safeParse({ ...ok, keys: { p256dh: 'short', auth: 'a'.repeat(22) } }).success).toBe(false)
    expect(subscribeSchema.safeParse({ ...ok, keys: { p256dh: 'B'.repeat(87), auth: '<script>' } }).success).toBe(false)
  })
})

/**
 * Tech news (lib/signals): feed trust + overrides, Atom parsing, AI caps,
 * auto-publish rules, news topic helpers, daily digest selection, and
 * end-to-end ingest + digest + weekly events WhatsApp on an in-memory DB.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeDb } from './helpers/fake-mongo'

const db = vi.hoisted(() => ({ current: null as unknown as import('./helpers/fake-mongo').FakeDb }))
const mail = vi.hoisted(() => ({ sent: [] as { to: string; subject: string; html: string }[] }))
vi.mock('@/lib/mongodb', () => ({ getMongoDb: async () => db.current }))
vi.mock('@/lib/upstash-rate-limit', () => ({ rateLimitRedis: async () => ({ ok: true }) }))
vi.mock('@/lib/send-email', () => ({
  sendEmail: vi.fn(async (to: string, t: { subject: string; html: string }) => { mail.sent.push({ to, ...t }); return { success: true, postalMessageId: mail.sent.length, error: null } }),
}))
vi.mock('@/lib/ats/screening/config', () => ({ getPlatformConfig: async () => ({ whatsapp: {} }), whatsappReady: () => false }))
vi.mock('@/lib/session', async () => {
  const { createHmac } = await import('node:crypto')
  const sig = (s: string) => createHmac('sha256', 'k').update(s).digest('base64url')
  return {
    deriveServerKey: async (label: string) => new Uint8Array(createHmac('sha256', 'k').update(label).digest()),
    signPurposeToken: async (purpose: string, data: Record<string, unknown>) => { const b = Buffer.from(JSON.stringify({ purpose, data, exp: Date.now() + 1e8 })).toString('base64url'); return `${b}.${sig(b)}` },
    verifyPurposeToken: async () => null,
  }
})

import { SIGNAL_FEEDS, effectiveFeeds, NEWS_TOPICS } from '@/lib/signals/feeds'
import { parseRssItems } from '@/lib/signals/rss'
import { aiBudget, cleanSignalSettingsPatch, normalizeSignalSettings, shouldAutoPublish, DEFAULT_SIGNAL_SETTINGS } from '@/lib/signals/settings'
import { newsFilter, newsTags, newsTopicOf, parseNewsParams } from '@/lib/signals/news'
import { digestDayIfDue, newsDigestHtml, runNewsDigest, selectNewsDigest } from '@/lib/signals/digest'
import { runSignalsIngest } from '@/lib/signals/ingest'
import { __resetSignalIndexes } from '@/lib/signals/store'
import { subscribe } from '@/lib/subscriptions'
import { __resetSubscriptionIndexes } from '@/lib/subscriptions/store'
import { __resetSubscriptionSettingsCache } from '@/lib/subscriptions/settings'
import { simulatedOutbox } from '@/lib/ats/screening/providers/whatsapp'
import { runAlerts, runDigest } from '@/lib/events-feed/notify'
import { EVENTS_FEED_DEFAULTS } from '@/lib/events-feed/settings'
import { toDoc } from '@/lib/events-feed/pipeline'
import { sanitizeEvent } from '@/lib/events-feed/normalize'
import { __resetEventsFeedIndexes } from '@/lib/events-feed/store'
import type { ExternalEvent } from '@/lib/events-feed/types'

beforeEach(() => {
  db.current = new FakeDb()
  __resetSignalIndexes()
  __resetSubscriptionIndexes()
  __resetSubscriptionSettingsCache()
  __resetEventsFeedIndexes()
  mail.sent = []
  simulatedOutbox.length = 0
})

describe('feeds', () => {
  it('every feed has a unique id, an https URL, a known topic and a trust flag', () => {
    expect(new Set(SIGNAL_FEEDS.map((f) => f.id)).size).toBe(SIGNAL_FEEDS.length)
    for (const f of SIGNAL_FEEDS) {
      expect(f.url, f.id).toMatch(/^https:\/\//)
      expect(NEWS_TOPICS.some((t) => t.id === f.topic), f.id).toBe(true)
      expect(typeof f.trusted).toBe('boolean')
    }
    for (const t of ['india-careers', 'cloud', 'security', 'languages']) expect(SIGNAL_FEEDS.some((f) => f.topic === t)).toBe(true)
    expect(SIGNAL_FEEDS.find((f) => f.id === 'cisa-advisories')?.trusted).toBe(true)
    expect(SIGNAL_FEEDS.find((f) => f.id === 'hn-frontpage')?.trusted).toBe(false)
  })
  it('admin overrides trust / on-off; least recently run first', () => {
    const eff = effectiveFeeds([
      { id: 'hn-frontpage', trusted: true, enabled: true, last_run_at: '2026-10-21T00:00:00Z' },
      { id: 'aws-news', trusted: false, enabled: false, last_run_at: '2026-10-20T00:00:00Z' },
      { id: 'go-blog', trusted: null, enabled: true, last_run_at: '2026-10-19T00:00:00Z' },
    ])
    expect(eff.find((f) => f.id === 'hn-frontpage')).toMatchObject({ trusted: true, enabled: true })
    expect(eff.find((f) => f.id === 'aws-news')).toMatchObject({ trusted: false, enabled: false })
    expect(eff.find((f) => f.id === 'go-blog')?.trusted).toBe(true)
    expect(eff.at(-1)?.id).toBe('hn-frontpage')
    expect(eff[0].last_run_at).toBeNull()
  })
  it('parses Atom entries as well as RSS items', () => {
    const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Go 1.27 is released</title><link rel="alternate" href="https://go.dev/blog/go1.27"/><updated>2026-10-20T00:00:00Z</updated><summary type="html">&lt;p&gt;Today the Go team&lt;/p&gt;</summary></entry></feed>`
    expect(parseRssItems(atom)).toEqual([{ title: 'Go 1.27 is released', link: 'https://go.dev/blog/go1.27', summary: 'Today the Go team', publishedAt: '2026-10-20T00:00:00Z' }])
    const rss = '<rss><channel><item><title>A</title><link>https://a.example/1</link><description>x</description></item></channel></rss>'
    expect(parseRssItems(rss)[0].link).toBe('https://a.example/1')
  })
})

describe('caps and auto-publish rules', () => {
  const now = new Date('2026-10-21T10:00:00Z')
  it('daily count and monthly cost caps', () => {
    const s = { daily_ai_cap: 3, monthly_cost_cap_usd: 5 }
    expect(aiBudget(s, null, now)).toEqual({ items: 3 })
    expect(aiBudget(s, { day: '2026-10-21', day_count: 2, month: '2026-10', month_cost_usd: 1 }, now)).toEqual({ items: 1 })
    expect(aiBudget(s, { day: '2026-10-20', day_count: 9, month: '2026-10', month_cost_usd: 1 }, now)).toEqual({ items: 3 })
    expect(aiBudget(s, { day: '2026-10-21', day_count: 3, month: '2026-10', month_cost_usd: 1 }, now).items).toBe(0)
    expect(aiBudget(s, { day: '2026-10-21', day_count: 0, month: '2026-10', month_cost_usd: 5 }, now).blocked).toMatch(/Monthly AI cap/)
    expect(aiBudget(s, { day: null, day_count: 0, month: '2026-09', month_cost_usd: 50 }, now)).toEqual({ items: 3 })
    expect(aiBudget({ daily_ai_cap: 3, monthly_cost_cap_usd: 0 }, null, now).items).toBe(0)
  })
  it('only trusted + AI-written + unflagged items auto-publish', () => {
    const base = { trusted: true, autoPublishTrusted: true, aiRewritten: true, flagged: false }
    expect(shouldAutoPublish(base)).toBe(true)
    expect(shouldAutoPublish({ ...base, trusted: false })).toBe(false)
    expect(shouldAutoPublish({ ...base, autoPublishTrusted: false })).toBe(false)
    expect(shouldAutoPublish({ ...base, aiRewritten: false })).toBe(false)
    expect(shouldAutoPublish({ ...base, flagged: true })).toBe(false)
  })
  it('settings patches are validated', () => {
    expect(cleanSignalSettingsPatch({ daily_ai_cap: '20', monthly_cost_cap_usd: 2.345 })).toEqual({ ok: true, patch: { daily_ai_cap: 20, monthly_cost_cap_usd: 2.35 } })
    expect(cleanSignalSettingsPatch({ daily_ai_cap: -1 }).ok).toBe(false)
    expect(cleanSignalSettingsPatch({ digest_timezone: 'Mars/Base' }).ok).toBe(false)
    expect(cleanSignalSettingsPatch({ bogus: 1 }).ok).toBe(false)
    expect(normalizeSignalSettings({ daily_ai_cap: 'x', digest_hour: 7 })).toEqual({ ...DEFAULT_SIGNAL_SETTINGS, digest_hour: 7 })
  })
})

describe('news helpers', () => {
  it('topics from tags (new tag, old feed id, fallback)', () => {
    expect(newsTags('aws-news', 'cloud')).toEqual(['signals', 'aws-news', 'news:cloud'])
    expect(newsTags('x', 'bogus')).toContain('news:industry')
    expect(newsTopicOf(['signals', 'news:security'])).toBe('security')
    expect(newsTopicOf(['signals', 'go-blog'])).toBe('languages')
    expect(newsTopicOf(['signals'])).toBe('industry')
    expect(newsFilter(null)).toEqual({ status: 'published', tags: 'signals' })
    expect(newsFilter('cloud').$or).toEqual(expect.arrayContaining([{ tags: 'news:cloud' }]))
    expect(parseNewsParams({ topic: 'cloud', page: '3' })).toEqual({ topic: 'cloud', page: 3 })
    expect(parseNewsParams({ topic: '<x>', page: '-4' })).toEqual({ topic: null, page: 1 })
  })
  it('digest: last 24 h, subscriber topics, due once per local day', () => {
    const now = new Date('2026-10-21T02:40:00Z') // 08:10 IST
    const items = [
      { slug: 'a', title: 'A', excerpt: 'a', tags: ['signals', 'news:cloud'], published_at: '2026-10-20T20:00:00Z' },
      { slug: 'b', title: 'B <b>', excerpt: 'b', tags: ['signals', 'news:security'], published_at: '2026-10-21T01:00:00Z' },
      { slug: 'old', title: 'Old', excerpt: 'o', tags: ['signals', 'news:cloud'], published_at: '2026-10-19T00:00:00Z' },
    ]
    expect(selectNewsDigest(items, { filters: {} }, now).map((p) => p.slug)).toEqual(['b', 'a'])
    expect(selectNewsDigest(items, { filters: { news: { topics: ['cloud'] } } }, now).map((p) => p.slug)).toEqual(['a'])
    expect(newsDigestHtml(items.slice(1, 2), 'https://cs.example')).toContain('B &lt;b&gt;')
    const s = { digest_enabled: true, digest_hour: 8, digest_timezone: 'Asia/Kolkata' }
    expect(digestDayIfDue(now, s)).toBe('2026-10-21')
    expect(digestDayIfDue(now, { ...s, last_digest_day: '2026-10-21' })).toBeNull()
    expect(digestDayIfDue(now, { ...s, digest_hour: 9 })).toBeNull()
    expect(digestDayIfDue(now, { ...s, digest_enabled: false })).toBeNull()
  })
})

describe('ingest end to end', () => {
  const NOW = new Date('2026-10-21T06:00:00Z')
  const itemsFor = (url: string) => {
    const f = SIGNAL_FEEDS.find((x) => x.url === url)!
    return [{ title: `${f.name} headline`, link: `https://src.example/${f.id}`, summary: 'Something shipped.' }]
  }
  const rewrite = vi.fn(async (a: { title: string; sourceUrl: string }) => ({ title: `Rewritten: ${a.title}`, excerpt: 'Short.', body: '<h2>What happened</h2><p>Thing.</p><script>x</script>', facts: [], source_urls: [a.sourceUrl], angle: 'a', flags: [] }))

  it('trusted feeds auto-publish, untrusted wait, caps stop the run, sources dedupe', async () => {
    await db.current.collection('signal_settings').insertOne({ id: 'default', daily_ai_cap: 4 })
    const deps = { fetchItems: async (url: string) => itemsFor(url), rewrite, og: async () => ({}) }
    const r1 = await runSignalsIngest({ now: NOW, deps })
    expect(r1.created).toBe(4)
    expect(r1.blocked).toMatch(/Daily AI cap/)
    const drafts = db.current.collection('signal_drafts').docs as Record<string, unknown>[]
    expect(drafts).toHaveLength(4)
    const posts = db.current.collection('blog_posts').docs as Record<string, unknown>[]
    const trustedDrafts = drafts.filter((d) => d.trusted)
    expect(posts).toHaveLength(trustedDrafts.length)
    expect(r1.published).toBe(trustedDrafts.length)
    for (const d of trustedDrafts) expect(d).toMatchObject({ status: 'published', auto_published: true })
    for (const d of drafts.filter((x) => !x.trusted)) expect(d.status).toBe('pending')
    for (const p of posts) {
      expect(p.tags).toEqual(expect.arrayContaining(['signals', expect.stringMatching(/^news:/)]))
      expect(String(p.body)).not.toContain('<script')
    }
    const usage = (db.current.collection('signal_settings').docs[0] as { usage: { day_count: number } }).usage
    expect(usage.day_count).toBe(4)
    // Cap reached: next run creates nothing.
    const r2 = await runSignalsIngest({ now: NOW, deps })
    expect(r2.created).toBe(0)
    // Next day: already-seen sources are skipped, the rest continue.
    const r3 = await runSignalsIngest({ now: new Date('2026-10-22T06:00:00Z'), deps })
    expect(r3.created).toBe(4)
    expect(new Set((db.current.collection('signal_drafts').docs as { source_url: string }[]).map((d) => d.source_url)).size).toBe(8)
  })

  it('a failed AI pass or flagged text never auto-publishes; a failing feed is isolated', async () => {
    await db.current.collection('signal_settings').insertOne({ id: 'default', daily_ai_cap: 100 })
    const deps = {
      fetchItems: async (url: string) => { if (url.includes('aws')) throw new Error('boom'); return itemsFor(url) },
      rewrite: vi.fn(async (a: { sourceUrl: string }) => (a.sourceUrl.endsWith('go-blog') ? null : { title: 'T', excerpt: 'E', body: '<p>b</p>', facts: [], source_urls: [a.sourceUrl], angle: '', flags: a.sourceUrl.endsWith('rust-blog') ? ['role-hijack:ignore-previous'] : [] })),
      og: async () => ({}),
    }
    const r = await runSignalsIngest({ now: NOW, deps })
    expect(r.errors.some((e) => e.startsWith('aws-news:'))).toBe(true)
    const drafts = db.current.collection('signal_drafts').docs as Record<string, unknown>[]
    expect(drafts.find((d) => d.source_feed === 'go-blog')).toMatchObject({ status: 'pending', ai_rewritten: false })
    expect(drafts.find((d) => d.source_feed === 'rust-blog')).toMatchObject({ status: 'pending' })
    expect(drafts.find((d) => d.source_feed === 'nodejs-blog')).toMatchObject({ status: 'published', auto_published: true })
    const state = db.current.collection('signal_feed_state').docs.find((s) => s.id === 'aws-news') as { last_error: string }
    expect(state.last_error).toBe('boom')
  })
})

describe('daily news digest + weekly events WhatsApp', () => {
  const NOW = new Date('2026-10-21T02:40:00Z')
  it('sends once per day per channel to opted-in subscribers, topic-filtered', async () => {
    const posts = db.current.collection('blog_posts')
    posts.docs.push({ id: '1', slug: 'cloud-thing', title: 'Cloud thing', excerpt: 'c', tags: ['signals', 'news:cloud'], status: 'published', published_at: '2026-10-21T01:00:00Z' })
    posts.docs.push({ id: '2', slug: 'sec-thing', title: 'Security thing', excerpt: 's', tags: ['signals', 'news:security'], status: 'published', published_at: '2026-10-21T01:30:00Z' })
    await subscribe({ email: 'n@x.com', user_id: 'u1', channels: ['email'], topics: ['news'], filters: { news: { topics: ['cloud'] } } }, { emailVerified: true })
    await subscribe({ email: 'e@x.com', user_id: 'u2', channels: ['email'], topics: ['events'] }, { emailVerified: true })
    await subscribe({ phone: '+15550001111', user_id: 'u3', channels: ['whatsapp'], topics: ['news'], whatsapp_consent: true, timezone: 'UTC' }, { phoneVerified: true })
    await db.current.collection('signal_settings').insertOne({ id: 'default', whatsapp_template_digest: 'daily_news' })
    const r1 = await runNewsDigest(new Date('2026-10-21T12:00:00Z'), '2026-10-21')
    expect(r1.sent).toBe(2)
    expect(mail.sent).toHaveLength(1)
    expect(mail.sent[0].to).toBe('n@x.com')
    expect(mail.sent[0].html).toContain('Cloud thing')
    expect(mail.sent[0].html).not.toContain('Security thing')
    expect(mail.sent[0].html).toContain('/subscriptions/manage?')
    expect(simulatedOutbox.at(-1)?.kind).toBe('template:daily_news')
    const r2 = await runNewsDigest(new Date('2026-10-21T12:05:00Z'), '2026-10-21')
    expect(r2.duplicate).toBe(2)
    expect(mail.sent).toHaveLength(1)
    void NOW
  })

  it('weekly WhatsApp subscribers skip instant alerts and get one weekly message', async () => {
    const col = db.current.collection('events_feed')
    const e = sanitizeEvent({ source: 'simulated', source_id: 'w1', title: 'Weekend Hack', url: 'https://e.example/w1', organiser: null, kind: 'hackathon', mode: 'online', location: { city: null, country: null }, starts_at: '2026-10-24T00:00:00Z', ends_at: '2026-10-25T00:00:00Z', registration_deadline: null, prize: null, themes: [], image: null, description_summary: '' } as ExternalEvent)!
    col.docs.push(toDoc(e, [], '2026-10-19T12:00:00.000Z'))
    await subscribe({ phone: '+15550002222', user_id: 'w', channels: ['whatsapp'], topics: ['events'], whatsapp_consent: true, filters: { events: { frequency: 'weekly' } }, timezone: 'UTC' }, { phoneVerified: true })
    await subscribe({ phone: '+15550003333', user_id: 'i', channels: ['whatsapp'], topics: ['events'], whatsapp_consent: true, timezone: 'UTC' }, { phoneVerified: true })
    const now = new Date('2026-10-20T15:00:00Z')
    const settings = { ...EVENTS_FEED_DEFAULTS, whatsapp_template_alert: 'event_alert', whatsapp_template_digest: 'events_weekly' }
    const alerts = await runAlerts(now, settings)
    expect(alerts.sent).toBe(1)
    expect(simulatedOutbox).toHaveLength(1)
    expect(simulatedOutbox[0].to).toBe('+15550003333')
    const d1 = await runDigest(now, settings, '2026-W43')
    expect(d1.sent).toBe(1)
    expect(simulatedOutbox.at(-1)).toMatchObject({ to: '+15550002222', kind: 'template:events_weekly' })
    expect((await runDigest(now, settings, '2026-W43')).duplicate).toBe(1)
  })
})

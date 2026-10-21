/**
 * Events feed wave 6: Hack Club + configurable sources (Lu.ma, Eventbrite,
 * Google / Microsoft / AWS) parsing and fail-soft config, public filters
 * (region, student-friendly), Google Calendar links, "happening this week"
 * digest section, the weekly WhatsApp cadence, and Learn seed additions.
 */
import { describe, expect, it } from 'vitest'
import { parseHackClub } from '@/lib/events-feed/sources/hackclub'
import { awsDev, eventbrite, luma, parseAnyFeed } from '@/lib/events-feed/sources/configurable'
import { BUILTIN_CONNECTORS } from '@/lib/events-feed/sources'
import { filterEvents, googleCalendarUrl, isStudentFriendly, regionOf, toPublic } from '@/lib/events-feed/public'
import { validateSourceConfig } from '@/lib/events-feed/admin'
import { selectDigest, wantsWeekly, weeklyWhatsAppText } from '@/lib/events-feed/notify'
import { toDoc } from '@/lib/events-feed/pipeline'
import { sanitizeEvent } from '@/lib/events-feed/normalize'
import { normalizeEventFilters, normalizeTopicFilters, normalizeTopics } from '@/lib/subscriptions/filters'
import { missingSeedRows, seedTopicRows, SEED_TOPICS, findDuplicateTitle } from '@/lib/learn/topics'
import { LEARN_CATEGORIES, PROSE_FIRST_CATEGORIES } from '@/lib/learn/types'
import type { ExternalEvent, FeedEventDoc, PublicFeedEvent } from '@/lib/events-feed/types'

const NOW = new Date('2026-10-19T12:00:00Z')

describe('Hack Club connector', () => {
  it('maps the public API (virtual / hybrid / in person), tags students', () => {
    const out = parseHackClub([
      { id: 'hc1', name: 'Hack Pune', website: 'https://hackpune.dev', start: '2026-11-07T04:30:00.000Z', end: '2026-11-08T12:00:00.000Z', city: 'Pune', country: 'India', countryCode: 'IN', virtual: false, hybrid: false, banner: 'https://img.example/b.png', mlhAssociated: true },
      { id: 'hc2', name: 'Global Online Hack', website: 'https://goh.dev', start: '2026-11-10T00:00:00Z', end: '2026-11-11T00:00:00Z', virtual: true },
      { id: 'hc3', name: 'No link' },
    ])
    expect(out).toHaveLength(3)
    expect(out[0]).toMatchObject({ source: 'hackclub', kind: 'hackathon', mode: 'in_person', location: { city: 'Pune', country: 'IN' }, image: 'https://img.example/b.png' })
    expect(out[0].themes).toEqual(expect.arrayContaining(['students', 'beginner-friendly']))
    expect(out[1]).toMatchObject({ mode: 'online', location: { city: null, country: null } })
    expect(out[2].url).toBe('https://hackathons.hackclub.com/#hc3')
    expect(parseHackClub({ events: [] })).toEqual([])
    expect(parseHackClub('junk')).toEqual([])
  })
})

describe('configurable sources', () => {
  const ics = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:l1@lu.ma\r\nSUMMARY:AI Builders Meetup Bengaluru\r\nDTSTART:20261105T130000Z\r\nDTEND:20261105T160000Z\r\nLOCATION:Bengaluru, India\r\nURL:https://lu.ma/ai-blr\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n'
  const rss = '<?xml version="1.0"?><rss><channel><item><title>Azure AI Hackathon</title><link>https://ms.example/hack</link><guid>m1</guid></item></channel></rss>'
  const html = '<html><script type="application/ld+json">{"@type":"Event","name":"AWS Community Day India","url":"https://aws.example/cd","startDate":"2026-12-05T09:00:00+05:30","eventAttendanceMode":"https://schema.org/OfflineEventAttendanceMode","location":{"@type":"Place","address":{"addressLocality":"Hyderabad","addressCountry":"IN"}}}</script></html>'

  it('picks the parser from the body: iCal, RSS, JSON-LD', () => {
    const a = parseAnyFeed(ics, 'text/calendar', { source: 'luma', kind: 'conference', baseUrl: 'https://api.lu.ma/ics/get' })
    expect(a[0]).toMatchObject({ source: 'luma', title: 'AI Builders Meetup Bengaluru', url: 'https://lu.ma/ai-blr', starts_at: '2026-11-05T13:00:00.000Z', kind: 'conference' })
    const b = parseAnyFeed(rss, 'application/rss+xml', { source: 'microsoft-dev', kind: 'conference', baseUrl: 'https://ms.example/feed' })
    expect(b[0]).toMatchObject({ title: 'Azure AI Hackathon', kind: 'hackathon' })
    const c = parseAnyFeed(html, 'text/html', { source: 'aws-dev', kind: 'conference', name: 'AWS developer events', baseUrl: 'https://aws.example/' })
    expect(c[0]).toMatchObject({ title: 'AWS Community Day India', mode: 'in_person', organiser: 'AWS developer events', location: { city: 'Hyderabad' } })
  })

  it('off by default, fail soft without a URL, eventbrite needs permission', async () => {
    for (const c of [luma, eventbrite, awsDev]) {
      expect(c.defaultEnabled).toBe(false)
      expect(c.configurable?.hint).toBeTruthy()
      await expect(c.fetch({ get: async () => ({ status: 200, text: '', contentType: '' }), now: NOW, config: null })).rejects.toThrow('Feed URL not configured')
    }
    expect(eventbrite.needsPermission).toBe(true)
    expect(luma.needsPermission).toBe(false)
    const got = await luma.fetch({ get: async (url) => { expect(url).toBe('https://api.lu.ma/ics/get?id=cal-1'); return { status: 200, text: ics, contentType: 'text/calendar' } }, now: NOW, config: { url: 'https://api.lu.ma/ics/get?id=cal-1' } })
    expect(got).toHaveLength(1)
    await expect(luma.fetch({ get: async () => ({ status: 503, text: '', contentType: '' }), now: NOW, config: { url: 'https://x.example/a.ics' } })).rejects.toThrow('HTTP 503')
    expect(new Set(BUILTIN_CONNECTORS.map((c) => c.id)).size).toBe(BUILTIN_CONNECTORS.length)
    expect(BUILTIN_CONNECTORS.map((c) => c.id)).toEqual(expect.arrayContaining(['hackclub', 'luma', 'eventbrite', 'google-dev', 'microsoft-dev', 'aws-dev']))
  })

  it('validates the admin feed URL (https only; empty clears)', () => {
    expect(validateSourceConfig({ url: 'https://lu.ma/x.ics' })).toEqual({ ok: true, url: 'https://lu.ma/x.ics' })
    expect(validateSourceConfig({ url: '' })).toEqual({ ok: true, url: null })
    expect(validateSourceConfig({ url: 'http://lu.ma/x.ics' }).ok).toBe(false)
    expect(validateSourceConfig({ url: 'javascript:alert(1)' }).ok).toBe(false)
  })
})

const pub = (over: Partial<PublicFeedEvent>): PublicFeedEvent => ({
  id: 'ef_0000000000000000', title: 'Some Hack', url: 'https://e.example/x', organiser: null, kind: 'hackathon', mode: 'in_person', city: null, country: null,
  starts_at: '2026-11-01T10:00:00.000Z', ends_at: null, registration_deadline: null, prize_text: null, prize_usd_minor: null, themes: [], image: null,
  summary: 'Summary', featured: false, internal: false, source: 'devpost', ...over,
})

describe('public filters and calendar links', () => {
  it('regions from ISO countries', () => {
    expect(regionOf('IN')).toBe('india')
    expect(regionOf('sg')).toBe('asia-pacific')
    expect(regionOf('DE')).toBe('europe')
    expect(regionOf('US')).toBe('north-america')
    expect(regionOf('BR')).toBe('latin-america')
    expect(regionOf('NG')).toBe('middle-east-africa')
    expect(regionOf(null)).toBeNull()
    expect(regionOf('ZZ')).toBeNull()
  })
  it('student-friendly heuristic', () => {
    expect(isStudentFriendly({ title: 'Acme Hack', organiser: null, themes: [], source: 'hackclub' })).toBe(true)
    expect(isStudentFriendly({ title: 'IIT Bombay Techfest Hackathon', organiser: null, themes: [], source: 'devpost' })).toBe(true)
    expect(isStudentFriendly({ title: 'Acme Hack', organiser: 'Acme University', themes: [], source: 'devpost' })).toBe(true)
    expect(isStudentFriendly({ title: 'Acme Hack', organiser: null, themes: ['beginner-friendly'], source: 'devpost' })).toBe(true)
    expect(isStudentFriendly({ title: 'Enterprise Cloud Summit', organiser: 'Acme Corp', themes: ['cloud'], source: 'luma' })).toBe(false)
    expect(isStudentFriendly({ title: 'Ours', organiser: null, themes: [], source: 'codespectra', internal: true })).toBe(true)
  })
  it('filters by region and students', () => {
    const list = [
      pub({ id: 'a', country: 'IN', title: 'College Hack Pune' }),
      pub({ id: 'b', country: 'US', title: 'Valley Pro Summit', source: 'luma' }),
      pub({ id: 'c', mode: 'online', title: 'Online Pro Hack', source: 'luma' }),
    ]
    expect(filterEvents(list, { regions: ['india'] }).map((e) => e.id)).toEqual(['a'])
    expect(filterEvents(list, { regions: ['india', 'north-america'] }).map((e) => e.id)).toEqual(['a', 'b'])
    expect(filterEvents(list, { student: true }).map((e) => e.id)).toEqual(['a'])
    expect(filterEvents([pub({ id: 'd', student_friendly: true, source: 'luma', title: 'X' })], { student: true })).toHaveLength(1)
  })
  it('toPublic carries student_friendly', () => {
    const e = sanitizeEvent({ source: 'mlh', source_id: '1', title: 'Hack', url: 'https://e.example/1', organiser: null, kind: 'hackathon', mode: 'online', location: { city: null, country: null }, starts_at: null, ends_at: null, registration_deadline: null, prize: null, themes: [], image: null, description_summary: '' } as ExternalEvent)!
    expect(toPublic(toDoc(e, [], NOW.toISOString())).student_friendly).toBe(true)
  })
  it('Google Calendar link (UTC stamps; 2 h default length)', () => {
    const u = new URL(googleCalendarUrl(pub({ title: 'Hack & Learn', city: 'Pune', country: 'IN' }), 'https://codespectra.ai/events/x')!)
    expect(u.hostname).toBe('calendar.google.com')
    expect(u.searchParams.get('action')).toBe('TEMPLATE')
    expect(u.searchParams.get('text')).toBe('Hack & Learn')
    expect(u.searchParams.get('dates')).toBe('20261101T100000Z/20261101T120000Z')
    expect(u.searchParams.get('location')).toBe('Pune, IN')
    expect(u.searchParams.get('details')).toContain('https://codespectra.ai/events/x')
    expect(googleCalendarUrl(pub({ mode: 'online', ends_at: '2026-11-03T00:00:00.000Z' }), 'p')).toContain('dates=20261101T100000Z%2F20261103T000000Z')
    expect(googleCalendarUrl(pub({ starts_at: null }), 'p')).toBeNull()
  })
})

const doc = (over: Partial<FeedEventDoc>): FeedEventDoc => {
  const e = sanitizeEvent({ source: 'simulated', source_id: String(Math.random()), title: 'E', url: `https://e.example/${Math.random().toString(36).slice(2)}`, organiser: null, kind: 'hackathon', mode: 'online', location: { city: null, country: null }, starts_at: '2026-12-01T00:00:00Z', ends_at: null, registration_deadline: null, prize: null, themes: [], image: null, description_summary: '' } as ExternalEvent)!
  return { ...toDoc(e, [], '2026-09-01T00:00:00.000Z'), ...over }
}

describe('weekly digest: happening this week + WhatsApp cadence', () => {
  it('lists events starting in the next 7 days once', () => {
    const events = [
      doc({ id: 'soon', title: 'Starts Thursday', starts_at: '2026-10-22T10:00:00Z' }),
      doc({ id: 'fresh', title: 'New and soon', first_seen_at: '2026-10-18T00:00:00Z', starts_at: '2026-10-21T00:00:00Z' }),
      doc({ id: 'later', title: 'Next month', starts_at: '2026-11-25T00:00:00Z' }),
    ]
    const d = selectDigest(events, { filters: {} }, NOW)
    expect(d.thisWeek.map((e) => e.id)).toEqual(['soon'])
    expect(d.fresh.map((e) => e.id)).toEqual(['fresh'])
    const text = weeklyWhatsAppText(d.fresh, d.closing, d.thisWeek, 'UTC', 'https://codespectra.ai/events')
    expect(text).toContain('Starts Thursday')
    expect(text).toContain('(this week)')
    expect(text).toContain('Reply STOP')
  })
  it('frequency preference is normalised and read', () => {
    expect(normalizeEventFilters({ frequency: 'weekly' })).toEqual({ frequency: 'weekly' })
    expect(normalizeEventFilters({ frequency: 'instant' })).toEqual({})
    expect(normalizeEventFilters({ frequency: 'hourly' })).toEqual({})
    expect(wantsWeekly({ filters: { events: { frequency: 'weekly' } } })).toBe(true)
    expect(wantsWeekly({ filters: {} })).toBe(false)
    expect(normalizeTopics(['news', 'events', 'nope'])).toEqual(['news', 'events'])
    expect(normalizeTopicFilters({ news: { topics: ['Cloud', 'security'] } })).toEqual({ news: { topics: ['cloud', 'security'] } })
  })
})

describe('Learn: new categories and seed topics', () => {
  it('adds languages, technologies and competitions & careers with ~60 topics', () => {
    const ids = LEARN_CATEGORIES.map((c) => c.id)
    expect(ids).toEqual(expect.arrayContaining(['languages', 'technologies', 'competitions-careers']))
    const n = SEED_TOPICS.languages.length + SEED_TOPICS.technologies.length + SEED_TOPICS['competitions-careers'].length
    expect(n).toBeGreaterThanOrEqual(55)
    expect(PROSE_FIRST_CATEGORIES.has('competitions-careers')).toBe(true)
  })
  it('no seed title duplicates another, across categories', () => {
    const seen: string[] = []
    for (const r of seedTopicRows()) {
      expect(findDuplicateTitle(r.title, seen), r.title).toBeNull()
      seen.push(r.title)
    }
  })
  it('a live database gets only the missing seed rows, never near-duplicates', () => {
    const rows = seedTopicRows()
    const old = rows.filter((r) => !['languages', 'technologies', 'competitions-careers'].includes(r.category))
    const missing = missingSeedRows(old.map((r) => ({ hash: r.hash, title: r.title })))
    expect(missing.length).toBe(rows.length - old.length)
    expect(missingSeedRows(rows.map((r) => ({ hash: r.hash, title: r.title })))).toEqual([])
    // An admin-added near-duplicate blocks the seed row.
    const withAdmin = [...old.map((r) => ({ hash: r.hash, title: r.title })), { hash: 'admin1', title: 'How to win hackathons' }]
    expect(missingSeedRows(withAdmin).some((r) => r.title === 'How to win a hackathon')).toBe(false)
  })
})

/**
 * Events feed (lib/events-feed): connector parsers against fixture payloads,
 * time-zone normalisation, URL canonicalisation, prizes in minor units,
 * cross-source dedupe, refresh rules (admin edits win), archiving, robots.txt,
 * public filters / UTM, AI output validation, admin edit validation, digest /
 * alert / reminder selection, and an end-to-end pull on an in-memory DB.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeDb } from './helpers/fake-mongo'

const db = vi.hoisted(() => ({ current: null as unknown as import('./helpers/fake-mongo').FakeDb }))
vi.mock('@/lib/mongodb', () => ({ getMongoDb: async () => db.current }))
vi.mock('@/lib/ai/backend', () => ({ backendComplete: vi.fn(async () => ({ ok: true, json: { summary: 'A weekend online hackathon focused on building AI agents for small businesses.', themes: ['ai-ml', 'not-a-theme'] } })) }))
vi.mock('@/lib/interviews/ai-mock-engine', () => ({ platformModelOverrides: async () => ({}), extractJson: () => null }))
vi.mock('@/lib/cron-heartbeat', () => ({ recordCronRun: async () => undefined }))

import { canonicalUrl, countryCode, endOfDayIfDateOnly, fallbackSummary, inferKind, parseLocation, parsePrizeText, sanitizeEvent, tagThemes, toUtcIso } from '@/lib/events-feed/normalize'
import { dedupeBatch, sameEvent, titleSimilarity } from '@/lib/events-feed/dedupe'
import { robotsAllows } from '@/lib/events-feed/http'
import { parseCodeforces } from '@/lib/events-feed/sources/codeforces'
import { parseCtftime } from '@/lib/events-feed/sources/ctftime'
import { parseKaggle } from '@/lib/events-feed/sources/kaggle'
import { parseDateRange, parseDevpost } from '@/lib/events-feed/sources/devpost'
import { parseMlh } from '@/lib/events-feed/sources/mlh'
import { parseDevfolio } from '@/lib/events-feed/sources/devfolio'
import { parseUnstop } from '@/lib/events-feed/sources/unstop'
import { parseHackerEarth } from '@/lib/events-feed/sources/hackerearth'
import { parseCodeChef } from '@/lib/events-feed/sources/codechef'
import { parseLeetCode } from '@/lib/events-feed/sources/leetcode'
import { parseIcal, parseRss } from '@/lib/events-feed/sources/feeds'
import { simulatedEvents } from '@/lib/events-feed/sources/simulated'
import { mapInternal } from '@/lib/events-feed/sources/internal'
import { BUILTIN_CONNECTORS } from '@/lib/events-feed/sources'
import { matchExisting, refreshPatch, runPull, shouldArchive, toDoc } from '@/lib/events-feed/pipeline'
import { filterEvents, toPublic, withUtm, shareLinks } from '@/lib/events-feed/public'
import { cleanAiResult } from '@/lib/events-feed/ai'
import { buildEventEdit, validateFeedInput } from '@/lib/events-feed/admin'
import { alertCandidates, isoWeekKey, remindersDue, selectDigest } from '@/lib/events-feed/notify'
import { normalizeEventsFeedSettings, fillTemplate, claimRun } from '@/lib/events-feed/settings'
import { __resetEventsFeedIndexes } from '@/lib/events-feed/store'
import type { ExternalEvent, FeedEventDoc } from '@/lib/events-feed/types'
import type { HttpGet } from '@/lib/events-feed/http'

const NOW = new Date('2026-10-19T10:00:00.000Z')

beforeEach(() => {
  db.current = new FakeDb()
  __resetEventsFeedIndexes()
})

// ─── Normalisation ──────────────────────────────────────────────────────────

describe('time zones → UTC', () => {
  it('handles unix seconds / ms, ISO with offsets and Z', () => {
    expect(toUtcIso(1792368000)).toBe('2026-10-19T00:00:00.000Z')
    expect(toUtcIso(1792368000000)).toBe('2026-10-19T00:00:00.000Z')
    expect(toUtcIso('2026-10-22T20:00:00+05:30')).toBe('2026-10-22T14:30:00.000Z')
    expect(toUtcIso('2026-10-22T20:00:00+0530')).toBe('2026-10-22T14:30:00.000Z')
    expect(toUtcIso('2026-10-22T09:00:00Z')).toBe('2026-10-22T09:00:00.000Z')
  })
  it('reads naive wall-clock times in the source zone, across DST', () => {
    expect(toUtcIso('2026-10-22 20:00', 'Asia/Kolkata')).toBe('2026-10-22T14:30:00.000Z')
    expect(toUtcIso('2026-07-01T09:00:00', 'America/New_York')).toBe('2026-07-01T13:00:00.000Z') // EDT
    expect(toUtcIso('2026-01-15 09:00', 'America/New_York')).toBe('2026-01-15T14:00:00.000Z') // EST
    expect(toUtcIso('2026-10-22')).toBe('2026-10-22T00:00:00.000Z')
  })
  it('parses iCal and month-name dates; rejects junk', () => {
    expect(toUtcIso('20261025T090000Z')).toBe('2026-10-25T09:00:00.000Z')
    expect(toUtcIso('20261025T090000', 'Europe/Berlin')).toBe('2026-10-25T08:00:00.000Z') // CET after DST ends
    expect(toUtcIso('20261025')).toBe('2026-10-25T00:00:00.000Z')
    expect(toUtcIso('Oct 21, 2026')).toBe('2026-10-21T00:00:00.000Z')
    expect(toUtcIso('Oct 21st 2026 6:30 pm', 'UTC')).toBe('2026-10-21T18:30:00.000Z')
    expect(toUtcIso('soon')).toBeNull()
    expect(toUtcIso(-5)).toBeNull()
    expect(endOfDayIfDateOnly('2026-10-30', '2026-10-30T00:00:00.000Z')).toBe('2026-10-30T23:59:59.000Z')
  })
})

describe('urls, prizes, places, kinds, themes', () => {
  it('canonicalises urls for dedupe', () => {
    expect(canonicalUrl('http://www.Example.com/hack/?utm_source=x&ref=y#top')).toBe('https://example.com/hack')
    expect(canonicalUrl('https://example.com/hack?b=2&a=1')).toBe('https://example.com/hack?a=1&b=2')
  })
  it('parses prizes into integer minor units', () => {
    expect(parsePrizeText('$<span data-currency-value>10,000</span>')).toMatchObject({ amount_minor: 1_000_000, currency: 'USD', usd_minor: 1_000_000 })
    expect(parsePrizeText('₹ 1,00,000')).toMatchObject({ amount_minor: 10_000_000, currency: 'INR', usd_minor: 120_000 })
    expect(parsePrizeText('€5k in prizes')).toMatchObject({ amount_minor: 500_000, currency: 'EUR' })
    expect(parsePrizeText('INR 2 lakh')).toMatchObject({ amount_minor: 20_000_000 })
    expect(parsePrizeText('Knowledge')).toBeNull()
    expect(parsePrizeText('500 points')).toBeNull()
  })
  it('countries and locations', () => {
    expect(countryCode('India')).toBe('IN')
    expect(countryCode('UK')).toBe('GB')
    expect(countryCode('MA')).toBeNull() // US state, not Morocco
    expect(parseLocation('Boston, MA')).toEqual({ city: 'Boston', country: 'US' })
    expect(parseLocation('Hyderabad, India')).toEqual({ city: 'Hyderabad', country: 'IN' })
    expect(parseLocation('Online')).toEqual({ city: null, country: null })
  })
  it('infers kinds and themes', () => {
    expect(inferKind('Weekly Contest 470')).toBe('codeathon')
    expect(inferKind('HackMIT 2026')).toBe('hackathon')
    expect(inferKind('Solana Buildathon')).toBe('buildathon')
    expect(inferKind('Winter CTF')).toBe('ctf')
    expect(tagThemes(['Machine Learning/AI', 'Fintech'], 'build with LLM agents')).toEqual(expect.arrayContaining(['ai-ml', 'fintech']))
  })
  it('summaries are our own words from structured fields', () => {
    const s = fallbackSummary({ kind: 'hackathon', mode: 'in_person', organiser: 'Acme', location: { city: 'Pune', country: 'IN' }, starts_at: '2026-11-01T04:00:00Z', ends_at: '2026-11-02T12:00:00Z', prize: { text: '$1,000 in prizes', amount_minor: 100000, currency: 'USD', usd_minor: 100000 }, themes: ['ai-ml'], registration_deadline: null })
    expect(s).toBe('In-person hackathon by Acme in Pune, IN. Runs Nov 1, 2026 – Nov 2, 2026 (UTC). $1,000 in prizes. Themes: ai-ml.')
  })
  it('sanitize rejects missing links and clips / validates fields', () => {
    const base = simulatedEvents(NOW)[0]
    expect(sanitizeEvent({ ...base, url: 'javascript:alert(1)' })).toBeNull()
    const ok = sanitizeEvent({ ...base, title: '<b>Hi</b>  there', image: 'ftp://x', themes: ['AI / ML', 'AI / ML'] })!
    expect(ok.title).toBe('Hi there')
    expect(ok.image).toBeNull()
    expect(ok.themes).toEqual(['ai-ml'])
  })
})

// ─── Parsers (fixtures mirror each source's documented / observed format) ───

describe('connector parsers', () => {
  it('Codeforces: only upcoming rounds, duration → end', () => {
    const ev = parseCodeforces({ status: 'OK', result: [
      { id: 2150, name: 'Codeforces Round 1050 (Div. 2)', type: 'CF', phase: 'BEFORE', durationSeconds: 7200, startTimeSeconds: 1792483500 },
      { id: 2100, name: 'Old round', type: 'CF', phase: 'FINISHED', durationSeconds: 7200, startTimeSeconds: 1700000000 },
    ] })
    expect(ev).toHaveLength(1)
    expect(ev[0]).toMatchObject({ source: 'codeforces', source_id: '2150', kind: 'codeathon', mode: 'online', url: 'https://codeforces.com/contests/2150', starts_at: '2026-10-20T08:05:00.000Z', ends_at: '2026-10-20T10:05:00.000Z' })
    expect(parseCodeforces({ status: 'FAILED' })).toEqual([])
  })
  it('CTFtime: organiser url, onsite location, security theme', () => {
    const ev = parseCtftime([{ id: 3001, title: 'Example CTF 2026', url: 'https://ctf.example.org/', ctftime_url: 'https://ctftime.org/event/3001/', start: '2026-10-25T09:00:00+00:00', finish: '2026-10-26T09:00:00+00:00', format: 'Jeopardy', onsite: true, location: 'Berlin, Germany', organizers: [{ id: 1, name: 'Team Example' }], description: 'Long description', logo: '' }])
    expect(ev[0]).toMatchObject({ kind: 'ctf', mode: 'in_person', url: 'https://ctf.example.org/', organiser: 'Team Example', location: { city: 'Berlin', country: 'Germany' } })
    expect(ev[0].themes).toContain('security')
  })
  it('Kaggle: reward → prize, skips getting-started', () => {
    const ev = parseKaggle([
      { ref: 'https://www.kaggle.com/competitions/llm-detect', title: 'LLM Detect', url: 'https://www.kaggle.com/competitions/llm-detect', deadline: '2027-01-15T23:59:00Z', enabledDate: '2026-10-01T00:00:00Z', category: 'Featured', reward: '$100,000', tags: [{ name: 'nlp' }], organizationName: 'Acme Labs' },
      { ref: 'titanic', title: 'Titanic', category: 'Getting Started', reward: 'Knowledge' },
    ])
    expect(ev).toHaveLength(1)
    expect(ev[0]).toMatchObject({ source_id: 'llm-detect', kind: 'competition', prize: { amount_minor: 10_000_000, currency: 'USD' } })
  })
  it('Devpost: date ranges, location icon, prize html, protocol-relative image', () => {
    expect(parseDateRange('Oct 01 - 30, 2026')).toEqual({ start: '2026-10-01', end: '2026-10-30' })
    expect(parseDateRange('Sep 28 - Oct 05, 2026')).toEqual({ start: '2026-09-28', end: '2026-10-05' })
    expect(parseDateRange('Dec 28 - Jan 05, 2027')).toEqual({ start: '2026-12-28', end: '2027-01-05' })
    expect(parseDateRange('Dec 28, 2026 - Jan 05, 2027')).toEqual({ start: '2026-12-28', end: '2027-01-05' })
    const ev = parseDevpost({ hackathons: [
      { id: 1, title: 'Build with AI Hackathon', url: 'https://buildai.devpost.com/', displayed_location: { icon: 'globe', location: 'Online' }, open_state: 'open', submission_period_dates: 'Oct 20 - Nov 15, 2026', prize_amount: '$<span data-currency-value>25,000</span>', themes: [{ id: 1, name: 'Machine Learning/AI' }], organization_name: 'Acme', thumbnail_url: '//cdn.example.com/x.png', invite_only: false },
      { id: 2, title: 'Private', url: 'https://p.devpost.com/', invite_only: true, displayed_location: {}, submission_period_dates: '' },
    ] })
    expect(ev).toHaveLength(1)
    expect(ev[0]).toMatchObject({ mode: 'online', starts_at: '2026-10-20T00:00:00.000Z', ends_at: '2026-11-15T23:59:59.000Z', image: 'https://cdn.example.com/x.png', prize: { usd_minor: 2_500_000 } })
  })
  it('MLH: schema.org microdata and JSON-LD', () => {
    const html = `<div class="event-wrapper"><a class="event-link" href="https://hackx.example.edu/" target="_blank" title="HackX">
      <div class="event" itemscope itemtype="http://schema.org/Event"><img src="https://s3.example.com/hackx.png">
      <h3 class="event-name" itemprop="name">HackX</h3><meta itemprop="startDate" content="2026-11-07"><meta itemprop="endDate" content="2026-11-09">
      <span itemprop="city">Boston</span><span itemprop="state">MA</span><div class="event-hybrid-notes"><span>In-Person Only</span></div></div></a></div>
      <script type="application/ld+json">{"@context":"https://schema.org","@type":"Event","name":"Global Hack Week","url":"https://ghw.mlh.io/","startDate":"2026-12-01","endDate":"2026-12-07","eventAttendanceMode":"https://schema.org/OnlineEventAttendanceMode"}</script>`
    const ev = parseMlh(html, 2027)
    expect(ev.map((e) => e.title).sort()).toEqual(['Global Hack Week', 'HackX'])
    const hx = ev.find((e) => e.title === 'HackX')!
    expect(hx).toMatchObject({ mode: 'in_person', url: 'https://hackx.example.edu/', starts_at: '2026-11-07T00:00:00.000Z', ends_at: '2026-11-09T23:59:59.000Z', location: { city: 'Boston', country: 'US' } })
    expect(ev.find((e) => e.title === 'Global Hack Week')!.mode).toBe('online')
  })
  it('Devfolio, Unstop, HackerEarth, CodeChef, LeetCode', () => {
    const df = parseDevfolio({ hits: { hits: [{ _source: { name: 'ETH Hyd', slug: 'ethhyd', is_online: false, city: 'Hyderabad', country: 'India', starts_at: '2026-11-20T04:30:00.000Z', ends_at: '2026-11-22T12:30:00.000Z', hackathon_setting: { reg_ends_at: '2026-11-10T18:29:00.000Z' }, themes: [{ name: 'Ethereum' }] } }] } })
    expect(df[0]).toMatchObject({ url: 'https://ethhyd.devfolio.co/', mode: 'in_person', registration_deadline: '2026-11-10T18:29:00.000Z' })
    expect(df[0].themes).toContain('web3')
    const un = parseUnstop({ data: { data: [{ id: 99, title: 'Smart India Buildathon', seo_url: 'https://unstop.com/hackathons/smart-99', organisation: { name: 'Org' }, region: 'online', start_date: '2026-11-01T10:00:00+05:30', end_date: '2026-11-03T18:00:00+05:30', regnRequirements: { end_regn_dt: '2026-10-28 23:59:00' }, prizes: [{ cash: 50000, currency: 'fa-rupee' }, { cash: 25000, currency: 'fa-rupee' }], filters: [{ name: 'Fintech' }] }] } })
    expect(un[0]).toMatchObject({ kind: 'buildathon', mode: 'online', starts_at: '2026-11-01T04:30:00.000Z', registration_deadline: '2026-10-28T18:29:00.000Z', prize: { amount_minor: 7_500_000, currency: 'INR' } })
    const he = parseHackerEarth({ response: [
      { title: 'Data Hack', url: 'https://www.hackerearth.com/challenges/hackathon/data-hack/', status: 'UPCOMING', challenge_type: 'hackathon', start_utc_tz: '2026-11-01T04:30:00+00:00', end_utc_tz: '2026-11-30T18:30:00+00:00' },
      { title: 'Hiring challenge', url: 'https://x/', status: 'UPCOMING', challenge_type: 'hiring' },
    ] })
    expect(he).toHaveLength(1)
    expect(he[0].kind).toBe('hackathon')
    const cc = parseCodeChef({ status: 'success', future_contests: [{ contest_code: 'START210', contest_name: 'Starters 210', contest_start_date_iso: '2026-10-22T20:00:00+05:30', contest_end_date_iso: '2026-10-22T22:00:00+05:30' }], present_contests: [] })
    expect(cc[0]).toMatchObject({ url: 'https://www.codechef.com/START210', starts_at: '2026-10-22T14:30:00.000Z' })
    const lc = parseLeetCode({ data: { upcomingContests: [{ title: 'Weekly Contest 470', titleSlug: 'weekly-contest-470', startTime: 1792546200, duration: 5400 }] } })
    expect(lc[0]).toMatchObject({ url: 'https://leetcode.com/contest/weekly-contest-470/', ends_at: '2026-10-21T03:00:00.000Z' })
  })
  it('generic RSS / Atom and iCal (TZID, all-day)', () => {
    const rss = `<?xml version="1.0"?><rss><channel><item><title><![CDATA[City Hack Night]]></title><link>https://meetup.example.org/hack-night</link><guid>hn-1</guid><description>Join us &amp; build</description><category>Open Source</category><ev:startdate>2026-11-05T18:00:00+01:00</ev:startdate><ev:location>Amsterdam, Netherlands</ev:location></item></channel></rss>`
    const r = parseRss(rss, { source: 'rss:city', name: 'City devs' })
    expect(r[0]).toMatchObject({ title: 'City Hack Night', source_id: 'hn-1', starts_at: '2026-11-05T17:00:00.000Z', organiser: 'City devs', mode: 'in_person', location: { city: 'Amsterdam', country: 'NL' } })
    const atom = `<feed><entry><title>Atom Jam</title><link href="https://jam.example.com/"/><id>urn:1</id><summary>game jam</summary><category term="Gaming"/></entry></feed>`
    expect(parseRss(atom, { source: 'rss:jam' })[0]).toMatchObject({ url: 'https://jam.example.com/', starts_at: null })
    const ics = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:abc@x', 'SUMMARY:Pune Buildathon', 'DTSTART;TZID=Asia/Kolkata:20261108T100000', 'DTEND;TZID=Asia/Kolkata:20261108T180000', 'LOCATION:Pune\\, India', 'URL:https://build.example.in/', 'DESCRIPTION:Build things\\nfast', 'CATEGORIES:AI,Fintech', 'END:VEVENT',
      'BEGIN:VEVENT', 'UID:day@x', 'SUMMARY:Online Hack Day', 'DTSTART;VALUE=DATE:20261201', 'DTEND;VALUE=DATE:20261202', 'DESCRIPTION:Details at https://day.example.com/ now', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n')
    const ev = parseIcal(ics, { source: 'ical:pune' })
    expect(ev[0]).toMatchObject({ kind: 'buildathon', mode: 'in_person', starts_at: '2026-11-08T04:30:00.000Z', ends_at: '2026-11-08T12:30:00.000Z', location: { city: 'Pune', country: 'IN' } })
    expect(ev[1]).toMatchObject({ url: 'https://day.example.com/', mode: 'online', starts_at: '2026-12-01T00:00:00.000Z', ends_at: '2026-12-01T23:59:59.000Z' })
  })
  it('simulated + internal sources', () => {
    const sim = simulatedEvents(NOW)
    expect(sim).toHaveLength(8)
    expect(sim.every((e) => sanitizeEvent(e))).toBe(true)
    const own = mapInternal([{ type: 'hackathon', id: 'h1', slug: 'spring-hack', title: 'Spring Hack', description: '', starts_at: '2026-11-01T00:00:00Z', ends_at: '2026-11-02T00:00:00Z', banner_url: '' }], 'https://codespectra.ai')
    expect(own[0]).toMatchObject({ url: 'https://codespectra.ai/hackathons/spring-hack', featured: true, internal: true, source: 'codespectra' })
  })
  it('sources whose terms need permission are off by default', () => {
    const off = BUILTIN_CONNECTORS.filter((c) => c.needsPermission).map((c) => c.id).sort()
    expect(off).toEqual(['codechef', 'devfolio', 'devpost', 'eventbrite', 'hackerearth', 'leetcode', 'mlh', 'unstop'])
    expect(BUILTIN_CONNECTORS.filter((c) => c.needsPermission).every((c) => !c.defaultEnabled)).toBe(true)
  })
})

// ─── Dedupe / refresh / archive ─────────────────────────────────────────────

const ev = (over: Partial<ExternalEvent>): ExternalEvent => sanitizeEvent({
  source: 'devpost', source_id: 'x', title: 'Acme AI Hackathon 2026', url: 'https://acme.dev/hack', organiser: null, kind: 'hackathon', mode: 'online',
  location: { city: null, country: null }, starts_at: '2026-11-01T00:00:00Z', ends_at: '2026-11-03T00:00:00Z', registration_deadline: null, prize: null,
  themes: [], image: null, description_summary: '', ...over,
})!

describe('dedupe', () => {
  it('same canonical url across sources → one event, best source wins, gaps filled', () => {
    const a = ev({ source: 'devpost', source_id: '1', url: 'https://www.acme.dev/hack/?utm_source=devpost', image: 'https://img.example.com/a.png' })
    const b = ev({ source: 'ical:acme', source_id: 'u1', url: 'https://acme.dev/hack', organiser: 'Acme' })
    const groups = dedupeBatch([a, b])
    expect(groups).toHaveLength(1)
    expect(groups[0].event.source).toBe('ical:acme')
    expect(groups[0].event.image).toBe('https://img.example.com/a.png')
    expect(groups[0].aliases.map((x) => x.source)).toEqual(['devpost'])
  })
  it('fuzzy: near-identical titles within a day merge; different events don’t', () => {
    expect(titleSimilarity('Acme AI Hackathon 2026', 'ACME AI hackathon')).toBe(1)
    expect(sameEvent(ev({ url: 'https://a.example/1' }), ev({ url: 'https://b.example/2', title: 'Acme AI Hackathon', starts_at: '2026-11-01T10:00:00Z' }))).toBe(true)
    expect(sameEvent(ev({ url: 'https://a.example/1' }), ev({ url: 'https://b.example/2', starts_at: '2026-11-05T00:00:00Z' }))).toBe(false)
    expect(sameEvent(ev({ url: 'https://a.example/1' }), ev({ url: 'https://b.example/2', title: 'Winter Robotics Hackathon' }))).toBe(false)
  })
  it('matches stored events by source id, url key or fuzzy title/date; refresh keeps admin edits', () => {
    const now = NOW.toISOString()
    const stored = toDoc(ev({ source: 'devpost', source_id: '1' }), [], now)
    stored.edited_fields = ['title']
    stored.title = 'Edited title'
    const incoming = ev({ source: 'devpost', source_id: '1', title: 'Acme AI Hackathon (new name)', ends_at: '2026-11-04T00:00:00Z' })
    expect(matchExisting({ event: incoming, aliases: [] }, [stored])?.id).toBe(stored.id)
    const p = refreshPatch(stored, incoming, [], now)
    expect(p.title).toBeUndefined()
    expect(p.ends_at).toBe('2026-11-04T00:00:00.000Z')
    // A lower-priority source can't overwrite, only fill gaps.
    const own = toDoc(ev({ source: 'codespectra', source_id: 'h:1', featured: true, internal: true }), [], now)
    const p2 = refreshPatch(own, ev({ source: 'devpost', source_id: '9', ends_at: '2026-12-01T00:00:00Z', organiser: 'Someone' }), [], now)
    expect(p2.ends_at).toBeUndefined()
    expect(p2.organiser).toBe('Someone')
    expect(p2.sources).toHaveLength(2)
  })
  it('archives after the end (or long silence when undated)', () => {
    const base = { status: 'published' as const, starts_at: null, last_seen_at: NOW.toISOString() }
    expect(shouldArchive({ ...base, ends_at: '2026-10-19T01:00:00Z' }, NOW)).toBe(true)
    expect(shouldArchive({ ...base, ends_at: '2026-10-19T08:00:00Z' }, NOW)).toBe(false)
    expect(shouldArchive({ ...base, ends_at: null, last_seen_at: '2026-09-01T00:00:00Z' }, NOW)).toBe(true)
    expect(shouldArchive({ ...base, status: 'hidden', ends_at: '2020-01-01T00:00:00Z' } as never, NOW)).toBe(false)
  })
})

describe('robots.txt', () => {
  const txt = `User-agent: *\nDisallow: /api/\nAllow: /api/public/\n\nUser-agent: BadBot\nDisallow: /\n`
  it('applies the * group, longest match, Allow on ties', () => {
    expect(robotsAllows(txt, '/hackathons')).toBe(true)
    expect(robotsAllows(txt, '/api/hackathons')).toBe(false)
    expect(robotsAllows(txt, '/api/public/events')).toBe(true)
  })
  it('a group for our bot replaces *', () => {
    expect(robotsAllows('User-agent: *\nAllow: /\nUser-agent: CodeSpectraEventsBot\nDisallow: /events', '/events/1')).toBe(false)
    expect(robotsAllows('User-agent: *\nDisallow: /*.json$', '/list.json')).toBe(false)
    expect(robotsAllows('User-agent: *\nDisallow:', '/anything')).toBe(true)
  })
})

// ─── Public helpers / AI / admin ────────────────────────────────────────────

describe('public filters, UTM and share links', () => {
  const now = NOW.toISOString()
  const docs = simulatedEvents(NOW).map((e) => toPublic(toDoc(sanitizeEvent(e)!, [], now)))
  it('filters by kind, mode, country, theme, prize, deadline and dates', () => {
    expect(filterEvents(docs, { kinds: ['ctf'] }).map((e) => e.title)).toEqual(['Demo Capture The Flag Open'])
    expect(filterEvents(docs, { countries: ['IN'] }).map((e) => e.title)).toEqual(['Demo Hyderabad Buildathon'])
    expect(filterEvents(docs, { modes: ['hybrid'] })).toHaveLength(1)
    expect(filterEvents(docs, { prize: true }).every((e) => (e.prize_usd_minor || 0) > 0)).toBe(true)
    expect(filterEvents(docs, { deadline_soon: true }, NOW).map((e) => e.title).sort()).toEqual(['Demo AI Builders Hackathon', 'Demo Weekly Algorithms Round'])
    expect(filterEvents(docs, { themes: ['security'] }).map((e) => e.kind)).toEqual(['ctf'])
    expect(filterEvents(docs, { from: '2026-11-10', to: '2026-11-30' }).map((e) => e.title).sort()).toEqual(['Demo Climate Data Challenge', 'Demo Developer Conference', 'Demo Open Source Sprint'])
  })
  it('adds UTM to external links only and keeps existing utm', () => {
    expect(withUtm('https://x.dev/e?utm_source=them', false)).toBe('https://x.dev/e?utm_source=them&utm_medium=events&utm_campaign=events_feed')
    expect(withUtm('https://codespectra.ai/hackathons/a', true)).toBe('https://codespectra.ai/hackathons/a')
    expect(shareLinks('https://cs.ai/events/ef_1', 'Hack & win').x).toContain('text=Hack%20%26%20win')
  })
})

describe('AI output + admin edits + settings', () => {
  it('cleans model output: no links, vocabulary themes only', () => {
    expect(cleanAiResult({ summary: 'Build support bots in a weekend. https://evil.example Prizes for teams.', themes: ['ai-ml', 'hacking-the-planet'] })).toEqual({ summary: 'Build support bots in a weekend. Prizes for teams.', themes: ['ai-ml'] })
    expect(cleanAiResult({ summary: 'short' })).toBeNull()
    expect(cleanAiResult('nope')).toBeNull()
  })
  it('validates edits and pins edited fields', () => {
    const r = buildEventEdit({ featured: true, fields: { title: '  New  ', starts_at: '2026-11-01T10:00:00Z', ends_at: '2026-11-02T10:00:00Z', country: 'India', prize_amount: '1500', prize_currency: 'usd' } }, NOW.toISOString())
    expect('set' in r && r.set).toMatchObject({ featured: true, title: 'New', location: { city: null, country: 'IN' }, prize: { amount_minor: 150000, currency: 'USD' } })
    expect('pinned' in r && r.pinned).toEqual(expect.arrayContaining(['featured', 'title', 'starts_at', 'location', 'prize']))
    expect(buildEventEdit({ fields: { url: 'javascript:x' } }, '')).toEqual({ error: 'Enter a valid http(s) link' })
    expect(buildEventEdit({ fields: { starts_at: '2026-11-03T00:00:00Z', ends_at: '2026-11-01T00:00:00Z' } }, '')).toEqual({ error: 'End must be after start' })
    expect(buildEventEdit({ status: 'deleted' }, '')).toEqual({ error: 'Invalid status' })
  })
  it('feed inputs: https only, slug ids', () => {
    expect(validateFeedInput({ type: 'ical', name: 'Pune Devs', url: 'https://pune.dev/cal.ics', kind: 'buildathon', country: 'India' })).toMatchObject({ ok: true, id: 'ical:pune-devs', config: { country: 'IN', kind: 'buildathon' } })
    expect(validateFeedInput({ type: 'rss', name: 'x', url: 'http://insecure.example' })).toMatchObject({ ok: false })
  })
  it('settings clamp and templates fill', () => {
    const s = normalizeEventsFeedSettings({ pull_interval_hours: 0, digest_day: 9, digest_timezone: 'Mars/Base', whatsapp_template_alert: 'Event Alert!' })
    expect(s).toMatchObject({ pull_interval_hours: 6, digest_day: 1, digest_timezone: 'Asia/Kolkata', whatsapp_template_alert: 'eventalert' })
    expect(fillTemplate('New event: {title} {x}', { title: 'Hack' })).toBe('New event: Hack {x}')
  })
  it('run markers are claimed once per window', async () => {
    expect(await claimRun('last_pull_at', NOW, 6 * 3600_000)).toBe(true)
    expect(await claimRun('last_pull_at', new Date(NOW.getTime() + 60_000), 6 * 3600_000)).toBe(false)
    expect(await claimRun('last_pull_at', new Date(NOW.getTime() + 7 * 3600_000), 6 * 3600_000)).toBe(true)
  })
})

// ─── Notification selection ─────────────────────────────────────────────────

function feedDoc(over: Partial<FeedEventDoc>): FeedEventDoc {
  return { ...toDoc(ev({ source_id: Math.random().toString(36), url: `https://e.example/${Math.random().toString(36).slice(2)}` }), [], '2026-10-18T00:00:00.000Z'), ...over }
}

describe('digest / alerts / reminders selection', () => {
  it('ISO week keys in the digest time zone', () => {
    expect(isoWeekKey(new Date('2026-10-19T10:00:00Z'), 'UTC')).toBe('2026-W43')
    expect(isoWeekKey(new Date('2026-10-18T20:00:00Z'), 'Asia/Kolkata')).toBe('2026-W43') // already Monday in IST
    expect(isoWeekKey(new Date('2027-01-01T12:00:00Z'), 'UTC')).toBe('2026-W53')
  })
  it('digest: new this week + closing soon, filtered, featured first', () => {
    const events = [
      feedDoc({ id: 'a', title: 'Online AI', first_seen_at: '2026-10-17T00:00:00Z', starts_at: '2026-11-05T00:00:00Z' }),
      feedDoc({ id: 'b', title: 'Old but closing', first_seen_at: '2026-09-01T00:00:00Z', registration_deadline: '2026-10-22T00:00:00Z' }),
      feedDoc({ id: 'c', title: 'Old', first_seen_at: '2026-09-01T00:00:00Z', registration_deadline: '2026-12-22T00:00:00Z' }),
      feedDoc({ id: 'd', title: 'In person Berlin', mode: 'in_person', location: { city: 'Berlin', country: 'DE' }, first_seen_at: '2026-10-18T00:00:00Z' }),
      feedDoc({ id: 'e', title: 'Ours', featured: true, first_seen_at: '2026-10-18T00:00:00Z', starts_at: '2026-12-01T00:00:00Z' }),
      feedDoc({ id: 'f', title: 'Hidden', status: 'hidden', first_seen_at: '2026-10-18T00:00:00Z' }),
    ]
    const all = selectDigest(events, { filters: {} }, NOW)
    expect(all.fresh.map((e) => e.id)).toEqual(['e', 'd', 'a'])
    expect(all.closing.map((e) => e.id)).toEqual(['b'])
    const onlineOnly = selectDigest(events, { filters: { events: { modes: ['online'] } } }, NOW)
    expect(onlineOnly.fresh.map((e) => e.id)).not.toContain('d')
  })
  it('alerts only for events first seen in the last 48 h that haven’t started', () => {
    const events = [
      feedDoc({ id: 'new', first_seen_at: '2026-10-19T09:00:00Z', starts_at: '2026-11-01T00:00:00Z' }),
      feedDoc({ id: 'old', first_seen_at: '2026-10-10T00:00:00Z', starts_at: '2026-11-01T00:00:00Z' }),
      feedDoc({ id: 'started', first_seen_at: '2026-10-19T09:00:00Z', starts_at: '2026-10-19T00:00:00Z', ends_at: '2026-10-25T00:00:00Z' }),
    ]
    expect(alertCandidates(events, NOW).map((e) => e.id)).toEqual(['new'])
  })
  it('reminders: saved events closing within 48 h', () => {
    const events = [
      feedDoc({ id: 's1', registration_deadline: '2026-10-20T10:00:00Z' }),
      feedDoc({ id: 's2', registration_deadline: '2026-10-25T10:00:00Z' }),
      feedDoc({ id: 's3', registration_deadline: '2026-10-19T09:00:00Z' }),
      feedDoc({ id: 'other', registration_deadline: '2026-10-20T10:00:00Z' }),
    ]
    expect(remindersDue(events, ['s1', 's2', 's3'], NOW).map((e) => e.id)).toEqual(['s1'])
  })
})

// ─── End-to-end pull on the in-memory DB ────────────────────────────────────

describe('runPull', () => {
  const cf = { status: 'OK', result: [{ id: 2150, name: 'Codeforces Round 1050', type: 'CF', phase: 'BEFORE', durationSeconds: 7200, startTimeSeconds: 1792483500 }] }
  const get: HttpGet = async (url) => {
    if (url.startsWith('https://codeforces.com/api/')) return { status: 200, text: JSON.stringify(cf), contentType: 'application/json' }
    if (url.startsWith('https://ctftime.org/')) throw new Error('network down')
    return { status: 404, text: '', contentType: 'text/plain' }
  }

  it('publishes automatically, isolates failing sources, skips needs-permission sources, and is idempotent', async () => {
    const r1 = await runPull({ now: NOW, get, ai: false, only: ['codeforces', 'ctftime', 'simulated', 'devpost'] })
    const by = Object.fromEntries(r1.sources.map((s) => [s.id, s]))
    expect(by.codeforces).toMatchObject({ ok: true, count: 1 })
    expect(by.ctftime).toMatchObject({ ok: false, error: 'network down' })
    expect(by.devpost).toMatchObject({ skipped: 'disabled' })
    expect(r1.inserted).toBe(1 + 8)
    const feed = db.current.collection('events_feed')
    expect(feed.docs.every((d) => d.status === 'published')).toBe(true)
    expect(feed.docs.some((d) => 'raw_description' in d)).toBe(false)
    const src = db.current.collection('events_feed_sources').docs.find((d) => d.id === 'ctftime')!
    expect(src).toMatchObject({ last_error: 'network down', failures: 1 })

    const r2 = await runPull({ now: new Date(NOW.getTime() + 6 * 3600_000), get, ai: false, only: ['codeforces', 'simulated'] })
    expect(r2.inserted).toBe(0)
    expect(feed.docs).toHaveLength(9)
  })

  it('admin hide survives later pulls; ended events are archived', async () => {
    await runPull({ now: NOW, get, ai: false, only: ['codeforces'] })
    const feed = db.current.collection('events_feed')
    feed.docs[0].status = 'hidden'
    await runPull({ now: new Date(NOW.getTime() + 3600_000), get, ai: false, only: ['codeforces'] })
    expect(feed.docs[0].status).toBe('hidden')
    feed.docs[0].status = 'published'
    const r = await runPull({ now: new Date('2026-10-21T00:00:00Z'), get, ai: false, only: [] })
    expect(r.archived).toBe(1)
    expect(feed.docs[0].status).toBe('archived')
  })

  it('AI summary for long descriptions (data only; result validated)', async () => {
    const long = 'x '.repeat(300)
    const ics = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:1', 'SUMMARY:Agents Hackathon', 'DTSTART:20261108T100000Z', 'URL:https://agents.example/', `DESCRIPTION:${long}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n')
    db.current.collection('events_feed_sources').docs.push({ id: 'ical:agents', enabled: true, config: { url: 'https://agents.example/cal.ics', name: 'Agents' }, runs: 0, failures: 0 })
    const r = await runPull({ now: NOW, ai: true, only: ['ical:agents'], get: async () => ({ status: 200, text: ics, contentType: 'text/calendar' }) })
    expect(r.ai).toBe(1)
    const d = db.current.collection('events_feed').docs[0]
    expect(d).toMatchObject({ ai_summary: true, description_summary: 'A weekend online hackathon focused on building AI agents for small businesses.' })
    expect(d.themes).toContain('ai-ml')
    expect(d.themes).not.toContain('not-a-theme')
  })
})

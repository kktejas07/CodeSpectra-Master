/**
 * First-party analytics: anonymisation, consent gating, collect validation +
 * bot filter, rollup math, funnels / cohorts, and scope isolation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FakeDb } from './helpers/fake-mongo'

const db = { current: new FakeDb() }
vi.mock('@/lib/mongodb', () => ({ getMongoDb: async () => db.current }))

import { visitorHash } from '@/lib/analytics/hash'
import { buildDocs, ingestRequest, type IngestContext } from '@/lib/analytics/ingest'
import { cleanPath, isBot, privateRoute, referrerHost, scrubProps, sourceOf, deviceClass } from '@/lib/analytics/privacy'
import { canLoad, effectiveConsent, googleConsentState, parseConsent, serializeConsent } from '@/lib/analytics/consent'
import { buildDailyRollup, mergeRollups } from '@/lib/analytics/rollup'
import { cohortRetention, computeFunnel, orderedFunnelCounts, weekStart } from '@/lib/analytics/funnels'
import { parseRange, previousRange, dayKeys, delta } from '@/lib/analytics/range'
import { publicConfigFrom, validateIntegrationPatch } from '@/lib/analytics/integrations'
import { mapBusEvent, busProps } from '@/lib/analytics/events'
import { computeMrr, getFunnel, getKpis, getAssessmentAnalytics, assertScope, ScopeError } from '@/lib/analytics/query'
import type { CollectPayload } from '@/lib/analytics/schema'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
const NOW = new Date('2026-03-10T12:00:00.000Z')

const ctx = (o: Partial<IngestContext> = {}): IngestContext => ({
  now: NOW, userId: 'u1', tenantId: 't1', visitorHash: 'vh_abc', country: 'IN', ua: UA, ownHost: 'codespectra.ai', sessionId: 's1', ...o,
})

beforeEach(() => { db.current = new FakeDb() })

// ─── Hashing / anonymisation ────────────────────────────────────────────────

describe('visitor hash', () => {
  it('is stable for one salt, changes with the daily salt, and never contains the IP', () => {
    const a = visitorHash('salt-day-1', '203.0.113.7', UA, 'codespectra.ai')
    expect(visitorHash('salt-day-1', '203.0.113.7', UA, 'codespectra.ai')).toBe(a)
    expect(visitorHash('salt-day-2', '203.0.113.7', UA, 'codespectra.ai')).not.toBe(a)
    expect(visitorHash('salt-day-1', '203.0.113.8', UA, 'codespectra.ai')).not.toBe(a)
    expect(a).not.toContain('203')
    expect(a).toMatch(/^[A-Za-z0-9_-]{22}$/)
  })
})

describe('buildDocs privacy rules', () => {
  const payload = (mode: 'anon' | 'full', events: CollectPayload['events']): CollectPayload => ({ v: 1, mode, ...(mode === 'full' ? { aid: 'aid_12345678', sid: 'sid_12345678' } : {}), events })

  it('anon mode stores no user id and no persistent id, only the daily hash', () => {
    const out = buildDocs(payload('anon', [{ t: 'pv', path: '/pricing?utm_source=x', ref: 'https://www.google.com/search?q=a' }]), ctx())
    const e = out.events[0]
    expect(e.user_id).toBeUndefined()
    expect(e.anonymous_id).toBeUndefined()
    expect(e.visitor_hash).toBe('vh_abc')
    expect(e.path).toBe('/pricing')
    expect(e.referrer).toBe('google.com')
    expect(e.source).toBe('google.com')
  })

  it('full mode (consent) keeps the random id and the signed-in user, not the hash', () => {
    const out = buildDocs(payload('full', [{ t: 'pv', path: '/learn', utm: { source: 'LinkedIn', campaign: 'Spring' } }]), ctx())
    const e = out.events[0]
    expect(e.user_id).toBe('u1')
    expect(e.anonymous_id).toBe('aid_12345678')
    expect(e.visitor_hash).toBeUndefined()
    expect(e.source).toBe('linkedin')
    expect(e.utm_campaign).toBe('Spring')
  })

  it('private pages: count only, collapsed to a template; events and vitals there are dropped', () => {
    const out = buildDocs(payload('full', [
      { t: 'pv', path: '/bgv/secret-token-123', ref: 'https://mail.example.com' },
      { t: 'ev', name: 'clicked', path: '/assessment/invite/tok_abcdef' },
      { t: 'wv', name: 'LCP', value: 1200, path: '/marketplace/checkout' },
    ]), ctx())
    expect(out.events).toHaveLength(1)
    const e = out.events[0]
    expect(e.path).toBe('/bgv/[token]')
    expect(e.private).toBe(true)
    expect(e).not.toHaveProperty('user_id')
    expect(e).not.toHaveProperty('anonymous_id')
    expect(e).not.toHaveProperty('visitor_hash')
    expect(e).not.toHaveProperty('session_id')
    expect(e).not.toHaveProperty('referrer')
    expect(out.vitals).toHaveLength(0)
    expect(out.dropped).toBe(2)
  })

  it('scrubs personal data from props and reserves business event names for the server', () => {
    const out = buildDocs(payload('anon', [
      { t: 'ev', name: 'practice_run', path: '/dashboard/practice', props: { language: 'python', email: 'a@b.co', note: 'mail me at a@b.co', phone_number: '9876543210', count: 3 } },
      { t: 'ev', name: 'purchase', path: '/pricing' },
    ]), ctx())
    expect(out.events).toHaveLength(1)
    expect(out.events[0].properties).toEqual({ language: 'python', count: 3 })
    expect(out.dropped).toBe(1)
  })

  it('keeps vitals with the route, and the user only with consent', () => {
    const anon = buildDocs(payload('anon', [{ t: 'wv', name: 'INP', value: 180, rating: 'good', path: '/jobs' }]), ctx())
    expect(anon.vitals[0]).toMatchObject({ route: '/jobs', metric_name: 'INP', metric_value: 180, user_id: null })
    const full = buildDocs(payload('full', [{ t: 'wv', name: 'INP', value: 180, path: '/jobs' }]), ctx())
    expect(full.vitals[0].user_id).toBe('u1')
  })
})

describe('privacy helpers', () => {
  it('detects bots, devices, private routes and own-site referrers', () => {
    expect(isBot('Googlebot/2.1 (+http://www.google.com/bot.html)')).toBe(true)
    expect(isBot('Mozilla/5.0 HeadlessChrome/120')).toBe(true)
    expect(isBot('')).toBe(true)
    expect(isBot(UA)).toBe(false)
    expect(deviceClass('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile/15E148')).toBe('mobile')
    expect(privateRoute('/interview/join/abc')).toBe('/interview/join/[token]')
    expect(privateRoute('/assessment/demo')).toBeNull()
    expect(privateRoute('/learn/how-to')).toBeNull()
    expect(referrerHost('https://app.codespectra.ai/x', 'codespectra.ai')).toBe('')
    expect(sourceOf('', '')).toBe('direct')
    expect(cleanPath('https://x.com/a//b/?q=1#h')).toBe('/a/b')
    expect(scrubProps({ user_name: 'x', ok: true })).toEqual({ ok: true })
  })
})

// ─── Consent gating ─────────────────────────────────────────────────────────

describe('consent', () => {
  it('round-trips and expires after a year', () => {
    const raw = serializeConsent({ analytics: true, marketing: false, ts: NOW.toISOString() })
    expect(parseConsent(raw, NOW)).toEqual({ analytics: true, marketing: false, ts: NOW.toISOString() })
    expect(parseConsent(raw, new Date(NOW.getTime() + 366 * 86_400_000))).toBeNull()
    expect(parseConsent('2.1.1.1767225600', NOW)).toBeNull()
    expect(parseConsent('garbage', NOW)).toBeNull()
  })

  it('defaults to anonymous with no banner answer, and DNT / GPC switch marketing off for good', () => {
    const none = effectiveConsent(null, { dnt: false, gpc: false })
    expect(none).toEqual({ analytics: false, marketing: false, decided: false, mode: 'anon' })
    expect(canLoad(none, 'analytics')).toBe(false)

    const gpc = effectiveConsent(null, { dnt: false, gpc: true })
    expect(gpc.decided).toBe(true)
    expect(gpc.mode).toBe('anon')

    const optedIn = { analytics: true, marketing: true, ts: NOW.toISOString() }
    const withSignal = effectiveConsent(optedIn, { dnt: true, gpc: false })
    expect(withSignal.analytics).toBe(true)
    expect(withSignal.marketing).toBe(false)
    expect(canLoad(withSignal, 'marketing')).toBe(false)

    const all = effectiveConsent(optedIn, { dnt: false, gpc: false })
    expect(all.mode).toBe('full')
    expect(googleConsentState(all)).toEqual({ analytics_storage: 'granted', ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted' })
    expect(googleConsentState(none).ad_storage).toBe('denied')
  })

  it('third-party ids are validated before rendering (no script injection)', () => {
    const c = publicConfigFrom({ ga4_measurement_id: 'G-ABC123', gtm_container_id: "GTM-1');alert(1)//", meta_pixel_id: '123456789012', posthog_project_key: 'phc_abcdefghijklmnopqrstuv', posthog_host: 'javascript:alert(1)' })
    expect(c.ga4).toBe('G-ABC123')
    expect(c.gtm).toBeUndefined()
    expect(c.metaPixel).toBe('123456789012')
    expect(c.posthog).toEqual({ key: 'phc_abcdefghijklmnopqrstuv', host: 'https://us.i.posthog.com' })
    expect(validateIntegrationPatch({ ga4_measurement_id: 'UA-1' })).toMatch(/Google Analytics/)
    expect(validateIntegrationPatch({ ga4_measurement_id: '' })).toBeNull()
    expect(validateIntegrationPatch({ analytics_retention_days: '10' })).toMatch(/retention/)
  })
})

// ─── Collect endpoint: validation + bot filter ──────────────────────────────

describe('ingestRequest', () => {
  const req = (body: unknown, ua = UA) => new Request('https://codespectra.ai/api/analytics/collect', {
    method: 'POST',
    // W4-06: browser beacons from our own pages carry Origin.
    headers: { 'content-type': 'application/json', 'user-agent': ua, origin: 'https://codespectra.ai', 'cf-connecting-ip': '198.51.100.4', 'cf-ipcountry': 'in' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })

  it('drops bots without storing anything', async () => {
    const out = await ingestRequest(req({ v: 1, mode: 'anon', events: [{ t: 'pv', path: '/' }] }, 'Mozilla/5.0 (compatible; bingbot/2.0)'), { userId: null, tenantId: null }, NOW)
    expect(out).toEqual({ status: 202, body: { ok: true, accepted: 0 } })
    expect(db.current.collection('analytics_events').docs).toHaveLength(0)
  })

  it('rejects malformed, unknown-field and oversized payloads', async () => {
    expect((await ingestRequest(req('{nope'), { userId: null, tenantId: null }, NOW)).status).toBe(400)
    expect((await ingestRequest(req({ v: 1, mode: 'anon', events: [] }), { userId: null, tenantId: null }, NOW)).status).toBe(400)
    expect((await ingestRequest(req({ v: 1, mode: 'anon', events: [{ t: 'pv', path: '/', ip: '1.2.3.4' }] }), { userId: null, tenantId: null }, NOW)).status).toBe(400)
    expect((await ingestRequest(req({ v: 1, mode: 'anon', events: [{ t: 'ev', name: 'Bad Name', path: '/' }] }), { userId: null, tenantId: null }, NOW)).status).toBe(400)
    const many = Array.from({ length: 31 }, () => ({ t: 'pv', path: '/' }))
    expect((await ingestRequest(req({ v: 1, mode: 'anon', events: many }), { userId: null, tenantId: null }, NOW)).status).toBe(400)
    expect((await ingestRequest(req('x'.repeat(20_000)), { userId: null, tenantId: null }, NOW)).status).toBe(413)
  })

  it('stores anonymous page views with a hash (no IP, no user) and builds a server-side session', async () => {
    const out = await ingestRequest(req({ v: 1, mode: 'anon', events: [{ t: 'pv', path: '/pricing' }, { t: 'pv', path: '/features' }] }), { userId: 'u9', tenantId: 't9' }, NOW)
    expect(out.status).toBe(200)
    const rows = db.current.collection('analytics_events').docs
    expect(rows).toHaveLength(2)
    expect(JSON.stringify(rows)).not.toContain('198.51.100.4')
    expect(rows[0].user_id).toBeUndefined()
    expect(rows[0].visitor_hash).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(rows[0].country).toBe('IN')
    const sessions = db.current.collection('analytics_sessions').docs
    expect(sessions).toHaveLength(1)
    expect(sessions[0]).toMatchObject({ entry_page: '/pricing', exit_page: '/features', pageviews: 2 })
    expect(db.current.collection('analytics_user_days').docs).toHaveLength(0)

    // Same visitor within 30 minutes → same session.
    await ingestRequest(req({ v: 1, mode: 'anon', events: [{ t: 'pv', path: '/learn' }] }), { userId: null, tenantId: null }, new Date(NOW.getTime() + 60_000))
    expect(db.current.collection('analytics_sessions').docs).toHaveLength(1)
    expect(db.current.collection('analytics_events').docs[2].session_id).toBe(rows[0].session_id)
  })

  it('with consent records the user and an active day', async () => {
    await ingestRequest(req({ v: 1, mode: 'full', aid: 'aid_12345678', sid: 'sid_12345678', events: [{ t: 'pv', path: '/dashboard' }] }), { userId: 'u9', tenantId: 't9' }, NOW)
    expect(db.current.collection('analytics_events').docs[0]).toMatchObject({ user_id: 'u9', anonymous_id: 'aid_12345678', session_id: 'f_sid_12345678' })
    expect(db.current.collection('analytics_user_days').docs[0]).toMatchObject({ user_id: 'u9', tenant_id: 't9', day: '2026-03-10' })
  })
})

// ─── Rollups ────────────────────────────────────────────────────────────────

describe('rollups', () => {
  const t = (m: number) => new Date(NOW.getTime() + m * 60_000)
  const pv = (o: Record<string, unknown>) => ({ event: 'page_view', kind: 'page' as const, ...o })

  it('counts page views, visitors, sessions, bounces, landing pages and sources', () => {
    const r = buildDailyRollup('2026-03-10', [
      pv({ ts: t(1), path: '/a', visitor_hash: 'v1', session_id: 's1', source: 'google.com', country: 'IN', device_type: 'mobile' }),
      pv({ ts: t(0), path: '/home', visitor_hash: 'v1', session_id: 's1', source: 'google.com', country: 'IN', device_type: 'mobile' }),
      pv({ ts: t(2), path: '/a', anonymous_id: 'a2', session_id: 's2', source: 'direct', utm_campaign: 'spring', country: 'US' }),
      pv({ ts: t(3), path: '/bgv/[token]', private: true }),
      { event: 'practice_run', kind: 'event' as const, ts: t(4), user_id: 'u1' },
      { event: 'signup', kind: 'server' as const, ts: t(5), user_id: 'u2' },
    ] as never)
    expect(r).toMatchObject({ pageviews: 3, private_pageviews: 1, visitors: 2, sessions: 2, bounces: 1, users: 2 })
    expect(r.landings).toEqual({ '/home': 1, '/a': 1 })
    // Stored with '.' escaped (Mongo field names); mergeRollups restores it.
    expect(r.sources).toEqual({ 'google\uFF0Ecom': 1, direct: 1 })
    expect(r.campaigns).toEqual({ spring: 1 })
    expect(r.events).toEqual({ practice_run: 1, signup: 1 })
    expect(r.paths['/a']).toBe(2)
  })

  it('merges days, restores dotted keys and fills missing days with zeros', () => {
    const d1 = buildDailyRollup('2026-03-09', [pv({ ts: t(0), path: '/x', visitor_hash: 'v', session_id: 's', source: 'google.com' })] as never)
    const d2 = buildDailyRollup('2026-03-11', [pv({ ts: t(0), path: '/x', visitor_hash: 'v', session_id: 's', source: 'google.com' })] as never)
    const m = mergeRollups([d1, d2], ['2026-03-09', '2026-03-10', '2026-03-11'])
    expect(m.pageviews).toBe(2)
    expect(m.visitors).toBe(2)
    expect(m.sources).toEqual({ 'google.com': 2 })
    expect(m.series.map((s) => s.pageviews)).toEqual([1, 0, 1])
    expect(m.bounce_rate).toBe(100)
  })
})

// ─── Funnels, cohorts, ranges, bus mapping ──────────────────────────────────

describe('funnels and cohorts', () => {
  it('computes step and overall conversion', () => {
    const f = computeFunnel('x', 'X', [{ key: 'a', label: 'A', count: 200 }, { key: 'b', label: 'B', count: 50 }, { key: 'c', label: 'C', count: 10 }])
    expect(f.steps.map((s) => s.step_conversion)).toEqual([null, 25, 20])
    expect(f.steps.map((s) => s.overall_conversion)).toEqual([100, 25, 5])
    expect(f.steps[1].dropoff).toBe(150)
    expect(f.overall).toBe(5)
    expect(computeFunnel('y', 'Y', [{ key: 'a', label: 'A', count: 0 }, { key: 'b', label: 'B', count: 0 }]).steps[1].step_conversion).toBeNull()
  })

  it('ordered funnel only counts actors that did the steps in order', () => {
    const counts = orderedFunnelCounts([
      new Map([['u1', 1], ['u2', 1], ['u3', 5]]),
      new Map([['u1', 2], ['u3', 3]]), // u3 out of order
      new Map([['u1', 3]]),
    ])
    expect(counts).toEqual([3, 1, 1])
  })

  it('weekly retention cohorts', () => {
    const now = new Date('2026-03-18T12:00:00.000Z') // Wednesday
    const w0 = weekStart(new Date('2026-03-02T00:00:00.000Z'))
    expect(w0.toISOString().slice(0, 10)).toBe('2026-03-02')
    const users = [{ id: 'a', signup: new Date('2026-03-02T10:00:00Z') }, { id: 'b', signup: new Date('2026-03-03T10:00:00Z') }]
    const active = new Map([['a', new Set(['2026-03-02', '2026-03-10'])], ['b', new Set(['2026-03-04'])]])
    const rows = cohortRetention(users, active, { weeks: 4, now })
    expect(rows).toEqual([{ cohort: '2026-03-02', size: 2, weeks: [100, 50, 0, null] }])
  })

  it('date ranges and change', () => {
    const r = parseRange({ from: '2026-03-01', to: '2026-03-07' }, NOW)
    expect(r.days).toBe(7)
    expect(dayKeys(r)[6]).toBe('2026-03-07')
    const p = previousRange(r)
    expect(p.to.toISOString()).toBe(r.from.toISOString())
    expect(parseRange({ preset: '7d' }, NOW).days).toBe(7)
    expect(parseRange({ from: '2020-01-01' }, NOW).days).toBeLessThanOrEqual(400)
    expect(delta(150, 100)).toBe(50)
    expect(delta(5, 0)).toBeNull()
  })

  it('maps automation events to analytics events without personal data', () => {
    const out = mapBusEvent({ id: 'e1', type: 'candidate.stage_changed', tenant_id: 't1', payload: { application_id: 'a1', to_stage_type: 'hired', email: 'x@y.z', candidate_name: 'Asha' } })
    expect(out.map((e) => e.event)).toEqual(['stage_moved', 'hired'])
    expect(out[0].properties).toEqual({ application_id: 'a1', to_stage_type: 'hired' })
    expect(mapBusEvent({ id: 'e2', type: 'unknown.thing' })).toEqual([])
    expect(busProps({ amount_minor: 100, buyer_email: 'b@c.d' })).toEqual({ amount_minor: 100 })
  })

  it('MRR from the orders that funded active subscriptions', () => {
    const orders = new Map([['o1', { amount_paise: 120000, interval: 'year' }], ['o2', { amount_paise: 49900, interval: 'month' }]])
    expect(computeMrr([{ last_order_id: 'o1' }, { last_order_id: 'o2' }, { plan_id: 'pro', last_order_id: 'missing' }], orders, { pro: 10 })).toBe(100 + 499 + 10)
  })
})

// ─── Scope isolation ────────────────────────────────────────────────────────

describe('scope isolation', () => {
  async function seed() {
    const c = (n: string) => db.current.collection(n)
    const at = '2026-03-05T10:00:00.000Z'
    await c('exams').insertMany([{ id: 'eA', title: 'A test', tenant_id: 'tA' }, { id: 'eB', title: 'B test', tenant_id: 'tB' }])
    await c('candidate_invites').insertMany([
      { id: 'i1', exam_id: 'eA', tenant_id: 'tA', status: 'used', started_at: at, created_at: at },
      { id: 'i2', exam_id: 'eA', tenant_id: 'tA', status: 'pending', created_at: at },
      { id: 'i3', exam_id: 'eB', tenant_id: 'tB', status: 'used', started_at: at, created_at: at },
      { id: 'i4', exam_id: 'eB', tenant_id: 'tB', status: 'active', started_at: at, created_at: at },
      { id: 'i5', exam_id: 'eB', tenant_id: 'tB', status: 'pending', created_at: at },
    ])
    await c('exam_submissions').insertMany([
      { id: 's1', exam_id: 'eA', user_id: 'u1', score: 8, max_score: 10, submitted_at: at },
      { id: 's2', exam_id: 'eB', user_id: 'u2', score: 1, max_score: 10, submitted_at: at },
      { id: 's3', exam_id: 'eB', user_id: 'u3', score: 2, max_score: 10, submitted_at: at },
    ])
    // W4-13: public job pages are /jobs/<job_postings id> = ats_jobs.legacy_job_id.
    await c('ats_jobs').insertMany([{ id: 'jA', legacy_job_id: 'jpA', tenant_id: 'tA', pipeline: [] }, { id: 'jB', legacy_job_id: 'jpB', tenant_id: 'tB', pipeline: [] }])
    await c('ats_applications').insertMany([
      { id: 'a1', job_id: 'jA', tenant_id: 'tA', status: 'hired', created_at: at, history: [] },
      { id: 'a2', job_id: 'jB', tenant_id: 'tB', status: 'active', created_at: at, history: [] },
      { id: 'a3', job_id: 'jB', tenant_id: 'tB', status: 'hired', created_at: at, history: [] },
    ])
    await c('analytics_events').insertMany([
      { id: 'p1', event: 'page_view', path: '/jobs/jpA', ts: at, timestamp: at },
      { id: 'p2', event: 'page_view', path: '/jobs/jpB', ts: at, timestamp: at },
      { id: 'p3', event: 'page_view', path: '/jobs/jpB', ts: at, timestamp: at },
    ])
    await c('agent_messages').insertMany([
      { id: 'm1', tenant_id: 'tA', role: 'user', created_at: at },
      { id: 'm2', tenant_id: 'tB', role: 'user', created_at: at },
      { id: 'm3', tenant_id: 'tB', role: 'user', created_at: at },
    ])
  }
  const range = parseRange({ from: '2026-03-01', to: '2026-03-09' }, NOW)
  const A = { kind: 'tenant' as const, tenantId: 'tA' }

  it('a tenant sees only its own candidate funnel', async () => {
    await seed()
    const f = await getFunnel('candidate', range, A)
    expect(f.steps.map((s) => s.count)).toEqual([2, 1, 1])
    const all = await getFunnel('candidate', range, { kind: 'platform' })
    expect(all.steps[0].count).toBe(5)
  })

  it('a tenant sees only its own KPIs and assessment results', async () => {
    await seed()
    const k = Object.fromEntries((await getKpis(range, A, { compare: false })).map((x) => [x.key, x.value]))
    expect(k).toMatchObject({ candidates_invited: 2, tests_started: 1, tests_submitted: 1, avg_score: 80, applications: 1, hires: 1, copilot_messages: 1 })
    const a = await getAssessmentAnalytics(range, A)
    expect(a.tests.map((t) => t.exam_id)).toEqual(['eA'])
    expect(a.totals).toEqual({ tests: 1, submissions: 1 })
  })

  it('job views are limited to the tenant’s own jobs', async () => {
    await seed()
    const f = await getFunnel('hiring', range, A)
    expect(f.steps.map((s) => s.count)).toEqual([1, 1, 1])
  })

  it('refuses scopes without an id and platform-only funnels for tenants', async () => {
    expect(() => assertScope({ kind: 'tenant', tenantId: '' })).toThrow(ScopeError)
    await expect(getFunnel('acquisition', range, A)).rejects.toThrow(ScopeError)
    await expect(getFunnel('marketplace', range, A)).rejects.toThrow(ScopeError)
  })
})

// ─── Browser SDK consent gating ─────────────────────────────────────────────

describe('browser SDK', () => {
  it('stores nothing on the device without consent, an id with consent, and forgets it on withdrawal', async () => {
    const sdk = await import('@/lib/analytics')
    const bodies: string[] = []
    const fetchMock = vi.fn(async (_u: unknown, init?: { body?: string }) => { bodies.push(String(init?.body)); return new Response('{}') })
    vi.stubGlobal('fetch', fetchMock)
    // tests/setup.ts replaces localStorage with bare mocks — give them a working store here.
    const mem = new Map<string, string>()
    const ls = window.localStorage as unknown as Record<'getItem' | 'setItem' | 'removeItem', ReturnType<typeof vi.fn>>
    ls.getItem.mockImplementation((k: string) => (mem.has(k) ? mem.get(k) : null))
    ls.setItem.mockImplementation((k: string, v: string) => { mem.set(k, String(v)) })
    ls.removeItem.mockImplementation((k: string) => { mem.delete(k) })
    sessionStorage.clear()

    sdk.setConsent({ analytics: false, marketing: false, decided: true, mode: 'anon' })
    sdk.trackPageView('/pricing')
    sdk.track('practice_run', { language: 'go' })
    await sdk.flush()
    expect(localStorage.getItem('cs_aid')).toBeNull()
    expect(sessionStorage.getItem('cs_sid')).toBeNull()
    const anon = JSON.parse(bodies[0])
    expect(anon.mode).toBe('anon')
    expect(anon.aid).toBeUndefined()
    expect(anon.events.map((e: { t: string }) => e.t)).toEqual(['pv', 'ev'])

    sdk.setConsent({ analytics: true, marketing: false, decided: true, mode: 'full' })
    sdk.trackPageView('/learn')
    await sdk.flush()
    const full = JSON.parse(bodies[1])
    expect(full.mode).toBe('full')
    expect(full.aid).toBe(localStorage.getItem('cs_aid'))
    expect(full.sid).toMatch(/^[A-Za-z0-9_-]{8,64}$/)

    sdk.setConsent({ analytics: false, marketing: false, decided: true, mode: 'anon' })
    expect(localStorage.getItem('cs_aid')).toBeNull()
    expect(sessionStorage.getItem('cs_sid')).toBeNull()

    // Private pages: page count only, no custom events.
    window.history.pushState({}, '', '/bgv/tok_123')
    sdk.track('clicked')
    sdk.trackPageView('/bgv/tok_123')
    await sdk.flush()
    expect(JSON.parse(bodies[2]).events).toEqual([expect.objectContaining({ t: 'pv', path: '/bgv/tok_123' })])
    expect(JSON.parse(bodies[2]).events[0].ref).toBeUndefined()
    vi.unstubAllGlobals()
    ls.getItem.mockReset(); ls.setItem.mockReset(); ls.removeItem.mockReset()
  })
})

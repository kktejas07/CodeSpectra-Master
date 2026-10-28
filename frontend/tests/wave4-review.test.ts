/**
 * Wave 4 independent-review fixes (W4-01 … W4-19): logic coverage.
 */
import { describe, it, expect, vi } from 'vitest'
import { FakeDb } from './helpers/fake-mongo'
import { resolveClientIp, isPrivateIp } from '@/lib/client-ip'
import { tagPlanForPath } from '@/lib/analytics/tag-guard'
import { conversionsAllowed, serializeConsent } from '@/lib/analytics/consent'
import { candidateLookupFilter, candidateMap, recordingKeyRing, decryptWithRing, decryptOrder, examsDueForPurge } from '@/lib/proctoring/recordings'
import { encryptBytesWithKey } from '@/lib/ats/bgv/crypto'
import { reserveInviteQuotaWithLimit, releaseInviteQuota, quotaKey } from '@/lib/services/invite-quota'
import { capsAllow, eventAllowlist, parseCustomEventList, sameSiteOrigin, validPath, validateCustomEventList, dailyCaps } from '@/lib/analytics/guard'
import { buildDocs } from '@/lib/analytics/ingest'
import { rollupFromFacets, dayEventsPipeline, daySessionsPipeline } from '@/lib/analytics/rollup'
import { inprocMaxScan, DEFAULT_INPROC_MAX_SCAN } from '@/lib/rag/search'
import { creatorStillAuthorised, retargetDelivery } from '@/lib/agent/schedule'
import { createTtlCache } from '@/lib/seo/ttl-cache'
import { signOg, verifyOg } from '@/lib/seo/og-sign'
import { ogImagePath } from '@/lib/seo/metadata'
import { jobPagePaths } from '@/lib/analytics/query'
import { clientIp } from '@/lib/analytics/hash'
import { CANDIDATE_UNAVAILABLE } from '@/lib/interview-access'
import { INTEGRATION_FIELDS, publicConfigFrom } from '@/lib/analytics/integrations'

const H = (h: Record<string, string>) => new Headers(h)

describe('W4-01 client IP without TRUSTED_PROXY_CIDRS', () => {
  it('private peer → exactly one (right-most) XFF hop', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const h = H({ 'x-codespectra-peer': '172.17.0.1', 'x-forwarded-for': '6.6.6.6, 198.51.100.20' })
    expect(resolveClientIp(h, { nets: [], peerHeaderTrusted: true })).toBe('198.51.100.20')
    warn.mockRestore()
  })
  it('public peer → forwarding headers ignored', () => {
    const h = H({ 'x-codespectra-peer': '203.0.113.7', 'x-forwarded-for': '198.51.100.20' })
    expect(resolveClientIp(h, { nets: [], peerHeaderTrusted: true })).toBe('203.0.113.7')
  })
  it('private peer with no XFF → the peer itself; implicit trust can be turned off', () => {
    expect(resolveClientIp(H({ 'x-codespectra-peer': '127.0.0.1' }), { nets: [], peerHeaderTrusted: true })).toBe('127.0.0.1')
    const h = H({ 'x-codespectra-peer': '10.0.0.2', 'x-forwarded-for': '198.51.100.20' })
    expect(resolveClientIp(h, { nets: [], peerHeaderTrusted: true, implicitLocalProxy: false })).toBe('10.0.0.2')
  })
  it('isPrivateIp covers loopback, RFC1918, link-local, v6 ULA', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.1.1', '::1', 'fd00::1']) expect(isPrivateIp(ip)).toBe(true)
    expect(isPrivateIp('8.8.8.8')).toBe(false)
  })
})

describe('W4-15 analytics hash uses the trusted-proxy resolution', () => {
  it('ignores spoofed cf-connecting-ip / x-real-ip from an untrusted public peer', () => {
    const prev = process.env.CODESPECTRA_SOCKET_PEER
    process.env.CODESPECTRA_SOCKET_PEER = '1'
    try {
      const a = clientIp(H({ 'x-codespectra-peer': '203.0.113.7', 'cf-connecting-ip': '1.1.1.1', 'x-forwarded-for': '2.2.2.2' }))
      expect(a).toBe('203.0.113.7')
    } finally {
      if (prev === undefined) delete process.env.CODESPECTRA_SOCKET_PEER
      else process.env.CODESPECTRA_SOCKET_PEER = prev
    }
  })
})

describe('W4-02 third-party tags on private pages', () => {
  it('plans', () => {
    expect(tagPlanForPath(false, new Set(['ga4', 'linkedin']))).toBe('none')
    expect(tagPlanForPath(true, new Set())).toBe('none')
    expect(tagPlanForPath(true, new Set(['consent-default']))).toBe('none')
    expect(tagPlanForPath(true, new Set(['clarity', 'meta', 'posthog']))).toBe('pause')
    expect(tagPlanForPath(true, new Set(['clarity', 'linkedin']))).toBe('reload')
    expect(tagPlanForPath(true, new Set(['ga4']))).toBe('reload')
  })
})

describe('W4-18 conversions need server-side consent', () => {
  const now = new Date('2026-10-20T00:00:00Z')
  const cookie = (a: boolean, m: boolean) => serializeConsent({ analytics: a, marketing: m, ts: now.toISOString() })
  it('requires a valid consent cookie', () => {
    expect(conversionsAllowed(undefined, null, now)).toBe(false)
    expect(conversionsAllowed('garbage', null, now)).toBe(false)
    expect(conversionsAllowed(cookie(false, false), null, now)).toBe(false)
    expect(conversionsAllowed(cookie(true, false), null, now)).toBe(true)
    expect(conversionsAllowed(cookie(false, true), null, now)).toBe(true)
    expect(conversionsAllowed(cookie(false, true), '1', now)).toBe(false)
  })
})

describe('W4-03 recordings candidate lookup', () => {
  it('matches id, _id, firebase_uid and ObjectId', () => {
    const f = candidateLookupFilter(['u1', '64b7f0c2a1b2c3d4e5f60718']) as { $or: Record<string, unknown>[] }
    expect(f.$or).toHaveLength(4)
    const m = candidateMap([{ _id: 'x', id: 'u1', firebase_uid: 'fb1', full_name: 'Ada', email: 'a@x.io' }])
    expect(m.get('u1')).toEqual({ name: 'Ada', email: 'a@x.io' })
    expect(m.get('fb1')?.name).toBe('Ada')
  })
})

describe('W4-04 recording key ring', () => {
  const OLD = 'o'.repeat(40)
  const NEW = 'n'.repeat(40)
  const derived = new Uint8Array(32).fill(7)
  it('new key first; previous + derived keys still decrypt', () => {
    const before = recordingKeyRing({ SECRETS_ENCRYPTION_KEY: OLD }, derived)
    const box = encryptBytesWithKey(before[0].key, Buffer.from('chunk'))
    const kid = before[0].kid
    const after = recordingKeyRing({ IDENTITY_MEDIA_KEY: NEW, SECRETS_ENCRYPTION_KEY_PREVIOUS: OLD }, derived)
    expect(after[0].kid).not.toBe(kid)
    expect(decryptOrder(after, kid)[0].kid).toBe(kid)
    expect(decryptWithRing(after, kid, box)?.toString()).toBe('chunk')
    // Legacy chunk without key_id, sealed with the derived key.
    const legacy = encryptBytesWithKey(derived, Buffer.from('old'))
    expect(decryptWithRing(after, undefined, legacy)?.toString()).toBe('old')
    // Key gone entirely → null, not a throw.
    expect(decryptWithRing(recordingKeyRing({ IDENTITY_MEDIA_KEY: NEW }, null), kid, box)).toBeNull()
  })
})

describe('W4-14 retention purge skips open exams without using the budget', () => {
  it('finds closed exams past many open ones', async () => {
    const db = new FakeDb()
    const ids: string[] = []
    for (let i = 0; i < 30; i++) { ids.push(`open${i}`); await db.collection('exams').insertOne({ id: `open${i}`, ends_at: '2099-01-01T00:00:00Z' }) }
    ids.push('closed1'); await db.collection('exams').insertOne({ id: 'closed1', ends_at: '2020-01-01T00:00:00Z' })
    const closeAt = (e: Record<string, unknown> | null) => (e?.ends_at ? Date.parse(String(e.ends_at)) : null)
    const due = await examsDueForPurge(db as never, ids, Date.parse('2026-01-01'), closeAt, 5, 7)
    expect(due).toEqual([{ examId: 'closed1', closeAt: Date.parse('2020-01-01T00:00:00Z') }])
  })
})

describe('W4-05 / W4-17 invite quota is atomic', () => {
  it('parallel reservations never exceed the limit', async () => {
    const db = new FakeDb()
    const ws = '2026-10-01T00:00:00.000Z'
    await db.collection('candidate_invites').insertOne({ id: 'a', tenant_id: 't1', created_at: '2026-10-05T00:00:00Z' })
    const results = await Promise.all(Array.from({ length: 6 }, () => reserveInviteQuotaWithLimit(db as never, 't1', 2, 5, ws)))
    const ok = results.filter((r) => r.ok)
    expect(ok).toHaveLength(2) // 1 existing + 2 + 2 = 5
    const denied = results.find((r) => !r.ok)
    expect(denied && !denied.ok && denied.remaining).toBe(0)
    const doc = await db.collection('candidate_invite_quota').findOne({ _id: quotaKey('t1', ws) })
    expect(doc?.used).toBe(5)
    await releaseInviteQuota(db as never, ok[0], 2)
    expect((await db.collection('candidate_invite_quota').findOne({ _id: quotaKey('t1', ws) }))?.used).toBe(3)
  })
  it('unlimited plans store nothing', async () => {
    const db = new FakeDb()
    const r = await reserveInviteQuotaWithLimit(db as never, 't1', 100, Infinity, '2026-10-01T00:00:00.000Z')
    expect(r.ok).toBe(true)
    expect(await db.collection('candidate_invite_quota').countDocuments()).toBe(0)
  })
})

describe('W4-06 analytics ingest limits', () => {
  it('path rules', () => {
    expect(validPath('/jobs/abc-123')).toBe(true)
    expect(validPath('/' + 'a'.repeat(250))).toBe(false)
    expect(validPath('/x<script>')).toBe(false)
    expect(validPath('/naïve')).toBe(false)
  })
  it('custom event allowlist is admin-extendable but never reserved names', () => {
    expect(parseCustomEventList('quiz_started, demo_booked purchase BAD NAME')).toEqual(['quiz_started', 'demo_booked', 'bad', 'name'])
    const allow = eventAllowlist('quiz_started')
    expect(allow.has('quiz_started')).toBe(true)
    expect(allow.has('practice_run')).toBe(true)
    expect(allow.has('purchase')).toBe(false)
    expect(validateCustomEventList('ok_event, signup')).toMatch(/signup/)
    expect(validateCustomEventList('ok_event')).toBeNull()
  })
  it('origin check', () => {
    expect(sameSiteOrigin(H({ origin: 'https://codespectra.ai' }), ['codespectra.ai'])).toBe(true)
    expect(sameSiteOrigin(H({ referer: 'https://codespectra.ai/jobs' }), ['codespectra.ai'])).toBe(true)
    expect(sameSiteOrigin(H({ origin: 'https://evil.example' }), ['codespectra.ai'])).toBe(false)
    expect(sameSiteOrigin(H({}), ['codespectra.ai'])).toBe(false)
  })
  it('daily caps count atomically and refuse once over', async () => {
    const store = new Map<string, number>()
    const col = {
      async findOneAndUpdate(f: Record<string, unknown>, u: { $inc: { n: number } }) {
        const k = String(f._id)
        store.set(k, (store.get(k) || 0) + u.$inc.n)
        return { n: store.get(k) }
      },
    }
    expect(await capsAllow(col, '2026-10-20', [{ key: 'h:v', cap: 50 }, { key: 'ip:x', cap: 1000 }], 30)).toBe(true)
    expect(await capsAllow(col, '2026-10-20', [{ key: 'h:v', cap: 50 }, { key: 'ip:x', cap: 1000 }], 30)).toBe(false)
    expect(dailyCaps({ ANALYTICS_MAX_EVENTS_PER_VISITOR_DAY: '7' }).visitor).toBe(7)
  })
  it('buildDocs drops non-allowlisted custom events and bad paths', () => {
    const out = buildDocs({ v: 1, mode: 'anon', events: [
      { t: 'ev', name: 'fake_funnel', path: '/jobs/1' },
      { t: 'ev', name: 'practice_run', path: '/practice' },
      { t: 'pv', path: '/<bad>' },
    ] } as never, { now: new Date('2026-10-20T10:00:00Z'), userId: null, tenantId: null, visitorHash: 'vh', country: null, ua: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120', ownHost: 'codespectra.ai', sessionId: null })
    expect(out.events.map((e) => e.event)).toEqual(['practice_run'])
    expect(out.dropped).toBe(2)
  })
  it('rollups come from $group pipelines with no row limit', () => {
    const p1 = JSON.stringify(dayEventsPipeline('2026-10-20'))
    const p2 = JSON.stringify(daySessionsPipeline('2026-10-20'))
    expect(p1).toContain('$facet')
    expect(p1 + p2).not.toContain('300000')
    const r = rollupFromFacets('2026-10-20', {
      pageviews: [{ n: 10 }], private_pageviews: [{ n: 2 }], visitors: [{ n: 4 }], users: [{ n: 1 }],
      paths: [{ _id: '/a.b', n: 7 }, { _id: '/c', n: 3 }], private_paths: [{ _id: '/bgv/[token]', n: 2 }], events: [{ _id: 'practice_run', n: 1 }],
    }, {
      sessions: [{ n: 5 }], bounces: [{ n: 2 }], landings: [{ _id: '/a.b', n: 5 }], sources: [{ _id: '', n: 3 }, { _id: 'google.com', n: 2 }],
      countries: [{ _id: null, n: 5 }], devices: [{ _id: 'mobile', n: 5 }], browsers: [{ _id: 'Chrome', n: 5 }], mediums: [], campaigns: [],
    })
    expect(r.pageviews).toBe(10)
    expect(r.sessions).toBe(5)
    expect(r.paths['/a．b']).toBe(7)
    expect(r.sources.direct).toBe(3)
    expect(r.countries.Unknown).toBe(5)
  })
})

describe('W4-07 RAG in-process scan cap', () => {
  it('defaults to 5,000 and stays configurable', () => {
    expect(DEFAULT_INPROC_MAX_SCAN).toBe(5000)
    expect(inprocMaxScan(undefined)).toBe(5000)
    expect(inprocMaxScan('20000')).toBe(20000)
    expect(inprocMaxScan('10')).toBe(500)
    expect(inprocMaxScan('junk')).toBe(5000)
  })
})

describe('W4-08 scheduled copilot reports re-authorise the creator', () => {
  it('rules', () => {
    expect(creatorStillAuthorised({ ok: true, role: 'tenant_admin', tenantId: 't1' }, 't1', 'a@x.io')).toEqual({ ok: true, email: 'a@x.io' })
    expect(creatorStillAuthorised({ ok: true, role: 'tenant_admin', tenantId: 't2' }, 't1', 'a@x.io')).toEqual({ ok: false, reason: 'creator_not_admin' })
    expect(creatorStillAuthorised({ ok: true, role: 'user', tenantId: 't1' }, 't1', 'a@x.io').ok).toBe(false)
    expect(creatorStillAuthorised({ ok: false, reason: 'inactive' }, 't1', 'a@x.io')).toEqual({ ok: false, reason: 'creator_inactive' })
    expect(creatorStillAuthorised({ ok: false, reason: 'missing' }, null, null)).toEqual({ ok: false, reason: 'creator_missing' })
    expect(creatorStillAuthorised({ ok: true, role: 'tenant_admin', tenantId: 't1' }, null, 'a@x.io').ok).toBe(false)
    expect(creatorStillAuthorised({ ok: true, role: 'superadmin', tenantId: null }, null, 's@x.io').ok).toBe(true)
  })
  it('delivery is re-pointed at the current address', () => {
    const steps = retargetDelivery([{ id: 'summary', type: 'ai.complete', config: {} }, { id: 'deliver', type: 'email.send', config: { to: 'old@x.io' } }], { userId: 'u', email: 'new@x.io' })
    expect(steps[1].config?.to).toBe('new@x.io')
  })
})

describe('W4-11 settings cache never blocks on a DB outage', () => {
  it('timeout → fallback, cached negatively; stale served while refreshing', async () => {
    let t = 0
    let calls = 0
    let mode: 'hang' | 'ok' = 'hang'
    const cache = createTtlCache(async () => {
      calls++
      if (mode === 'hang') return new Promise<string>(() => {})
      return 'fresh'
    }, { ttlMs: 100, negativeTtlMs: 50, timeoutMs: 20, fallback: 'default', now: () => t })
    expect(await cache.get()).toBe('default')
    expect(await cache.get()).toBe('default') // negative-cached
    expect(calls).toBe(1)
    t = 60
    mode = 'ok'
    expect(await cache.get()).toBe('default') // stale while revalidating
    await new Promise((r) => setTimeout(r, 0))
    expect(await cache.get()).toBe('fresh')
    expect(calls).toBe(2)
  })
})

describe('W4-12 /og parameters are signed', () => {
  it('sign / verify, tamper detection', () => {
    const p = { title: 'Senior Engineer', kind: 'job', sub: '' }
    const sig = signOg(p, 'k'.repeat(32))
    expect(verifyOg(p, sig, 'k'.repeat(32))).toBe(true)
    expect(verifyOg({ ...p, kind: 'certificate' }, sig, 'k'.repeat(32))).toBe(false)
    expect(verifyOg(p, null, 'k'.repeat(32))).toBe(false)
  })
  it('ogImagePath carries a valid signature', () => {
    const url = new URL(ogImagePath({ title: 'Hello', kind: 'event' }), 'https://x.test')
    const q = url.searchParams
    expect(verifyOg({ title: q.get('title'), kind: q.get('kind'), sub: q.get('sub') || '' }, q.get('s'))).toBe(true)
  })
})

describe('W4-13 hiring funnel job paths', () => {
  it('uses job_postings ids (legacy_job_id)', () => {
    expect(jobPagePaths([{ legacy_job_id: 'jp1' }, { legacy_job_id: null }, { legacy_job_id: 'jp1' }, {}])).toEqual(['/jobs/jp1'])
  })
})

describe('W4-16 interview candidate errors are generic', () => {
  it('never contains an email', () => {
    expect(CANDIDATE_UNAVAILABLE).not.toMatch(/@/)
  })
})

describe('W4-19 PostHog host must be allowed by the CSP', () => {
  it('only *.posthog.com', () => {
    const def = INTEGRATION_FIELDS.find((f) => f.key === 'posthog_host')!
    expect(def.pattern.test('https://us.i.posthog.com')).toBe(true)
    expect(def.pattern.test('https://eu.i.posthog.com')).toBe(true)
    expect(def.pattern.test('https://ph.example.com')).toBe(false)
    expect(def.pattern.test('https://evilposthog.com')).toBe(false)
    expect(publicConfigFrom({ posthog_project_key: 'phc_' + 'a'.repeat(30), posthog_host: 'https://proxy.example.com' }).posthog?.host).toBe('https://us.i.posthog.com')
  })
})

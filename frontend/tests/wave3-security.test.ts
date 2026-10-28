/**
 * Wave 3 review fixes (security side): SSRF guard (IPv6 forms that embed IPv4, DNS answers, every
 * redirect hop, guarded connect lookup, capped streaming reads), inbound workflow webhook (HMAC
 * before timestamp, replay store, uniform 401), workflow read allow-list on filters, learn
 * auto-publish gates + prose link vetting, WhatsApp STOP keywords.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeDb } from './helpers/fake-mongo'

const db = vi.hoisted(() => ({ current: null as unknown as import('./helpers/fake-mongo').FakeDb }))
vi.mock('@/lib/mongodb', () => ({ getMongoDb: async () => db.current }))

import {
  __setLookupForTests, __setTransportForTests, guardedLookup, isBlockedAddress, isSafeUrl, readBodyCapped, readTextCapped,
  ResponseTooLarge, safeFetch, safePreview,
} from '@/lib/url-safety'
import { computeSignature, verifySignature } from '@/lib/automation/hmac'
import { assertReadableFilter, READ_RULES, readableField } from '@/lib/automation/actions'
import { __resetAutomationIndexes, claimWebhookDelivery } from '@/lib/automation/store'
import { proseLinkAllowed, vetProseLinks } from '@/lib/learn/quality'
import { autoPublishAllowed, vetPostProseLinks } from '@/lib/learn/generate'
import { isStopMessage } from '@/lib/subscriptions/filters'

beforeEach(() => {
  db.current = new FakeDb()
  __resetAutomationIndexes()
})
afterEach(() => {
  __setLookupForTests(null)
  __setTransportForTests(null)
})

describe('W3-01 SSRF: address classification', () => {
  it.each([
    // IPv4-mapped in every spelling (WHATWG URL turns [::ffff:127.0.0.1] into [::ffff:7f00:1])
    '::ffff:7f00:1', '::ffff:a9fe:a9fe', '::FFFF:A00:1', '0:0:0:0:0:ffff:7f00:1', '[::ffff:7f00:1]', '::ffff:127.0.0.1',
    // IPv4-compatible, SIIT-translated, NAT64 (well-known + local-use), 6to4
    '::7f00:1', '::ffff:0:7f00:1', '64:ff9b::7f00:1', '64:ff9b::169.254.169.254', '64:ff9b:1::808:808', '2002:a9fe:a9fe::1',
    // IPv4 ranges
    '0.1.2.3', '10.1.1.1', '100.64.0.1', '127.0.0.1', '169.254.169.254', '172.31.255.255', '192.0.0.8', '192.168.0.1',
    '198.18.0.1', '198.19.255.255', '224.0.0.1', '239.255.255.250', '240.0.0.1', '255.255.255.255',
    // IPv6 ranges
    '::1', '::', 'fc00::1', 'fdff::1', 'fe80::1', 'fe80::1%eth0', 'febf::1', 'ff02::1', '2001::1',
  ])('blocks %s', (a) => expect(isBlockedAddress(a)).toBe(true))

  it.each(['8.8.8.8', '1.1.1.1', '172.32.0.1', '100.128.0.1', '198.20.0.1', '2606:4700::1111', '::ffff:808:808', '64:ff9b::808:808', '2002:808:808::1'])(
    'allows %s', (a) => expect(isBlockedAddress(a)).toBe(false),
  )

  it('blocks the URL-normalised literal and every resolved address', async () => {
    expect(new URL('http://[::ffff:127.0.0.1]/').hostname).toBe('[::ffff:7f00:1]')
    expect((await isSafeUrl('http://[::ffff:127.0.0.1]:8080/x')).safe).toBe(false)
    expect((await isSafeUrl('https://[64:ff9b::a9fe:a9fe]/latest/meta-data')).safe).toBe(false)
    expect((await isSafeUrl('http://user:pw@example.com/')).safe).toBe(false)
    expect((await isSafeUrl('file:///etc/passwd')).safe).toBe(false)
    __setLookupForTests(async () => [{ address: '93.184.216.34', family: 4 }, { address: '::ffff:a00:1', family: 6 }])
    expect(await isSafeUrl('https://mixed.example/')).toMatchObject({ safe: false })
    __setLookupForTests(async () => [{ address: '93.184.216.34', family: 4 }])
    expect(await isSafeUrl('https://ok.example/')).toMatchObject({ safe: true })
  })

  it('the connect-time lookup refuses blocked answers (DNS rebinding)', async () => {
    __setLookupForTests(async () => [{ address: '127.0.0.1', family: 4 }])
    const err = await new Promise<NodeJS.ErrnoException | null>((r) => guardedLookup('rebind.example', { all: true }, (e) => r(e)))
    expect(err?.message).toMatch(/blocked/)
    __setLookupForTests(async () => [{ address: '93.184.216.34', family: 4 }])
    const ok = await new Promise<unknown>((r) => guardedLookup('ok.example', { all: true }, (_e, a) => r(a)))
    expect(ok).toEqual([{ address: '93.184.216.34', family: 4 }])
  })

  it('re-checks every redirect hop and drops credentials across origins', async () => {
    __setLookupForTests(async () => [{ address: '93.184.216.34', family: 4 }])
    const seen: { url: string; auth?: string }[] = []
    __setTransportForTests(async (url, init) => {
      seen.push({ url: url.toString(), auth: new Headers(init.headers).get('authorization') ?? undefined })
      if (url.hostname === 'start.example') return new Response(null, { status: 302, headers: { location: 'https://next.example/b' } })
      if (url.hostname === 'next.example') return new Response(null, { status: 302, headers: { location: 'http://[::ffff:a9fe:a9fe]/latest' } })
      return new Response('secret')
    })
    await expect(safeFetch('https://start.example/a', { headers: { Authorization: 'Bearer t' } })).rejects.toThrow(/Blocked URL/)
    expect(seen.map((s) => s.url)).toEqual(['https://start.example/a', 'https://next.example/b']) // never reached the metadata IP
    expect(seen[1].auth).toBeUndefined()
  })
})

describe('W3-19 capped streaming reads + safe previews', () => {
  const endless = () => new Response(new ReadableStream<Uint8Array>({ pull(c) { c.enqueue(new Uint8Array(64 * 1024).fill(97)) } }))
  it('stops an endless chunked body at the cap (no full buffering)', async () => {
    await expect(readBodyCapped(endless(), 256 * 1024)).rejects.toBeInstanceOf(ResponseTooLarge)
    expect((await readBodyCapped(endless(), 1000, { truncate: true })).byteLength).toBe(1000)
    expect(await readTextCapped(new Response('hello'), 10)).toBe('hello')
    await expect(readBodyCapped(new Response('x', { headers: { 'content-length': '999999' } }), 10)).rejects.toBeInstanceOf(ResponseTooLarge)
  })
  it('previews are short, single-line and markup-free', () => {
    const p = safePreview(`<html><body>Error\n\u0000 token=abc ${'x'.repeat(500)}</body></html>`, 40)
    expect(p.length).toBeLessThanOrEqual(41)
    expect(p).not.toMatch(/[<>\n\u0000]/)
  })
})

describe('W3-11/12 inbound workflow webhooks', () => {
  const secret = 'whsec_x'
  const body = '{"a":1}'
  const now = new Date('2026-10-19T00:00:00Z')
  const t = Math.floor(now.getTime() / 1000)

  it('checks the HMAC before the timestamp (no "expired" oracle for unsigned probes)', () => {
    expect(verifySignature(secret, body, `t=0,v1=${'a'.repeat(64)}`, now)).toEqual({ ok: false, reason: 'mismatch' })
    const old = t - 3600
    expect(verifySignature(secret, body, `t=${old},v1=${computeSignature(secret, old, body)}`, now)).toEqual({ ok: false, reason: 'expired' })
    expect(verifySignature(secret, body, `t=${t},v1=${computeSignature(secret, t, body)}`, now)).toMatchObject({ ok: true, t })
  })

  it('replay store accepts each signed request once', async () => {
    const sig = computeSignature(secret, t, body)
    const [a, b] = await Promise.all([claimWebhookDelivery('wf1', t, sig, 300), claimWebhookDelivery('wf1', t, sig, 300)])
    expect([a, b].sort()).toEqual([false, true])
    expect(await claimWebhookDelivery('wf2', t, sig, 300)).toBe(true)
    const row = db.current.collection('workflow_hook_replays').docs[0]
    expect(new Date(row.expires_at).getTime()).toBeGreaterThan(now.getTime())
  })
})

describe('W3-11/12 hook route: replay + uniform 401', () => {
  it('runs once per signed request; unknown ids, stale and replayed requests all get the same 401', async () => {
    vi.resetModules()
    vi.doMock('@/lib/upstash-rate-limit', () => ({ rateLimitRedis: async () => ({ ok: true }) }))
    vi.doMock('@/lib/automation/settings', () => ({ decryptValue: async (v: string) => v }))
    const start = vi.fn(async () => ({ run: { id: 'run1', status: 'done' }, duplicate: false }))
    vi.doMock('@/lib/automation/runs', () => ({ startWorkflowRun: start, processRun: vi.fn() }))
    const { POST } = await import('@/app/api/workflows/hooks/[id]/route')
    await db.current.collection('workflows').insertOne({ id: 'wf-12345678', trigger: 'webhook', is_active: true, webhook_secret_enc: 'whsec_route' })
    const call = async (id: string, sigHeader: string, raw = '{"x":1}') => {
      const req = new Request(`https://app.test/api/workflows/hooks/${id}`, { method: 'POST', body: raw, headers: { 'content-type': 'application/json', 'x-codespectra-signature': sigHeader } })
      const res = await POST(req as never, { params: Promise.resolve({ id }) })
      return { status: res.status, body: await res.json() }
    }
    const t = Math.floor(Date.now() / 1000)
    const good = `t=${t},v1=${computeSignature('whsec_route', t, '{"x":1}')}`
    expect((await call('wf-12345678', good)).status).toBe(202)
    const replay = await call('wf-12345678', good)
    const unknown = await call('wf-unknown1', good)
    const stale = await call('wf-12345678', `t=0,v1=${'b'.repeat(64)}`)
    expect(replay).toEqual(unknown)
    expect(stale).toEqual(unknown)
    expect(unknown.status).toBe(401)
    expect(start).toHaveBeenCalledTimes(1)
    vi.doUnmock('@/lib/upstash-rate-limit'); vi.doUnmock('@/lib/automation/settings'); vi.doUnmock('@/lib/automation/runs')
  })
})

describe('W3-17 workflow reads: filters use the projection allow-list', () => {
  it('rejects hidden fields anywhere in the filter', () => {
    const apps = READ_RULES.ats_applications
    expect(() => assertReadableFilter({ compensation: { $gt: 100 } }, apps)).toThrow(/compensation/)
    expect(() => assertReadableFilter({ $or: [{ stage_id: 'x' }, { 'compensation_history.0.amount': 5 }] }, apps)).toThrow()
    expect(() => assertReadableFilter({ stage_id: 'x', status: { $in: ['active'] } }, apps)).not.toThrow()
    expect(() => assertReadableFilter({ 'answers.q1': 'x' }, READ_RULES.exam_submissions)).toThrow()
    expect(() => assertReadableFilter({ resume_text: { $exists: true } }, READ_RULES.ats_candidates)).toThrow()
    // `only` rules: anything outside the list is out
    expect(readableField('email', READ_RULES.user)).toBe(true)
    expect(readableField('password', READ_RULES.user)).toBe(false)
    expect(() => assertReadableFilter({ $and: [{ passwordHash: { $exists: true } }] }, READ_RULES.user)).toThrow()
  })
})

describe('W3-18 learn auto-publish + prose links', () => {
  const s = { auto_approve: true, auto_approve_min_score: 70 }
  it('never auto-publishes with research, copy or link flags', () => {
    expect(autoPublishAllowed(s, 95, [])).toBe(true)
    expect(autoPublishAllowed(s, 95, ['research:injection(evil.example)'])).toBe(false)
    expect(autoPublishAllowed(s, 95, ['links:unvetted(1)'])).toBe(false)
    expect(autoPublishAllowed(s, 95, ['copy:verbatim-runs(2)'])).toBe(false)
    expect(autoPublishAllowed({ ...s, auto_approve: false }, 100, [])).toBe(false)
  })
  it('unlinks off-allowlist links in prose, keeps allowed ones and code', () => {
    const domains = ['developer.mozilla.org', 'wikipedia.org']
    expect(proseLinkAllowed('/learn/arrays', domains)).toBe(true)
    expect(proseLinkAllowed('//evil.example/x', domains)).toBe(false)
    expect(proseLinkAllowed('http://en.wikipedia.org/wiki/A', domains)).toBe(false) // https only
    const md = 'See [MDN](https://developer.mozilla.org/x) and [free money](https://evil.example/p), <https://evil.example/a>, www.evil.example/b and `curl https://evil.example/c`. Also ![img](javascript:alert(1)).'
    const r = vetProseLinks(md, domains)
    expect(r.dropped).toBe(4)
    expect(r.text).toContain('[MDN](https://developer.mozilla.org/x)')
    expect(r.text).toContain('free money')
    expect(r.text).not.toMatch(/https:\/\/evil\.example\/(p|a)|www\.evil/)
    expect(r.text).toContain('`curl https://evil.example/c`')
    expect(r.text).not.toContain('javascript:')
  })
  it('vets every prose field of a generated post', () => {
    const post = {
      title: 't', summary: 'Go to https://evil.example now', level: 'beginner', tags: [],
      sections: {
        concept: 'c [x](https://evil.example)', intuition: 'i', steps: 's', complexity: { rows: [], notes: 'n https://evil.example' },
        code_examples: [{ language: 'python', code: 'print("https://evil.example")', explanation: 'see https://evil.example' }],
        use_cases: ['u https://evil.example'], common_mistakes: ['m'], interview_questions: [{ question: 'q', answer: 'a [y](https://evil.example)' }], further_reading: [],
      },
    }
    expect(vetPostProseLinks(post as never, ['wikipedia.org'])).toBe(6)
    expect(post.sections.code_examples[0].code).toContain('https://evil.example') // code untouched
    expect(JSON.stringify({ ...post.sections, code_examples: [] })).not.toContain('https://evil')
  })
})

describe('W3-16 WhatsApp opt-out keywords', () => {
  it.each(['STOP', 'stop', 'Stop!', 'STOP ALL', 'stop all.', 'UNSUBSCRIBE', 'Cancel', 'END', 'quit', 'OPT OUT', 'opt-out', 'OptOut', 'STOP please', '  stop sending these  ', 'ＳＴＯＰ'])(
    'treats %j as opt-out', (t) => expect(isStopMessage(t)).toBe(true),
  )
  it.each(['', 'yes', 'start', 'please stop', 'I will end the call when the interview is over, thanks', 'non-stop', 'stopwatch'])(
    'does not treat %j as opt-out', (t) => expect(isStopMessage(t)).toBe(false),
  )
})

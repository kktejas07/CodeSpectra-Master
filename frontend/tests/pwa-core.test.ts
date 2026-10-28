/**
 * PWA service-worker core (public/pwa-core.js): cache routing, cacheability,
 * push parsing and the offline submission queue.
 * Run: npx vitest run tests/pwa-core.test.ts
 */
import { createRequire } from 'node:module'
import { describe, it, expect } from 'vitest'
import { isPublicMarketingPath } from '@/lib/seo/public-routes'

const require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const core = require('../public/pwa-core.js') as any

const O = 'https://codespectra.ai'
const nav = (path: string, extra: Record<string, unknown> = {}) => core.chooseStrategy({ method: 'GET', url: O + path, origin: O, mode: 'navigate', accept: 'text/html', ...extra })
const asset = (path: string, extra: Record<string, unknown> = {}) => core.chooseStrategy({ method: 'GET', url: O + path, origin: O, mode: 'no-cors', accept: '*/*', ...extra })

describe('chooseStrategy', () => {
  it('never caches API calls, whatever the method', () => {
    expect(asset('/api/daily-challenge')).toBe('network-only')
    expect(nav('/api/auth/session')).toBe('network-only')
    expect(core.chooseStrategy({ method: 'POST', url: O + '/api/submissions', origin: O })).toBe('network-only')
  })

  it('leaves non-GET and cross-origin requests alone', () => {
    expect(core.chooseStrategy({ method: 'POST', url: O + '/learn', origin: O, mode: 'navigate' })).toBe('network-only')
    expect(asset('/x.js', { url: 'https://cdn.jsdelivr.net/npm/x.js' })).toBe('network-only')
  })

  it('serves hashed static assets and icons cache-first', () => {
    expect(asset('/_next/static/chunks/app-abc123.js')).toBe('cache-first')
    expect(asset('/_next/static/media/font.woff2')).toBe('cache-first')
    expect(asset('/icons/icon-192.png')).toBe('cache-first')
    expect(asset('/icon.svg')).toBe('cache-first')
  })

  it('does not cache the worker scripts, image optimiser or RSC payloads', () => {
    expect(asset('/sw.js')).toBe('network-only')
    expect(asset('/pwa-core.js')).toBe('network-only')
    expect(asset('/_next/image?url=%2Fx.png&w=64&q=75')).toBe('network-only')
    expect(nav('/learn', { rsc: true })).toBe('network-only')
    expect(asset('/learn?_rsc=abc')).toBe('network-only')
  })

  it('public pages are stale-while-revalidate', () => {
    for (const p of ['/', '/learn', '/learn/binary-search', '/events/x-hack', '/companies/google', '/pricing', '/faq/']) {
      expect(nav(p), p).toBe('stale-while-revalidate')
    }
  })

  it('signed-in and private HTML is network-only with the offline fallback', () => {
    for (const p of ['/dashboard', '/dashboard/problems/two-sum', '/auth/login', '/assessment/abc', '/interview/1', '/marketplace/cart', '/hackathons/x/join/abc', '/users/someone']) {
      expect(nav(p), p).toBe('network-only-offline-fallback')
    }
  })

  it('token links are never cached even on public paths', () => {
    expect(nav('/events?token=abc')).toBe('network-only')
    expect(nav('/learn?invite_token=abc')).toBe('network-only')
  })

  it('the offline page is network-first', () => {
    expect(nav('/offline')).toBe('network-first')
  })

  it('every SWR page is a public marketing page (no user data)', () => {
    for (const p of core.PUBLIC_PAGES) expect(isPublicMarketingPath(p), p).toBe(true)
    for (const pre of core.PUBLIC_PAGE_PREFIXES) expect(isPublicMarketingPath(pre + 'sample'), pre).toBe(true)
  })
})

describe('isCacheableResponse', () => {
  it('stores only plain 200 same-origin responses', () => {
    expect(core.isCacheableResponse({ status: 200, type: 'basic', cacheControl: 'public, max-age=0' })).toBe(true)
    expect(core.isCacheableResponse({ status: 200, type: 'basic', cacheControl: null })).toBe(true)
    expect(core.isCacheableResponse({ status: 404, type: 'basic' })).toBe(false)
    expect(core.isCacheableResponse({ status: 200, type: 'opaque' })).toBe(false)
    expect(core.isCacheableResponse({ status: 200, type: 'basic', cacheControl: 'private, no-cache, no-store' })).toBe(false)
    expect(core.isCacheableResponse({ status: 200, type: 'basic', cacheControl: 'private, max-age=60' })).toBe(false)
  })
})

describe('notificationFromPush', () => {
  it('reads our VAPID payload', () => {
    const n = core.notificationFromPush({ v: 1, title: 'Results out', body: 'See your rank', url: '/dashboard/events', tag: 'n1', data: { type: 'hackathon.results' } })
    expect(n.title).toBe('Results out')
    expect(n.options.body).toBe('See your rank')
    expect(n.options.tag).toBe('n1')
    expect(n.options.data.url).toBe('/dashboard/events')
  })

  it('reads the FCM web shape', () => {
    const n = core.notificationFromPush({ notification: { title: 'Hi', body: 'There' }, data: { link: '/dashboard/x' } })
    expect(n.title).toBe('Hi')
    expect(n.options.data.url).toBe('/dashboard/x')
  })

  it('never opens another origin', () => {
    for (const bad of ['https://evil.example/x', '//evil.example', '/\\evil.example', 'javascript:alert(1)']) {
      expect(core.notificationFromPush({ title: 't', url: bad }).options.data.url).toBe('/dashboard')
    }
  })

  it('has a default title', () => {
    expect(core.notificationFromPush(null).title).toBe('CodeSpectra')
  })
})

describe('offline queue', () => {
  type Item = Record<string, unknown> & { id: string; state: string; created_at: number }
  function fakeAdapter(items: Item[], responses: Array<number | Error>, body: unknown = { status: 'accepted', passed_tests: 3, total_tests: 3, score: 100 }) {
    const sent: string[] = []
    const store = new Map(items.map((i) => [i.id, { ...i }]))
    return {
      store,
      sent,
      adapter: {
        list: async () => [...store.values()].map((i) => ({ ...i })),
        put: async (i: Item) => { store.set(i.id, { ...i }) },
        send: async (i: Item) => {
          sent.push(i.id)
          const r = responses.shift()
          if (r instanceof Error) throw r
          return { status: r ?? 200, body: r && r >= 400 ? { error: 'Problem not found' } : body }
        },
      },
    }
  }

  it('classifies responses', () => {
    expect(core.classifySyncResponse(200)).toBe('done')
    expect(core.classifySyncResponse(0)).toBe('retry')
    expect(core.classifySyncResponse(429)).toBe('retry')
    expect(core.classifySyncResponse(503)).toBe('retry')
    expect(core.classifySyncResponse(401)).toBe('auth')
    expect(core.classifySyncResponse(403)).toBe('auth')
    expect(core.classifySyncResponse(400)).toBe('rejected')
    expect(core.classifySyncResponse(402)).toBe('rejected')
    expect(core.classifySyncResponse(404)).toBe('rejected')
  })

  it('backs off exponentially with a cap', () => {
    expect(core.retryDelayMs(1)).toBe(15_000)
    expect(core.retryDelayMs(2)).toBe(30_000)
    expect(core.retryDelayMs(3)).toBe(60_000)
    expect(core.retryDelayMs(50)).toBe(30 * 60 * 1000)
  })

  it('sends oldest first and records the graded result', async () => {
    const { adapter, store, sent } = fakeAdapter([
      { id: 'b', state: 'queued', created_at: 2 },
      { id: 'a', state: 'queued', created_at: 1 },
    ], [200, 200])
    const r = await core.flushQueue(adapter, { now: 1000 })
    expect(sent).toEqual(['a', 'b'])
    expect(r).toEqual({ synced: 2, rejected: 0, pending: 0 })
    expect(store.get('a')).toMatchObject({ state: 'synced', synced_at: 1000, result: { status: 'accepted', passed: 3, total: 3, score: 100 } })
  })

  it('stops at a network error and schedules a retry', async () => {
    const { adapter, store, sent } = fakeAdapter([
      { id: 'a', state: 'queued', created_at: 1 },
      { id: 'b', state: 'queued', created_at: 2 },
    ], [new Error('offline')])
    const r = await core.flushQueue(adapter, { now: 1000 })
    expect(sent).toEqual(['a'])
    expect(r).toEqual({ synced: 0, rejected: 0, pending: 2 })
    expect(store.get('a')).toMatchObject({ state: 'retry', attempts: 1, next_attempt_at: 1000 + 15_000 })
    expect(store.get('b')!.state).toBe('queued')
  })

  it('does not retry before next_attempt_at', async () => {
    const { adapter, sent } = fakeAdapter([{ id: 'a', state: 'retry', created_at: 1, next_attempt_at: 5000 }], [200])
    await core.flushQueue(adapter, { now: 4000 })
    expect(sent).toEqual([])
    await core.flushQueue(adapter, { now: 5000 })
    expect(sent).toEqual(['a'])
  })

  it('marks server-refused answers as rejected and carries on', async () => {
    const { adapter, store } = fakeAdapter([
      { id: 'a', state: 'queued', created_at: 1 },
      { id: 'b', state: 'queued', created_at: 2 },
    ], [404, 200])
    const r = await core.flushQueue(adapter, { now: 1 })
    expect(r).toEqual({ synced: 1, rejected: 1, pending: 0 })
    expect(store.get('a')).toMatchObject({ state: 'rejected', error: 'Problem not found' })
  })

  it('waits for a signed-in tab after 401/403 (the worker cannot sign in)', async () => {
    const { adapter, store, sent } = fakeAdapter([{ id: 'a', state: 'queued', created_at: 1 }], [401])
    await core.flushQueue(adapter, { now: 1, interactive: false })
    expect(store.get('a')!.state).toBe('auth')
    await core.flushQueue(adapter, { now: 2, interactive: false })
    expect(sent).toEqual(['a'])
    await core.flushQueue(adapter, { now: 3, interactive: true })
    expect(sent).toEqual(['a', 'a'])
    expect(store.get('a')!.state).toBe('synced')
  })

  it('recovers items stuck in "sending" (worker killed mid-request)', () => {
    expect(core.isDue({ state: 'sending', sending_at: 1000 }, 1000 + 60_000)).toBe(false)
    expect(core.isDue({ state: 'sending', sending_at: 1000 }, 1000 + 3 * 60_000)).toBe(true)
    expect(core.isDue({ state: 'synced' }, 0)).toBe(false)
  })

  it('gives up after too many attempts', async () => {
    const { adapter, store } = fakeAdapter([{ id: 'a', state: 'queued', created_at: 1, attempts: 11 }], [503])
    await core.flushQueue(adapter, { now: 1 })
    expect(store.get('a')!.state).toBe('rejected')
  })
})

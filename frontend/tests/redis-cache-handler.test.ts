/**
 * lib/cache/redis-cache-handler.mjs with a mocked Redis store: serialization
 * (Buffer / Map), cross-instance tag invalidation, stale-while-revalidate
 * tag rows, request-revalidated tags, fallback when Redis is down, env config.
 */
import { describe, expect, it, vi } from 'vitest'
import {
  createCacheHandler, decodeValue, encodeValue, entryTags, entryTtlSec, isExpiredByTags, redisCacheConfig, tagUpdate,
} from '@/lib/cache/redis-cache-handler.mjs'

function fakeStore() {
  const kv = new Map<string, string>()
  const hashes = new Map<string, Map<string, string>>()
  const ttl = new Map<string, number>()
  return {
    kv, hashes, ttl,
    get: vi.fn(async (k: string) => kv.get(k) ?? null),
    set: vi.fn(async (k: string, v: string, t: number) => { kv.set(k, v); ttl.set(k, t) }),
    hmget: vi.fn(async (h: string, f: string[]) => f.map((x) => hashes.get(h)?.get(x) ?? null)),
    hset: vi.fn(async (h: string, o: Record<string, string>) => {
      const m = hashes.get(h) ?? new Map<string, string>()
      for (const [k, v] of Object.entries(o)) m.set(k, v)
      hashes.set(h, m)
    }),
  }
}

const cfg = { mode: 'redis', url: 'redis://x', token: '', prefix: 'test', timeoutMs: 200, ttlSec: 3600 }
const fetchEntry = (data: unknown) => ({ kind: 'FETCH', data, revalidate: 300 })

function instance(store: ReturnType<typeof fakeStore>, clock: { t: number }) {
  // Each "replica" has its own in-process tag manifest; the store is shared.
  const H = createCacheHandler({ config: cfg, store, manifest: new Map(), now: () => clock.t, buildId: 'b1' })
  return new H({})
}

describe('serialization', () => {
  it('round-trips Buffers, Maps, Sets and nested objects', () => {
    const v = { kind: 'APP_PAGE', html: 'x', rscData: Buffer.from('rsc'), segmentData: new Map([['/a', Buffer.from('seg')]]), headers: { a: '1' }, s: new Set([1]), n: null }
    const back = decodeValue(JSON.parse(JSON.stringify(encodeValue(v))))
    expect(Buffer.isBuffer(back.rscData) && back.rscData.toString()).toBe('rsc')
    expect(back.segmentData.get('/a').toString()).toBe('seg')
    expect(back.s.has(1)).toBe(true)
    expect(back.headers).toEqual({ a: '1' })
  })
})

describe('pure helpers', () => {
  it('tags of an entry', () => {
    expect(entryTags(fetchEntry(1), { tags: ['a'], softTags: ['_N_T_/x'] })).toEqual(['a', '_N_T_/x'])
    expect(entryTags({ kind: 'APP_PAGE', headers: { 'x-next-cache-tags': 'p,q' } }, {})).toEqual(['p', 'q'])
    expect(entryTags(null, {})).toEqual([])
  })
  it('tag rows and expiry like the file-system cache', () => {
    expect(tagUpdate(undefined, 100, undefined)).toEqual({ expired: 100 })
    expect(tagUpdate({ expired: 5 }, 100, { expire: 60 })).toEqual({ expired: 60_100, stale: 100 })
    const m = new Map([['a', { expired: 100 }]])
    expect(isExpiredByTags(m, ['a'], 50, 200)).toBe(true)
    expect(isExpiredByTags(m, ['a'], 150, 200)).toBe(false) // written after the purge
    expect(isExpiredByTags(new Map([['a', { expired: 500 }]]), ['a'], 50, 200)).toBe(false) // future expiry
  })
  it('ttl is bounded', () => {
    expect(entryTtlSec(fetchEntry(1), { revalidate: 300, expire: 900 }, 3600)).toBe(900)
    expect(entryTtlSec(fetchEntry(1), undefined, 3600)).toBe(3000)
    expect(entryTtlSec({ kind: 'APP_PAGE' }, { revalidate: false }, 3600)).toBe(3600)
    expect(entryTtlSec({ kind: 'APP_PAGE' }, { revalidate: 1 }, 3600)).toBe(60)
  })
  it('config from env', () => {
    expect(redisCacheConfig({})).toBeNull()
    expect(redisCacheConfig({ REDIS_URL: 'redis://r:6379' })).toMatchObject({ mode: 'redis', url: 'redis://r:6379' })
    expect(redisCacheConfig({ UPSTASH_REDIS_REST_URL: 'https://u.upstash.io' })).toBeNull() // token required
    expect(redisCacheConfig({ UPSTASH_REDIS_REST_URL: 'https://u.upstash.io', UPSTASH_REDIS_REST_TOKEN: 't' })).toMatchObject({ mode: 'rest', token: 't' })
    expect(redisCacheConfig({ CACHE_REDIS_URL: 'ftp://nope' })).toBeNull()
  })
})

describe('handler across instances', () => {
  it('an entry written on A is served by B; revalidateTag on A invalidates it on B', async () => {
    const store = fakeStore()
    const clock = { t: 1_000 }
    const a = instance(store, clock)
    const b = instance(store, clock)
    await a.set('k1', fetchEntry({ v: 1 }), { tags: ['public:learn'] })
    expect([...store.kv.keys()][0]).toBe('test:b1:e:k1')
    clock.t = 2_000
    const hit = await b.get('k1', { kind: 'FETCH', tags: ['public:learn'], softTags: [] })
    expect(hit?.value.data).toEqual({ v: 1 })
    clock.t = 3_000
    await a.revalidateTag('public:learn')
    clock.t = 3_001
    expect(await b.get('k1', { kind: 'FETCH', tags: ['public:learn'], softTags: [] })).toBeNull()
    // Written again after the purge: a hit again.
    await b.set('k1', fetchEntry({ v: 2 }), { tags: ['public:learn'] })
    clock.t = 4_000
    expect((await a.get('k1', { kind: 'FETCH', tags: ['public:learn'], softTags: [] }))?.value.data).toEqual({ v: 2 })
  })

  it('stale-while-revalidate: profile durations reach the other instance\'s manifest', async () => {
    const store = fakeStore()
    const clock = { t: 1_000 }
    const manifestB = new Map()
    const A = createCacheHandler({ config: cfg, store, manifest: new Map(), now: () => clock.t, buildId: 'b1' })
    const B = createCacheHandler({ config: cfg, store, manifest: manifestB, now: () => clock.t, buildId: 'b1' })
    const a = new A({}); const b = new B({})
    await a.set('page', { kind: 'APP_PAGE', html: '<p>', headers: { 'x-next-cache-tags': 'public:events' } }, {})
    clock.t = 2_000
    await a.revalidateTag(['public:events'], { expire: 3600 })
    clock.t = 2_500
    expect(await b.get('page', { kind: 'APP_PAGE' })).not.toBeNull() // still served (stale)…
    expect(manifestB.get('public:events')).toMatchObject({ stale: 2_000 }) // …and Next sees it as stale
  })

  it('tags revalidated earlier in the request make fetch entries a miss', async () => {
    const store = fakeStore()
    const H = createCacheHandler({ config: cfg, store, manifest: new Map(), now: () => 1, buildId: 'b1' })
    await new H({}).set('k', fetchEntry(1), { tags: ['t'] })
    expect(await new H({ revalidatedTags: ['t'] }).get('k', { kind: 'FETCH', tags: ['t'] })).toBeNull()
  })

  it('Redis down: never throws, serves from the in-process fallback', async () => {
    const store = fakeStore()
    const err = async () => { throw new Error('ECONNREFUSED') }
    store.get.mockImplementation(err); store.set.mockImplementation(err); store.hset.mockImplementation(err); store.hmget.mockImplementation(err)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const h = instance(store, { t: 10 })
    await h.set('k', fetchEntry('local'), { tags: ['x'] })
    expect((await h.get('k', { kind: 'FETCH', tags: ['x'] }))?.value.data).toBe('local')
    await expect(h.revalidateTag('x')).resolves.toBeUndefined()
    warn.mockRestore()
  })

  it('a hung Redis call times out', async () => {
    const store = fakeStore()
    store.get.mockImplementation(() => new Promise(() => {}))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const h = instance(store, { t: 10 })
    const t0 = Date.now()
    expect(await h.get('missing', { kind: 'FETCH', tags: [] })).toBeNull()
    expect(Date.now() - t0).toBeLessThan(2000)
    warn.mockRestore()
  })
})

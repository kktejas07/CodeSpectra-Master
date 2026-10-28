/**
 * Shared Next.js cache handler (next.config.mjs `cacheHandler`, the singular
 * one: ISR pages, route handler responses and unstable_cache / fetch data).
 * See node_modules/next/dist/docs/01-app/03-api-reference/05-config/
 * 01-next-config-js/incrementalCacheHandlerPath.md and 02-guides/self-hosting.md.
 *
 * Enabled only when a Redis URL is in the environment (CACHE_REDIS_URL, else
 * REDIS_URL, else UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN): either a
 * redis:// / rediss:// server (ioredis, like lib/upstash-rate-limit.ts) or an
 * Upstash REST URL. next.config.mjs only points at this file when one is set;
 * without it Next keeps its built-in per-instance cache.
 *
 * Why: with several replicas, revalidateTag() on one instance must invalidate
 * the entry on every instance. Entries and the tag manifest live in Redis:
 *   <prefix>:e:<key>   serialized entry (Buffer / Map safe), TTL-bounded
 *   <prefix>:tags      hash tag → {"stale":ms,"expired":ms}
 * On each get the entry's tags are read back from Redis and merged into Next's
 * in-process tag manifest, so IncrementalCache's own stale / expired checks
 * (revalidateTag(tag, profile) = stale-while-revalidate) work on every instance.
 *
 * Redis down or slow (> CACHE_REDIS_TIMEOUT_MS, default 500 ms): the handler
 * falls back to a small in-process LRU for that call and never throws, so a
 * Redis outage means "per-instance cache", not errors.
 *
 * Plain .mjs on purpose: Next imports it at runtime outside the app bundle
 * (no TypeScript, no "@/..." aliases).
 */
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'

const require = createRequire(import.meta.url)
const TAGS_HEADER = 'x-next-cache-tags'
const DEFAULT_TTL_SEC = 14 * 24 * 3600
const MAX_LOCAL_ENTRIES = 500

// ─── Config ──────────────────────────────────────────────────────────────────

/**
 * Pure: Redis settings from env, or null when the shared cache is off.
 * @param {Record<string, string | undefined>} [env]
 */
export function redisCacheConfig(env = process.env) {
  const direct = String(env.CACHE_REDIS_URL || env.REDIS_URL || '').trim()
  const upstash = String(env.UPSTASH_REDIS_REST_URL || '').trim()
  const url = direct || upstash
  if (!url) return null
  const token = String((direct ? env.CACHE_REDIS_TOKEN : env.UPSTASH_REDIS_REST_TOKEN) || env.UPSTASH_REDIS_REST_TOKEN || '').trim()
  const mode = /^rediss?:\/\//i.test(url) ? 'redis' : /^https:\/\//i.test(url) ? 'rest' : null
  if (!mode || (mode === 'rest' && !token)) return null
  const n = (v, d, max) => {
    const x = Number(v)
    return Number.isFinite(x) && x > 0 ? Math.min(max, Math.floor(x)) : d
  }
  return {
    mode,
    url,
    token,
    prefix: String(env.CACHE_REDIS_PREFIX || 'cs:next-cache').trim().slice(0, 60),
    timeoutMs: n(env.CACHE_REDIS_TIMEOUT_MS, 500, 10_000),
    ttlSec: n(env.CACHE_REDIS_TTL_SEC, DEFAULT_TTL_SEC, 90 * 24 * 3600),
  }
}

// ─── Serialization (Buffer / Map safe) ───────────────────────────────────────

/** Pure: value → JSON-safe tree. Buffers and Maps are tagged so they come back as such. */
export function encodeValue(v) {
  if (v === null || v === undefined) return v
  if (Buffer.isBuffer(v)) return { __t: 'B', d: v.toString('base64') }
  if (v instanceof Uint8Array) return { __t: 'B', d: Buffer.from(v).toString('base64') }
  if (v instanceof Map) return { __t: 'M', d: [...v.entries()].map(([k, x]) => [encodeValue(k), encodeValue(x)]) }
  if (v instanceof Set) return { __t: 'S', d: [...v].map(encodeValue) }
  if (v instanceof Date) return { __t: 'D', d: v.toISOString() }
  if (Array.isArray(v)) return v.map(encodeValue)
  if (typeof v === 'object') {
    const out = {}
    for (const [k, x] of Object.entries(v)) if (x !== undefined && typeof x !== 'function') out[k] = encodeValue(x)
    return out
  }
  return v
}

/** Pure: inverse of encodeValue. */
export function decodeValue(v) {
  if (v === null || v === undefined || typeof v !== 'object') return v
  if (Array.isArray(v)) return v.map(decodeValue)
  if (v.__t === 'B' && typeof v.d === 'string') return Buffer.from(v.d, 'base64')
  if (v.__t === 'M' && Array.isArray(v.d)) return new Map(v.d.map(([k, x]) => [decodeValue(k), decodeValue(x)]))
  if (v.__t === 'S' && Array.isArray(v.d)) return new Set(v.d.map(decodeValue))
  if (v.__t === 'D' && typeof v.d === 'string') return new Date(v.d)
  const out = {}
  for (const [k, x] of Object.entries(v)) out[k] = decodeValue(x)
  return out
}

// ─── Tags ────────────────────────────────────────────────────────────────────

/** Pure: the tags an entry is invalidated by (fetch: ctx tags + soft tags; responses: the tags header). */
export function entryTags(value, ctx) {
  if (!value) return []
  if (value.kind === 'FETCH') return [...new Set([...(ctx?.tags || []), ...(ctx?.softTags || []), ...(value.tags || [])])]
  const h = value.headers?.[TAGS_HEADER]
  return typeof h === 'string' && h ? h.split(',') : []
}

/** Pure: new manifest row for revalidateTag (same rules as Next's file-system cache). */
export function tagUpdate(existing, now, durations) {
  if (durations) {
    const next = { ...(existing || {}), stale: now }
    if (durations.expire !== undefined) next.expired = now + durations.expire * 1000
    return next
  }
  return { ...(existing || {}), expired: now }
}

/** Pure: is an entry written at `lastModified` expired by any of its tags? */
export function isExpiredByTags(manifest, tags, lastModified, now) {
  for (const t of tags) {
    const e = manifest.get(t)?.expired
    if (typeof e === 'number' && e <= now && e > lastModified) return true
  }
  return false
}

/** Pure: TTL for a stored entry (its expire / revalidate window, bounded). */
export function entryTtlSec(value, cacheControl, maxTtl) {
  const expire = Number(cacheControl?.expire)
  const reval = Number(cacheControl?.revalidate ?? value?.revalidate)
  const base = Number.isFinite(expire) && expire > 0 ? expire : Number.isFinite(reval) && reval > 0 ? reval * 10 : maxTtl
  return Math.max(60, Math.min(maxTtl, Math.ceil(base)))
}

// ─── Store clients ───────────────────────────────────────────────────────────

/** Store interface: get / set (with TTL) / hmget / hset. Tests pass a fake. */
function restStore(cfg) {
  const call = async (cmds) => {
    const res = await fetch(`${cfg.url.replace(/\/+$/, '')}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cmds),
      signal: AbortSignal.timeout(cfg.timeoutMs),
    })
    if (!res.ok) throw new Error(`redis rest ${res.status}`)
    const out = await res.json()
    const bad = out.find((r) => r && r.error)
    if (bad) throw new Error('redis rest error')
    return out.map((r) => r.result)
  }
  return {
    get: async (k) => (await call([['GET', k]]))[0] ?? null,
    set: async (k, v, ttl) => { await call([['SET', k, v, 'EX', String(ttl)]]) },
    hmget: async (h, fields) => (fields.length ? (await call([['HMGET', h, ...fields]]))[0] : []),
    hset: async (h, obj) => { if (Object.keys(obj).length) await call([['HSET', h, ...Object.entries(obj).flat()]]) },
  }
}

function ioredisStore(cfg) {
  let client = null
  const get = () => {
    if (!client) {
      const Redis = require('ioredis')
      client = new (Redis.default || Redis)(cfg.url, {
        ...(cfg.token && !/^rediss?:\/\/[^/@]*:[^/@]*@/i.test(cfg.url) ? { password: cfg.token } : {}),
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        connectTimeout: 5000,
        lazyConnect: false,
      })
      client.on('error', () => { /* calls fail fast and fall back */ })
    }
    return client
  }
  return {
    get: (k) => get().get(k),
    set: async (k, v, ttl) => { await get().set(k, v, 'EX', ttl) },
    hmget: (h, fields) => (fields.length ? get().hmget(h, ...fields) : Promise.resolve([])),
    hset: async (h, obj) => { if (Object.keys(obj).length) await get().hset(h, obj) },
  }
}

function withTimeout(p, ms) {
  let t
  return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error('redis timeout')), ms) })]).finally(() => clearTimeout(t))
}

function nextTagsManifest() {
  try {
    return require('next/dist/server/lib/incremental-cache/tags-manifest.external.js').tagsManifest
  } catch {
    return new Map()
  }
}

function buildId(serverDistDir) {
  try {
    return fs.readFileSync(path.join(serverDistDir, '..', 'BUILD_ID'), 'utf8').trim().slice(0, 64)
  } catch {
    return 'dev'
  }
}

// ─── Handler ─────────────────────────────────────────────────────────────────

/**
 * Build the handler class. `opts.store` (tests) replaces the Redis client,
 * `opts.manifest` replaces Next's tag manifest map, `opts.now` the clock.
 */
export function createCacheHandler(opts = {}) {
  const cfg = opts.config ?? redisCacheConfig()
  const now = opts.now ?? (() => Date.now())
  const manifest = opts.manifest ?? nextTagsManifest()
  const local = new Map()
  let store = opts.store ?? null
  let warned = false

  const remember = (k, v) => {
    local.delete(k)
    local.set(k, v)
    if (local.size > MAX_LOCAL_ENTRIES) local.delete(local.keys().next().value)
  }
  const fallback = (e) => {
    if (!warned) {
      warned = true
      console.warn('[cache-handler] Redis unavailable, using the in-process cache:', e instanceof Error ? e.message.slice(0, 80) : 'error')
      setTimeout(() => { warned = false }, 60_000).unref?.()
    }
  }

  return class RedisCacheHandler {
    constructor(ctx = {}) {
      this.prefix = `${cfg?.prefix || 'cs:next-cache'}:${opts.buildId ?? buildId(ctx.serverDistDir || '.next/server')}`
      if (!store && cfg) store = cfg.mode === 'rest' ? restStore(cfg) : ioredisStore(cfg)
      this.timeout = cfg?.timeoutMs ?? 500
      this.ttl = cfg?.ttlSec ?? DEFAULT_TTL_SEC
      /** Tags revalidated earlier in this request (header-driven); fetch entries with them are misses. */
      this.revalidatedTags = Array.isArray(ctx.revalidatedTags) ? ctx.revalidatedTags : []
    }

    entryKey(key) { return `${this.prefix}:e:${key}` }
    get tagsKey() { return `${this.prefix}:tags` }

    async syncTags(tags) {
      if (!store || !tags.length) return
      try {
        const rows = await withTimeout(store.hmget(this.tagsKey, tags), this.timeout)
        tags.forEach((t, i) => {
          if (!rows?.[i]) return
          try {
            const remote = JSON.parse(rows[i])
            const mine = manifest.get(t) || {}
            manifest.set(t, {
              ...mine,
              ...(typeof remote.stale === 'number' && remote.stale > (mine.stale ?? 0) ? { stale: remote.stale } : {}),
              ...(typeof remote.expired === 'number' && remote.expired > (mine.expired ?? 0) ? { expired: remote.expired } : {}),
            })
          } catch { /* bad row: ignore */ }
        })
      } catch (e) {
        fallback(e)
      }
    }

    async get(key, ctx) {
      let entry = null
      if (store) {
        try {
          const raw = await withTimeout(store.get(this.entryKey(key)), this.timeout)
          entry = raw ? decodeValue(JSON.parse(typeof raw === 'string' ? raw : String(raw))) : null
          if (entry) remember(key, entry)
        } catch (e) {
          fallback(e)
          entry = local.get(key) ?? null
        }
      } else {
        entry = local.get(key) ?? null
      }
      if (!entry) return null
      const tags = entryTags(entry.value, ctx)
      if (entry.value?.kind === 'FETCH' && tags.some((t) => this.revalidatedTags.includes(t))) return null
      await this.syncTags(tags)
      if (isExpiredByTags(manifest, tags, entry.lastModified, now())) return null
      return entry
    }

    async set(key, data, ctx) {
      const entry = { lastModified: now(), value: data, ...(ctx?.cacheControl ? { cacheControl: ctx.cacheControl } : {}) }
      if (data?.kind === 'FETCH' && ctx?.tags?.length) entry.value = { ...data, tags: [...new Set([...(data.tags || []), ...ctx.tags])] }
      remember(key, entry)
      if (!store) return
      try {
        await withTimeout(store.set(this.entryKey(key), JSON.stringify(encodeValue(entry)), entryTtlSec(data, ctx?.cacheControl, this.ttl)), this.timeout * 4)
      } catch (e) {
        fallback(e)
      }
    }

    async revalidateTag(tags, durations) {
      const list = (typeof tags === 'string' ? [tags] : tags || []).filter(Boolean)
      if (!list.length) return
      const t = now()
      const rows = {}
      for (const tag of list) {
        const next = tagUpdate(manifest.get(tag), t, durations)
        manifest.set(tag, next)
        rows[tag] = JSON.stringify(next)
      }
      if (!store) return
      try {
        await withTimeout(store.hset(this.tagsKey, rows), this.timeout * 4)
      } catch (e) {
        fallback(e)
      }
    }

    resetRequestCache() {}
  }
}

export default createCacheHandler()

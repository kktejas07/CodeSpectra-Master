/**
 * Distributed fixed-window counter backed by Redis.
 *
 * Works with BOTH:
 *  - Upstash Redis REST (`https://...upstash.io`) — the classic cloud mode, and
 *  - any self-hosted Redis (`redis://` / `rediss://`) e.g. the Docker / Dokploy
 *    `codespectra-redis` container — via the native RESP protocol (ioredis).
 *
 * Config is read from the Mongo-backed server-secrets cache (`readServerSecrets`,
 * which is invalidated the moment the admin saves Settings → Redis), so changes
 * to the Redis URL/token take effect in real time — no redeploy, no restart.
 * `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` env vars are the fallback.
 * When unconfigured it degrades to the in-process sliding window.
 */
import { readServerSecrets } from '@/lib/server-secrets-cache'
import { clientLimiterKeyFromRequest, rateLimitSlidingWindow } from '@/lib/in-memory-rate-limit'

export type RedisMode = 'upstash-rest' | 'redis' | null

interface RedisClientLike {
  disconnect: () => void
  ping: () => Promise<unknown>
  pipeline: () => any
  info?: () => Promise<string>
  scan?: (cursor: string | number, ...args: unknown[]) => Promise<[string, string[]]>
  set?: (key: string, value: string, ...args: unknown[]) => Promise<'OK' | null>
  del?: (...keys: string[]) => Promise<number>
  keys?: (pattern: string) => Promise<string[]>
}

let _redisClient: RedisClientLike | null = null
let _redisUrl = ''
let _redisToken = ''

async function resolveConfig(): Promise<{ url: string; token: string }> {
  const s = await readServerSecrets()
  return {
    url: process.env.UPSTASH_REDIS_REST_URL?.trim() || s.upstash_redis_rest_url?.trim() || '',
    token: process.env.UPSTASH_REDIS_REST_TOKEN?.trim() || s.upstash_redis_rest_token?.trim() || '',
  }
}

function urlHasEmbeddedCreds(url: string): boolean {
  const m = url.match(/^rediss?:\/\/([^/@]+)@/i)
  return !!m && m[1].includes(':')
}

/**
 * Get (or lazily reconnect) a native ioredis client for a `redis://` / `rediss://`
 * URL. Reacts to config changes in real time: if the URL/token the caller
 * resolved differs from the cached client, the old connection is dropped.
 * Resolves only once the connection is actually ready, so the first command
 * issued never races the TCP/TLS handshake.
 */
async function getRedisClient(url: string, token: string): Promise<RedisClientLike> {
  if (_redisClient && _redisUrl === url && _redisToken === token) {
    return _redisClient
  }
  if (_redisClient) {
    try { _redisClient.disconnect() } catch { /* ignore */ }
    _redisClient = null
  }
  const { default: Redis } = await import('ioredis')
  const client = new Redis(url, {
    // If the URL already embeds `:pass@`, don't double-supply the password.
    ...(urlHasEmbeddedCreds(url) ? {} : token ? { password: token } : {}),
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 5000,
  }) as unknown as RedisClientLike
  // A permanent no-op 'error' listener so transient connection errors never
  // crash the Node process via an unhandled 'error' event.
  const events = client as unknown as {
    on: (ev: string, fn: (...a: any[]) => void) => void
    once: (ev: string, fn: (...a: any[]) => void) => void
    removeListener: (ev: string, fn: (...a: any[]) => void) => void
  }
  events.on('error', () => { /* handled by callers */ })
  try {
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        events.removeListener('ready', onReady)
        events.removeListener('error', onError)
      }
      const onReady = () => { cleanup(); resolve() }
      const onError = (e: Error) => { cleanup(); reject(e) }
      events.once('ready', onReady)
      events.once('error', onError)
    })
  } catch (e) {
    try { client.disconnect() } catch { /* ignore */ }
    throw e
  }
  _redisClient = client
  _redisUrl = url
  _redisToken = token
  return client
}

/**
 * Ping whatever Redis is configured. Used by the admin "Test Connection" flow.
 * `url`/`token` override the saved config when provided (for testing before save).
 */
export async function redisPing(
  url?: string,
  token?: string
): Promise<{ ok: boolean; mode: RedisMode; latencyMs?: number; error?: string }> {
  const saved = await resolveConfig()
  const u = (url || '').trim() || saved.url
  const t = (token || '').trim() || saved.token
  if (!u || !t) {
    return { ok: false, mode: null, error: 'Redis not configured — add a URL and token first.' }
  }
  const start = Date.now()
  const mode: RedisMode = /^https?:\/\//i.test(u) ? 'upstash-rest' : 'redis'
  try {
    if (mode === 'upstash-rest') {
      const res = await fetch(u.replace(/\/$/, ''), {
        method: 'POST',
        headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
        body: JSON.stringify([['PING']]),
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) {
        return { ok: false, mode, error: `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}` }
      }
      return { ok: true, mode, latencyMs: Date.now() - start }
    }
    const client = await getRedisClient(u, t)
    await client!.ping()
    return { ok: true, mode, latencyMs: Date.now() - start }
  } catch (e) {
    return { ok: false, mode, error: (e as Error).message }
  }
}

/**
 * Snapshot of the configured Redis: connectivity + live server stats + current
 * rate-limit counters. Native redis:// mode runs INFO + SCAN; Upstash REST mode
 * returns connectivity only (its HTTP API exposes no INFO/SCAN).
 */
export interface RedisStatus {
  configured: boolean
  connected: boolean
  mode: RedisMode
  latencyMs?: number
  memoryUsedMb?: number
  connectedClients?: number
  opsPerSec?: number
  uptimeSec?: number
  keyspace?: number
  rateLimitKeys?: { key: string; count: number; ttlSec: number }[]
  error?: string
}

export async function redisStatus(): Promise<RedisStatus> {
  const { url, token } = await resolveConfig()
  if (!url || !token) {
    return { configured: false, connected: false, mode: null }
  }
  const start = Date.now()
  const mode: RedisMode = /^https?:\/\//i.test(url) ? 'upstash-rest' : 'redis'
  try {
    if (mode === 'upstash-rest') {
      const res = await fetch(url.replace(/\/$/, ''), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify([['PING']]),
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) {
        return { configured: true, connected: false, mode, error: `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}` }
      }
      return { configured: true, connected: true, mode, latencyMs: Date.now() - start }
    }

    const client = await getRedisClient(url, token)
    const latencyMs = Date.now() - start
    let info = ''
    try { info = String(await client.info?.()) } catch { /* ignore */ }
    const kv = new Map<string, string>()
    for (const line of info.split('\n')) {
      if (!line.includes(':')) continue
      const i = line.indexOf(':')
      kv.set(line.slice(0, i).trim(), line.slice(i + 1).trim())
    }
    const used = Number(kv.get('used_memory') ?? 0)

    // Live rate-limit counters (codespectra:rl:* + ai_rate_limit:*)
    const rateKeys: { key: string; count: number; ttlSec: number }[] = []
    let keyspace = 0
    for (const pattern of ['codespectra:rl:*', 'ai_rate_limit:*']) {
      if (!client.scan) break
      let cursor = '0'
      do {
        const [next, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 500)
        cursor = String(next)
        keyspace += (keys as string[]).length
        for (const k of (keys as string[]).slice(0, 100)) {
          const exec = await client.pipeline().get(k).ttl(k).exec()
          rateKeys.push({ key: k, count: Number(exec?.[0]?.[1] ?? 0), ttlSec: Number(exec?.[1]?.[1] ?? 0) })
        }
      } while (cursor !== '0' && keyspace < 2000)
    }
    rateKeys.sort((a, b) => b.count - a.count)

    return {
      configured: true,
      connected: true,
      mode,
      latencyMs,
      memoryUsedMb: used ? Math.round((used / 1024 / 1024) * 10) / 10 : undefined,
      connectedClients: kv.has('connected_clients') ? Number(kv.get('connected_clients')) : undefined,
      opsPerSec: kv.has('instantaneous_ops_per_sec') ? Number(kv.get('instantaneous_ops_per_sec')) : undefined,
      uptimeSec: kv.has('uptime_in_seconds') ? Number(kv.get('uptime_in_seconds')) : undefined,
      keyspace,
      rateLimitKeys: rateKeys.slice(0, 25),
    }
  } catch (e) {
    return { configured: true, connected: false, mode, error: (e as Error).message }
  }
}

/**
 * Fixed-window limiter: at most `maxHits` per `windowMs` bucket (aligned to wall clock).
 * Redis-backed when configured, degrades to the in-process sliding window on error.
 * `redisKey` is the full key used in Redis (prefix + namespace + identity + bucket).
 */
export async function rateLimitFixedWindow(
  redisKey: string,
  memoryKey: string,
  maxHits: number,
  windowMs: number,
): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  const { url, token } = await resolveConfig()
  if (!url || !token) {
    return rateLimitSlidingWindow(memoryKey, maxHits, windowMs)
  }
  const ttlSec = Math.ceil(windowMs / 1000) + 30

  try {
    if (/^https?:\/\//i.test(url)) {
      // Upstash REST pipeline: INCR + EXPIRE
      const base = url.replace(/\/$/, '')
      const res = await fetch(base, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify([
          ['INCR', redisKey],
          ['EXPIRE', redisKey, ttlSec],
        ]),
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) throw new Error(`upstash_${res.status}:${(await res.text()).slice(0, 200)}`)
      const json = (await res.json()) as { result?: unknown[] }
      const count = Number(json.result?.[0] ?? 0)
      if (count > maxHits) {
        const elapsed = Date.now() % windowMs
        return { ok: false, retryAfterSec: Math.max(1, Math.ceil((windowMs - elapsed) / 1000)) }
      }
      return { ok: true }
    }

    // Self-hosted Redis (redis:// / rediss://) via ioredis
    const client = await getRedisClient(url, token)
    const exec = await client!.pipeline().incr(redisKey).expire(redisKey, ttlSec).exec()
    const incrRes = exec?.[0] ?? [null, 0]
    if (incrRes[0]) throw incrRes[0]
    const count = Number(incrRes[1] ?? 0)
    if (count > maxHits) {
      const elapsed = Date.now() % windowMs
      return { ok: false, retryAfterSec: Math.max(1, Math.ceil((windowMs - elapsed) / 1000)) }
    }
    return { ok: true }
  } catch (e) {
    console.warn('[CodeSpectra] Redis rate limit failed, using memory:', (e as Error).message)
    return rateLimitSlidingWindow(memoryKey, maxHits, windowMs)
  }
}

/**
 * Delete all live rate-limit counters (frontend `codespectra:rl:*` + backend
 * `ai_rate_limit:*`). Admin maintenance action — the counters are ephemeral by
 * design, so removing them only resets in-flight limits, never user data.
 * Returns the number of keys actually removed.
 */
export async function flushRateLimitKeys(): Promise<{ flushed: number; error?: string }> {
  const { url, token } = await resolveConfig()
  if (!url || !token) return { flushed: 0, error: 'Redis is not configured.' }

  const patterns = ['codespectra:rl:*', 'ai_rate_limit:*']
  try {
    if (/^https?:\/\//i.test(url)) {
      // Upstash REST: KEYS each pattern, then a single DEL.
      const base = url.replace(/\/$/, '')
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
      const keys: string[] = []
      for (const pattern of patterns) {
        const res = await fetch(base, {
          method: 'POST',
          headers,
          body: JSON.stringify([['KEYS', pattern]]),
          signal: AbortSignal.timeout(8000),
        })
        if (!res.ok) continue
        const json = await res.json().catch(() => null) as { result?: string[] } | null
        if (Array.isArray(json?.result)) keys.push(...json!.result!)
      }
      if (!keys.length) return { flushed: 0 }
      const res = await fetch(base, {
        method: 'POST',
        headers,
        body: JSON.stringify([['DEL', ...keys]]),
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) return { flushed: 0, error: `Delete failed (HTTP ${res.status})` }
      const json = await res.json().catch(() => null) as { result?: number } | null
      return { flushed: Number(json?.result ?? 0) }
    }

    // Self-hosted Redis — KEYS is fine here: rate-limit keys are few + short-TTL.
    const client = await getRedisClient(url, token)
    let flushed = 0
    for (const pattern of patterns) {
      const keys = (await client.keys?.(pattern)) ?? []
      if (keys.length) flushed += (await client.del?.(...keys)) ?? 0
    }
    return { flushed }
  } catch (e) {
    return { flushed: 0, error: (e as Error).message }
  }
}

/**
 * Distributed lock via `SET NX EX` (set-if-not-exists with expiry). Returns
 * true only if THIS process won the lock; the lock auto-releases after
 * `ttlSec` or when the holder calls `releaseRedisLock`. Falls back to
 * "lock acquired" (true) when Redis is unconfigured so single-instance /
 * dev environments are unaffected.
 */
export async function acquireRedisLock(
  key: string,
  ttlSec: number,
): Promise<boolean> {
  const { url, token } = await resolveConfig()
  if (!url || !token) return true

  try {
    if (/^https?:\/\//i.test(url)) {
      const base = url.replace(/\/$/, '')
      const res = await fetch(base, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify([['SET', key, '1', 'NX', 'EX', ttlSec]]),
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) return true // Redis issue → behave like a lock held by no one (proceed)
      const json = (await res.json()) as { result?: unknown }
      return json.result === 'OK'
    }

    const client = await getRedisClient(url, token)
    const result = await client.set?.(key, '1', 'EX', ttlSec, 'NX')
    return result === 'OK'
  } catch (e) {
    console.warn('[CodeSpectra] Redis lock failed, proceeding unlocked:', (e as Error).message)
    return true
  }
}

/**
 * Release a lock previously held by this process (`DEL`). Best-effort — the
 * TTL is the real safety net if this never runs.
 */
export async function releaseRedisLock(key: string): Promise<void> {
  const { url, token } = await resolveConfig()
  if (!url || !token) return
  try {
    if (/^https?:\/\//i.test(url)) {
      const base = url.replace(/\/$/, '')
      await fetch(base, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify([['DEL', key]]),
        signal: AbortSignal.timeout(8000),
      })
      return
    }
    const client = await getRedisClient(url, token)
    await client.del?.(key)
  } catch { /* best-effort */ }
}

/**
 * Generic Redis-backed fixed-window limiter with the same signature as the
 * in-process `rateLimitSlidingWindow`, so route handlers migrate by adding
 * `await` and swapping the import. Key space: `codespectra:rl:{key}:{bucket}`.
 *
 * ponytail: this is a wall-clock-aligned FIXED window (atomic INCR/EXPIRE),
 * not the timestamp list of the in-memory sliding window — a burst straddling
 * a bucket boundary can pass up to 2x the limit. Acceptable for these auth/AI
 * limits; upgrade path is the sliding-window Lua script if tighter bounds are
 * ever needed.
 */
export async function rateLimitRedis(
  key: string,
  maxHits: number,
  windowMs: number,
): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  const bucket = Math.floor(Date.now() / windowMs)
  const redisKey = `codespectra:rl:${key}:${bucket}`
  return rateLimitFixedWindow(redisKey, key, maxHits, windowMs)
}

/**
 * Generate-fixes limiter: 24 req / 10 min authenticated, 10 anonymous.
 */
export async function rateLimitGenerateFixes(
  request: Request,
  userId: string | null,
): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  const windowMs = 10 * 60 * 1000
  const maxHits = userId ? 24 : 10
  const key = clientLimiterKeyFromRequest(request, userId)
  return rateLimitRedis(`generate-fixes:${key}`, maxHits, windowMs)
}

/**
 * AI limiter: 30 req/min authenticated, 5 anonymous. Redis-backed when configured.
 */
export async function rateLimitAIRedis(
  request: Request,
  userId: string | null,
): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  const key = clientLimiterKeyFromRequest(request, userId)
  return rateLimitRedis(`ai:${key}`, userId ? 30 : 5, 60_000)
}
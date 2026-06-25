/**
 * Optional distributed fixed-window counter via Upstash Redis REST.
 * Set `UPSTASH_REDIS_REST_URL` (e.g. https://us1-xxx.upstash.io) and `UPSTASH_REDIS_REST_TOKEN`.
 * Falls back to in-memory sliding window when unset.
 */
import { clientLimiterKeyFromRequest, rateLimitSlidingWindow } from '@/lib/in-memory-rate-limit'

type PipelineResult = { result?: unknown[] }

function upstashConfigured(): boolean {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim()
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
  return Boolean(url && token)
}

async function upstashPipeline(commands: (string | number)[][]): Promise<unknown[]> {
  const base = process.env.UPSTASH_REDIS_REST_URL!.replace(/\/$/, '')
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!.trim()
  const res = await fetch(base, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`upstash_${res.status}:${t.slice(0, 200)}`)
  }
  const json = (await res.json()) as PipelineResult
  return Array.isArray(json.result) ? json.result : []
}

/**
 * Fixed-window limiter: at most `maxHits` per `windowMs` bucket (aligned to wall clock).
 */
export async function rateLimitGenerateFixes(
  request: Request,
  userId: string | null
): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  const windowMs = 10 * 60 * 1000
  const maxHits = userId ? 24 : 10
  const key = clientLimiterKeyFromRequest(request, userId)
  const bucket = Math.floor(Date.now() / windowMs)
  const redisKey = `codespectra:rl:generate-fixes:${key}:${bucket}`

  if (!upstashConfigured()) {
    return rateLimitSlidingWindow(`generate-fixes:${key}`, maxHits, windowMs)
  }

  try {
    const ttlSec = Math.ceil(windowMs / 1000) + 30
    const results = await upstashPipeline([
      ['INCR', redisKey],
      ['EXPIRE', redisKey, ttlSec],
    ])
    const count = Number(results[0] ?? 0)
    if (count > maxHits) {
      const elapsed = Date.now() % windowMs
      const retryAfterSec = Math.max(1, Math.ceil((windowMs - elapsed) / 1000))
      return { ok: false, retryAfterSec }
    }
    return { ok: true }
  } catch (e) {
    console.warn('[CodeSpectra] Upstash rate limit failed, using memory:', e)
    return rateLimitSlidingWindow(`generate-fixes:${key}`, maxHits, windowMs)
  }
}

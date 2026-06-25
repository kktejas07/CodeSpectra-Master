/** In-process sliding-window limiter (best-effort per server instance; good for dev / single-node). */

const buckets = new Map<string, number[]>()

function prune(now: number, windowMs: number, hits: number[]): number[] {
  return hits.filter((t) => now - t < windowMs)
}

export function rateLimitSlidingWindow(
  key: string,
  maxHits: number,
  windowMs: number
): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now()
  const prev = buckets.get(key) ?? []
  const hits = prune(now, windowMs, prev)

  if (hits.length >= maxHits) {
    const oldest = hits[0] ?? now
    const retryAfterMs = Math.max(0, windowMs - (now - oldest))
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)) }
  }

  hits.push(now)
  buckets.set(key, hits)
  return { ok: true }
}

export function clientLimiterKeyFromRequest(request: Request, userId: string | null): string {
  if (userId) return `u:${userId}`
  const h = request.headers as Headers
  const xf = h.get('x-forwarded-for')
  const ip = xf?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown'
  return `ip:${ip}`
}

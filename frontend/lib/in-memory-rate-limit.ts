import { clientIpFromRequest } from '@/lib/client-ip'

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
  // SEC-021: forwarding headers count only from TRUSTED_PROXY_CIDRS (lib/client-ip).
  return `ip:${clientIpFromRequest(request)}`
}

// AI-specific rate limit: authenticated users get 30 requests/min, anonymous get 5/min
export function rateLimitAI(request: Request, userId: string | null): { ok: true } | { ok: false; retryAfterSec: number } {
  const key = clientLimiterKeyFromRequest(request, userId)
  const maxHits = userId ? 30 : 5
  return rateLimitSlidingWindow(`ai:${key}`, maxHits, 60_000)
}

import { clientIpFromRequest } from '@/lib/client-ip'

/**
 * Edge-safe sliding-window rate limiter for middleware.
 * Best-effort per worker instance (same ceiling as the Node in-memory limiter) —
 * generous global threshold only catches egregious abuse; per-route limits in
 * Node handlers remain the primary protection.
 */

const edgeBuckets = new Map<string, number[]>()

export function edgeRateLimit(key: string, maxHits: number, windowMs: number): { ok: boolean; retryAfterSec: number } {
  const now = Date.now()
  const prev = edgeBuckets.get(key) ?? []
  const hits = prev.filter((t) => now - t < windowMs)

  if (hits.length >= maxHits) {
    const oldest = hits[0] ?? now
    const retryAfterMs = Math.max(0, windowMs - (now - oldest))
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)) }
  }

  hits.push(now)
  edgeBuckets.set(key, hits)
  return { ok: true, retryAfterSec: 0 }
}

export function edgeClientKey(request: Request): string {
  return clientIpFromRequest(request)
}

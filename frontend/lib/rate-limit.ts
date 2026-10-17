/**
 * Route-level rate limit helper. Wraps the Redis fixed-window limiter
 * (falls back to in-memory when Redis is not configured) and returns a ready
 * 429 response, so a route only needs:
 *
 *   const limited = await limitRequest(req, 'submissions', user.id, 20, 60_000)
 *   if (limited) return limited
 */
import { NextResponse } from 'next/server'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'
import { clientLimiterKeyFromRequest } from '@/lib/in-memory-rate-limit'

export async function limitRequest(
  request: Request,
  name: string,
  userId: string | null,
  maxHits: number,
  windowMs: number,
): Promise<NextResponse | null> {
  const key = clientLimiterKeyFromRequest(request, userId)
  const rl = await rateLimitRedis(`${name}:${key}`, maxHits, windowMs)
  if (rl.ok) return null
  return NextResponse.json(
    { error: 'Too many requests. Please wait a moment and try again.' },
    { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
  )
}

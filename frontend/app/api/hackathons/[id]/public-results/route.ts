/**
 * GET /api/hackathons/[id]/public-results
 *
 * Public, read-only view of a hackathon's final results. Works for signed-out
 * visitors, but only once the organiser has released results
 * (`results_released === true`). Before that it returns 403 so unreleased
 * scores never leave the server.
 *
 * What's exposed: event summary, team name/xp/level/member display names,
 * and released submissions (final judged points only — no code, repo, judge
 * records or feedback). Teams are ranked on judged totals. The viewer's own
 * team additionally gets its certificate `verify_token` (never the join
 * `qr_token`) and its own feedback.
 *
 * The `id` segment accepts the hackathon id or slug.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/api-auth'
import { loadPublicResults } from '@/lib/hackathons/public-results'
import { clientLimiterKeyFromRequest } from '@/lib/in-memory-rate-limit'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAPIUser().catch(() => null)
  const rl = await rateLimitRedis(
    `hk-public-results:${clientLimiterKeyFromRequest(req, user?.id ?? null)}`,
    60,
    60_000,
  )
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many requests', code: 'too_many_requests' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  const { id } = await ctx.params
  const out = await loadPublicResults(id, user?.id ?? null)
  if (!out) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  return NextResponse.json(out)
}

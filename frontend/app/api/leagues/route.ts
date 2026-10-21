/** GET /api/leagues?season=<slug> — public season list + boards (cached; no user ids or emails). */
import { NextRequest, NextResponse } from 'next/server'
import { leaguesOverviewCached } from '@/lib/leagues/public'
import { leagueGuard } from '@/lib/leagues/http'
import { clientLimiterKeyFromRequest } from '@/lib/in-memory-rate-limit'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  return leagueGuard('public GET', async () => {
    const rl = await rateLimitRedis(`leagues-public:${clientLimiterKeyFromRequest(req, null)}`, 60, 60_000)
    if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } })
    const slug = req.nextUrl.searchParams.get('season')
    const s = slug && /^[a-z0-9-]{3,60}$/.test(slug) ? slug : null
    return NextResponse.json(await leaguesOverviewCached(s), { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300' } })
  })
}

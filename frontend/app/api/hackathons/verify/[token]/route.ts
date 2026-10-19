/**
 * GET /api/hackathons/verify/[token] — public certificate check.
 *
 * Works signed out (outside verifiers scan the QR). The token is the team's
 * `verify_token`, minted for certificates — never the join secret `qr_token`.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getMongoDb } from '@/lib/mongodb'
import { clientLimiterKeyFromRequest } from '@/lib/in-memory-rate-limit'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const rl = await rateLimitRedis(`hk-verify:${clientLimiterKeyFromRequest(req, null)}`, 30, 60_000)
  if (!rl.ok) {
    return NextResponse.json({ valid: false, error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } })
  }
  const { token } = await ctx.params
  if (!token || token.length < 16 || token.length > 64) {
    return NextResponse.json({ valid: false, error: 'Certificate not found' }, { status: 404 })
  }

  try {
    const db = await getMongoDb()
    const team = await db.collection('hackathon_teams').findOne(
      { verify_token: token },
      { projection: { id: 1, name: 1, hackathon_id: 1, final_rank: 1, final_tied: 1, final_total: 1, members: 1 } },
    )
    if (!team) {
      return NextResponse.json({ valid: false, error: 'Certificate not found' }, { status: 404 })
    }

    const hk = await db.collection('hackathons').findOne(
      { id: team.hackathon_id },
      { projection: { id: 1, name: 1, slug: 1, results_released: 1, released_at: 1, num_teams: 1 } },
    )
    if (!hk || !hk.results_released) {
      return NextResponse.json({ valid: false, error: 'Certificate not found' }, { status: 404 })
    }

    return NextResponse.json({
      valid: true,
      event: hk.name,
      team: team.name,
      members: team.members?.map((m: { name?: string }) => m.name).filter(Boolean) || [],
      rank: typeof team.final_rank === 'number' ? team.final_rank : null,
      tied: !!team.final_tied,
      points: typeof team.final_total === 'number' ? team.final_total : null,
      released_at: hk.released_at,
    })
  } catch {
    return NextResponse.json({ valid: false, error: 'Verification failed' }, { status: 500 })
  }
}

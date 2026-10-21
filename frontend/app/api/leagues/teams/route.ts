/**
 * POST   /api/leagues/teams { action: 'create', season_id, name } → team + join code (shown once)
 *                           { action: 'join', code }
 * DELETE /api/leagues/teams?team=<id>   leave (the last member leaving deletes the team)
 */
import { NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { createTeam, joinTeam, leaveTeam } from '@/lib/leagues/service'
import { body, leagueGuard } from '@/lib/leagues/http'
import { revalidateLeagues } from '@/lib/leagues/public'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  return leagueGuard('teams POST', async () => {
    const user = await getAPIUser().catch(() => null)
    if (!user) return NextResponse.json({ error: 'Sign in to continue.', code: 'sign_in_to_continue' }, { status: 401 })
    const rl = await rateLimitRedis(`league-team:${user.id}`, 20, 900_000)
    if (!rl.ok) return NextResponse.json({ error: 'Too many attempts — try again later' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } })
    const b = await body(req)
    if (b.action === 'create') {
      const r = await createTeam(user, b.season_id, b.name)
      await revalidateLeagues()
      return NextResponse.json(r, { status: 201 })
    }
    if (b.action === 'join') {
      const team = await joinTeam(user, b.code)
      await revalidateLeagues()
      return NextResponse.json({ team })
    }
    return NextResponse.json({ error: 'Unknown action', code: 'unknown_action' }, { status: 400 })
  })
}

export async function DELETE(req: Request) {
  return leagueGuard('teams DELETE', async () => {
    const user = await getAPIUser().catch(() => null)
    if (!user) return NextResponse.json({ error: 'Sign in to continue.', code: 'sign_in_to_continue' }, { status: 401 })
    const id = new URL(req.url).searchParams.get('team') || ''
    if (!id || id.length > 80) return NextResponse.json({ error: 'Pick a team' }, { status: 400 })
    await leaveTeam(user, id)
    await revalidateLeagues()
    return NextResponse.json({ ok: true })
  })
}

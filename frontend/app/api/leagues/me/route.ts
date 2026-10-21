/** GET /api/leagues/me — my league teams, badges and the open seasons. */
import { NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { myLeague } from '@/lib/leagues/service'
import { leagueGuard } from '@/lib/leagues/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return leagueGuard('me GET', async () => {
    const user = await getAPIUser().catch(() => null)
    if (!user) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 })
    return NextResponse.json(await myLeague(user), { headers: { 'Cache-Control': 'no-store' } })
  })
}

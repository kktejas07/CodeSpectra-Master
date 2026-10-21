/**
 * GET  /api/admin/leagues   every season + a suggested quarterly window (superadmin)
 * POST /api/admin/leagues   create a season { name, slug?, starts_at, ends_at, status?, config? }
 */
import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { auditAdmin } from '@/lib/admin-audit'
import { createSeason, listSeasons } from '@/lib/leagues/service'
import { body, leagueGuard } from '@/lib/leagues/http'
import { revalidateLeagues } from '@/lib/leagues/public'
import { DEFAULT_SEASON_CONFIG, quarterWindow } from '@/lib/leagues/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  return leagueGuard('admin GET', async () => NextResponse.json({ items: await listSeasons(), suggested: quarterWindow(), defaults: DEFAULT_SEASON_CONFIG }))
}

export async function POST(req: Request) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  return leagueGuard('admin POST', async () => {
    const season = await createSeason(gate.user, await body(req))
    await auditAdmin(gate.user, 'admin.league.create', 'league_season', `league_season/${season.id}`, `name=${season.name}`)
    await revalidateLeagues()
    return NextResponse.json({ season }, { status: 201 })
  })
}

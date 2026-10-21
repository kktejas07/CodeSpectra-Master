/**
 * GET   /api/admin/leagues/[id]   season + freshly computed boards (superadmin)
 * PATCH /api/admin/leagues/[id]   edit window / status / scoring config (not once finalised)
 * POST  /api/admin/leagues/[id]   { action: 'recompute' } purge public caches · { action: 'finalize' } freeze + badges
 */
import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { auditAdmin } from '@/lib/admin-audit'
import { computeSnapshot, finalizeSeason, getSeason, LeagueError, seasonBoards, updateSeason } from '@/lib/leagues/service'
import { body, leagueGuard } from '@/lib/leagues/http'
import { revalidateLeagues } from '@/lib/leagues/public'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Ctx) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { id } = await params
  return leagueGuard('admin season GET', async () => {
    const season = await getSeason(id)
    if (!season) throw new LeagueError('Season not found', 404)
    const boards = season.status === 'finalized' ? await seasonBoards(season) : await computeSnapshot(season)
    return NextResponse.json({ season, boards: { ...boards, individual: boards.individual.slice(0, 100), teams: boards.teams.slice(0, 100) } }, { headers: { 'Cache-Control': 'no-store' } })
  })
}

export async function PATCH(req: Request, { params }: Ctx) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { id } = await params
  return leagueGuard('admin season PATCH', async () => {
    const season = await updateSeason(id, await body(req))
    await auditAdmin(gate.user, 'admin.league.update', 'league_season', `league_season/${season.id}`, `status=${season.status}`)
    await revalidateLeagues()
    return NextResponse.json({ season })
  })
}

export async function POST(req: Request, { params }: Ctx) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { id } = await params
  return leagueGuard('admin season action', async () => {
    const b = await body(req)
    if (b.action === 'recompute') {
      await revalidateLeagues()
      return NextResponse.json({ ok: true })
    }
    if (b.action === 'finalize') {
      const r = await finalizeSeason(id)
      await auditAdmin(gate.user, 'admin.league.finalize', 'league_season', `league_season/${id}`, `badges=${r.badges}`, 'warning')
      await revalidateLeagues()
      return NextResponse.json({ ok: true, badges: r.badges })
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  })
}

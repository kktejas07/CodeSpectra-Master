import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/api-auth'
import { hackathons, hackathonTeams, hackathonSubmissions } from '@/lib/db/qr-events'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  const col = await hackathons()
  const hk = await col.findOne({ $or: [{ id }, { slug: id }] })
  if (!hk) return NextResponse.json({ error: 'not found' }, { status: 404 })

  // Check leaderboard visibility
  const visibility = hk.features?.leaderboard_visibility || 'public'
  if (visibility === 'private') {
    const user = await getAPIUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const isAdmin = ['superadmin', 'admin', 'tenant_admin'].includes((user.role || '').toLowerCase())
    const isJudge = (hk.judges || []).includes(user.id)
    if (!isAdmin && !isJudge) {
      return NextResponse.json({ error: 'Leaderboard is private' }, { status: 403 })
    }
  }

  if (visibility === 'after_event') {
    const now = Date.now()
    const ends = new Date(hk.ends_at).getTime()
    if (now < ends && !hk.results_released) {
      const user = await getAPIUser()
      if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      const isAdmin = ['superadmin', 'admin', 'tenant_admin'].includes((user.role || '').toLowerCase())
      if (!isAdmin) {
        return NextResponse.json({ error: 'Leaderboard will be available after the event ends' }, { status: 403 })
      }
    }
  }

  const teamsCol = await hackathonTeams()
  const teams = await teamsCol
    .find({ hackathon_id: hk.id })
    .sort({ xp: -1 })
    .toArray()

  const subsCol = await hackathonSubmissions()
  const teamIds = teams.map(t => t.id)
  const subs = await subsCol.find({ hackathon_id: hk.id, team_id: { $in: teamIds } }).toArray()

  const subCountByTeam = new Map<string, number>()
  const scoreByTeam = new Map<string, number>()
  for (const s of subs) {
    subCountByTeam.set(s.team_id, (subCountByTeam.get(s.team_id) || 0) + 1)
    if (s.score != null) {
      scoreByTeam.set(s.team_id, (scoreByTeam.get(s.team_id) || 0) + s.score)
    }
  }

  const leaderboard = teams.map((t, i) => ({
    rank: i + 1,
    team_id: t.id,
    team_name: t.name,
    xp: t.xp,
    level: t.level,
    submissions: subCountByTeam.get(t.id) || 0,
    total_score: scoreByTeam.get(t.id) || 0,
    members: t.members.map(m => m.name),
    achievements: t.achievements?.length || 0,
  }))

  return NextResponse.json({ items: leaderboard })
}

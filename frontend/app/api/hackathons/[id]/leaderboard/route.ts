import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/api-auth'
import { hackathons, hackathonTeams, hackathonSubmissions } from '@/lib/db/qr-events'
import { isHackathonStaff, isHackathonJudge, hasEnded } from '@/lib/hackathons/access'
import { rankTeams, withFinalPoints } from '@/lib/hackathons/final-scores'
import { sanitizeJudgingConfig } from '@/lib/hackathons/judge-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  const col = await hackathons()
  const hk = await col.findOne({ $or: [{ id }, { slug: id }] })
  if (!hk) return NextResponse.json({ error: 'not found', code: 'not_found' }, { status: 404 })

  const user = await getAPIUser().catch(() => null)
  const isStaff = isHackathonStaff(user, hk)
  const isJudge = isHackathonJudge(user, hk)
  if (hk.status === 'draft' && !isStaff) return NextResponse.json({ error: 'not found', code: 'not_found' }, { status: 404 })

  // Check leaderboard visibility
  const visibility = hk.features?.leaderboard_visibility || 'public'
  if (visibility === 'private' && !isStaff && !isJudge) {
    if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })
    return NextResponse.json({ error: 'Leaderboard is private' }, { status: 403 })
  }
  if (visibility === 'after_event' && !hasEnded(hk) && !hk.results_released && !isStaff) {
    if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })
    return NextResponse.json({ error: 'Leaderboard will be available after the event ends' }, { status: 403 })
  }

  const teamsCol = await hackathonTeams()
  const teams = await teamsCol.find({ hackathon_id: hk.id }).sort({ created_at: 1 }).toArray()

  const subsCol = await hackathonSubmissions()
  const cfg = sanitizeJudgingConfig(hk.judging_config)
  const subs = withFinalPoints(
    await subsCol.find({ hackathon_id: hk.id }, { projection: { team_id: 1, problem_slug: 1, status: 1, final_points: 1, score: 1, max_score: 1, scores: 1, rubric_scores: 1, auto_score: 1 } }).toArray(),
    cfg,
  )
  const subCountByTeam = new Map<string, number>()
  for (const s of subs) subCountByTeam.set(s.team_id, (subCountByTeam.get(s.team_id) || 0) + 1)

  // Scores (and so ranks) only exist once results are released; before that
  // the board lists teams and their activity. Ranks come from judged totals
  // with shared ranks on ties — the same numbers as the results page.
  const released = !!hk.results_released
  const standings = released ? rankTeams(teams.map((t) => t.id), subs.filter((s) => s.status === 'released'), cfg) : []
  const standingOf = new Map(standings.map((st) => [st.team_id, st]))
  const order = released ? standings.map((st) => st.team_id) : teams.map((t) => t.id)
  const teamById = new Map(teams.map((t) => [t.id, t]))

  const leaderboard = order.map((tid) => {
    const t = teamById.get(tid)!
    const st = standingOf.get(tid)
    return {
      rank: st?.rank ?? null,
      tied: st?.tied ?? false,
      advancing: st?.advancing ?? false,
      team_id: t.id,
      team_name: t.name,
      xp: t.xp,
      level: t.level,
      submissions: subCountByTeam.get(t.id) || 0,
      total_score: st?.total ?? null,
      members: (t.members || []).map((m) => m.name),
      achievements: t.achievements?.length || 0,
    }
  })

  return NextResponse.json({ items: leaderboard, released })
}

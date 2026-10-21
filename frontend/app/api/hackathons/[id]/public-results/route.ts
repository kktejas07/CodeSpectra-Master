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
import { hackathons, hackathonTeams, hackathonSubmissions, newToken } from '@/lib/db/qr-events'
import { rankTeams, withFinalPoints } from '@/lib/hackathons/final-scores'
import { sanitizeJudgingConfig } from '@/lib/hackathons/judge-config'
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
  const hk = await (await hackathons()).findOne(
    { $or: [{ id }, { slug: id }] },
    { projection: { _id: 0 } },
  )
  if (!hk || hk.status === 'draft') {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  const cfg = sanitizeJudgingConfig(hk.judging_config)
  const hackathon = {
    id: hk.id,
    name: hk.name,
    slug: hk.slug,
    description: hk.description,
    num_teams: hk.num_teams,
    results_released: !!hk.results_released,
    released_at: hk.released_at,
    ends_at: hk.ends_at,
    display_count: cfg.displayCount,
    advance_top_n: cfg.advanceTopN,
    certificates: hk.features ? hk.features.certificates !== false : true,
    tasks: (hk.tasks || []).map((t) => ({
      problem_slug: t.problem_slug,
      problem_title: t.problem_title,
      points: t.points,
      difficulty: t.difficulty,
    })),
  }

  if (!hk.results_released) {
    return NextResponse.json({ hackathon, teams: [], submissions: [], my_team_id: null })
  }

  const teamsCol = await hackathonTeams()
  const teamRows = await teamsCol.find({ hackathon_id: hk.id }, { projection: { _id: 0 } }).toArray()
  const subRows = withFinalPoints(await (await hackathonSubmissions())
    .find({ hackathon_id: hk.id, status: 'released' }, { projection: { _id: 0 } })
    .toArray(), cfg)

  // Rank on judged totals (stored per submission at release), never XP.
  const standings = rankTeams(teamRows.map((t) => t.id), subRows, cfg)
  const teamById = new Map(teamRows.map((t) => [t.id, t]))

  let myTeamId: string | null = null
  const teams = []
  for (const st of standings) {
    const t = teamById.get(st.team_id)
    if (!t) continue
    const isMine = !!user && (t.members || []).some((m) => m.user_id === user.id)
    let verifyToken: string | undefined
    if (isMine) {
      myTeamId = t.id
      // Certificate verify token — separate from the team's join secret (qr_token).
      verifyToken = (t as { verify_token?: string }).verify_token
      if (!verifyToken) {
        verifyToken = newToken()
        await teamsCol.updateOne({ id: t.id, verify_token: { $exists: false } } as Record<string, unknown>, { $set: { verify_token: verifyToken } as Record<string, unknown> })
        const fresh = await teamsCol.findOne({ id: t.id }, { projection: { verify_token: 1 } })
        verifyToken = (fresh as { verify_token?: string } | null)?.verify_token || verifyToken
      }
    }
    teams.push({
      id: t.id,
      name: t.name,
      slug: t.slug,
      xp: t.xp,
      level: t.level,
      total: st.total,
      rank: st.rank,
      tied: st.tied,
      advancing: st.advancing,
      submissions: t.submissions,
      members: (t.members || []).map((m) => ({ name: m.name, role: m.role })),
      achievements: (t.achievements || []).map((a) => ({ id: a.id, name: a.name })),
      ...(isMine ? { verify_token: verifyToken } : {}),
    })
  }

  const submissions = subRows.map((s) => ({
    id: s.id,
    team_id: s.team_id,
    problem_slug: s.problem_slug,
    score: typeof s.final_points === 'number' ? s.final_points : null,
    max_score: s.max_score,
    status: s.status,
    submitted_at: s.submitted_at,
    ...(myTeamId && s.team_id === myTeamId ? { feedback: s.feedback } : {}),
  }))

  return NextResponse.json({ hackathon, teams, submissions, my_team_id: myTeamId })
}

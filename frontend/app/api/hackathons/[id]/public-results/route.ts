/**
 * GET /api/hackathons/[id]/public-results
 *
 * Public, read-only view of a hackathon's final results. Works for signed-out
 * visitors, but only once the organiser has released results
 * (`results_released === true`). Before that it returns 403 so unreleased
 * scores never leave the server.
 *
 * What's exposed: event summary, team name/xp/level/member display names,
 * and released submissions (score only — no code, repo, judge records or
 * feedback). The viewer's own team additionally gets its `qr_token` (used
 * for the certificate verify link) and its own feedback, matching what the
 * members-only `/teams` and `/submissions` routes already give them.
 *
 * The `id` segment accepts the hackathon id or slug.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/api-auth'
import { hackathons, hackathonTeams, hackathonSubmissions } from '@/lib/db/qr-events'
import { rateLimitSlidingWindow, clientLimiterKeyFromRequest } from '@/lib/in-memory-rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAPIUser().catch(() => null)
  const rl = rateLimitSlidingWindow(
    `hk-public-results:${clientLimiterKeyFromRequest(req, user?.id ?? null)}`,
    60,
    60_000,
  )
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many requests' },
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

  const hackathon = {
    id: hk.id,
    name: hk.name,
    slug: hk.slug,
    description: hk.description,
    num_teams: hk.num_teams,
    results_released: !!hk.results_released,
    released_at: hk.released_at,
    ends_at: hk.ends_at,
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

  const teamRows = await (await hackathonTeams())
    .find({ hackathon_id: hk.id }, { projection: { _id: 0 } })
    .sort({ xp: -1, created_at: 1 })
    .toArray()

  let myTeamId: string | null = null
  const teams = teamRows.map((t) => {
    const isMine = !!user && (t.members || []).some((m) => m.user_id === user.id)
    if (isMine) myTeamId = t.id
    return {
      id: t.id,
      name: t.name,
      slug: t.slug,
      xp: t.xp,
      level: t.level,
      submissions: t.submissions,
      members: (t.members || []).map((m) => ({ name: m.name, role: m.role })),
      achievements: (t.achievements || []).map((a) => ({ id: a.id, name: a.name })),
      ...(isMine ? { qr_token: t.qr_token } : {}),
    }
  })

  const subRows = await (await hackathonSubmissions())
    .find({ hackathon_id: hk.id, status: 'released' }, { projection: { _id: 0 } })
    .toArray()
  const submissions = subRows.map((s) => ({
    id: s.id,
    team_id: s.team_id,
    problem_slug: s.problem_slug,
    score: s.score,
    max_score: s.max_score,
    status: s.status,
    submitted_at: s.submitted_at,
    ...(myTeamId && s.team_id === myTeamId ? { feedback: s.feedback } : {}),
  }))

  return NextResponse.json({ hackathon, teams, submissions, my_team_id: myTeamId })
}

import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/api-auth'
import { hackathonSubmissions, hackathons, hackathonTeams, nowIso, xpToLevel } from '@/lib/db/qr-events'
import { awardXp } from '@/lib/db/leaderboard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SCORE_TO_XP_RATIO = 1

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; submissionId: string }> },
) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, submissionId } = await ctx.params
  const hkCol = await hackathons()
  const hk = await hkCol.findOne({ $or: [{ id }, { slug: id }] })
  if (!hk) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const subsCol = await hackathonSubmissions()
  const sub = await subsCol.findOne({ id: submissionId, hackathon_id: hk.id })
  if (!sub) return NextResponse.json({ error: 'submission not found' }, { status: 404 })

  const isAdmin = ['superadmin', 'tenant_admin'].includes((user.role || '').toLowerCase())
  const isJudge = (hk.judges || []).includes(user.id)
  const team = await (await hackathonTeams()).findOne({ hackathon_id: hk.id, id: sub.team_id, 'members.user_id': user.id })

  if (!isAdmin && !isJudge && !team) {
    if (hk.results_released) {
      const { code, repo_url, commit_sha, ...safe } = sub
      return NextResponse.json(safe)
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.json(sub)
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; submissionId: string }> },
) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, submissionId } = await ctx.params
  const col = await hackathons()
  const hk = await col.findOne({ $or: [{ id }, { slug: id }] })
  if (!hk) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const isAdmin = ['superadmin', 'tenant_admin'].includes((user.role || '').toLowerCase())
  const isJudge = (hk.judges || []).includes(user.id)
  if (!isAdmin && !isJudge) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { score?: number; feedback?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  if (body.score == null || typeof body.score !== 'number') {
    return NextResponse.json({ error: 'score required' }, { status: 400 })
  }

  const score = Math.min(100, Math.max(0, Math.round(body.score)))
  const feedback = (body.feedback || '').trim()
  const now = nowIso()

  const subsCol = await hackathonSubmissions()
  const sub = await subsCol.findOne({ id: submissionId, hackathon_id: hk.id })
  if (!sub) return NextResponse.json({ error: 'submission not found' }, { status: 404 })

  const $set: Record<string, unknown> = {
    score,
    feedback,
    reviewed_at: now,
  }
  if (sub.status === 'pending') {
    $set.status = isAdmin ? 'released' : 'under_review'
  }

  const scoreEntry = {
    judge_id: user.id,
    score,
    feedback,
    created_at: now,
  }

  await subsCol.updateOne(
    { id: submissionId },
    { $set, $push: { scores: scoreEntry } },
  )

  // Grant XP to the team based on judge's score (first-time scoring only)
  try {
    const prevScore = sub.score
    if (prevScore == null) {
      const xpEarned = Math.round(score * SCORE_TO_XP_RATIO)
      const teamsCol = await hackathonTeams()
      const team = await teamsCol.findOne({ id: sub.team_id })
      if (team) {
        const newXp = team.xp + xpEarned
        await teamsCol.updateOne(
          { id: team.id },
          { $set: { xp: newXp, level: xpToLevel(newXp), updated_at: now } },
        )
        // Award individual XP to each team member for the global leaderboard
        for (const m of team.members || []) {
          await awardXp({
            userId: m.user_id,
            amount: xpEarned,
            reason: 'hackathon_score',
            problemId: sub.problem_slug,
            submissionId: submissionId,
            metadata: { hackathon_id: id, team_id: sub.team_id },
          }).catch(() => {})
        }
      }
    }
  } catch { /* XP grant is best-effort — don't fail scoring if XP update fails */ }

  return NextResponse.json({ ok: true })
}

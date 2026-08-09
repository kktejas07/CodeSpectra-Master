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

  // tenant_admin can only view submissions for their own tenant's hackathon
  if (user.role === 'tenant_admin' && user.tenantId && hk.tenant_id !== user.tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

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

  // tenant_admin can only grade submissions for their own tenant's hackathon
  if (user.role === 'tenant_admin' && user.tenantId && hk.tenant_id !== user.tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const isAdmin = ['superadmin', 'tenant_admin'].includes((user.role || '').toLowerCase())
  const isJudge = (hk.judges || []).includes(user.id)

  const subsCol = await hackathonSubmissions()
  const sub = await subsCol.findOne({ id: submissionId, hackathon_id: hk.id })
  if (!sub) return NextResponse.json({ error: 'submission not found' }, { status: 404 })

  const teamsCol = await hackathonTeams()
  const team = await teamsCol.findOne({ id: sub.team_id })
  const isTeamMember = team?.members?.some((m) => m.user_id === user.id) ?? false

  if (!isAdmin && !isJudge && !isTeamMember) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const isTeamResubmit = isTeamMember && !isAdmin && !isJudge

  let body: { score?: number; feedback?: string; status?: string; repo_url?: string; video_url?: string; live_url?: string; comment?: string; resubmit_reason?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  const subUpdate: Record<string, unknown> = { updated_at: nowIso() }
  if (!isTeamResubmit && body.status && ['pending', 'under_review', 'released'].includes(body.status)) {
    subUpdate.status = body.status
  }
  if (body.repo_url) subUpdate.repo_url = body.repo_url.trim()
  if (body.video_url) subUpdate.video_url = body.video_url.trim()
  if (body.live_url) subUpdate.live_url = body.live_url.trim()
  if (body.comment) subUpdate.comment = body.comment.trim()
  if (body.resubmit_reason) subUpdate.resubmit_reason = body.resubmit_reason.trim()

  if (!isTeamResubmit && body.score != null && typeof body.score === 'number') {
    const score = Math.min(100, Math.max(0, Math.round(body.score)))
    const feedback = (body.feedback || '').trim()
    subUpdate.score = score
    subUpdate.feedback = feedback
    subUpdate.reviewed_at = nowIso()
  }

  const $set: Record<string, unknown> = { ...subUpdate }

  if (!isTeamResubmit) {
    const scoreEntry = {
      judge_id: user.id,
      score: subUpdate.score as number || 0,
      feedback: (subUpdate.feedback as string) || '',
      created_at: nowIso(),
    }
    await subsCol.updateOne(
      { id: submissionId },
      { $set, $push: { scores: scoreEntry } },
    )
  } else {
    await subsCol.updateOne({ id: submissionId }, { $set })
  }

  // Grant XP to the team based on judge's score (first-time scoring only)
  try {
    const prevScore = sub.score
    if (prevScore == null) {
      const xpEarned = Math.round((subUpdate.score as number || 0) * SCORE_TO_XP_RATIO)
      const teamsCol = await hackathonTeams()
      const team = await teamsCol.findOne({ id: sub.team_id })
      if (team) {
        const newXp = team.xp + xpEarned
        await teamsCol.updateOne(
          { id: team.id },
          { $set: { xp: newXp, level: xpToLevel(newXp), updated_at: nowIso() } },
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

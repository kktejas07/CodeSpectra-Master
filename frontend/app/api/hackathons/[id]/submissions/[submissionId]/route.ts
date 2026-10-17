import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/api-auth'
import { hackathonSubmissions, hackathons, hackathonTeams, nowIso } from '@/lib/db/qr-events'
import { notifySubmissionStatusChange } from '@/lib/notifications'
import { isHackathonStaff, isHackathonJudge } from '@/lib/hackathons/access'
import { gradeCode } from '@/lib/hackathons/grade'
import { judgeTotals, rubricTotal } from '@/lib/hackathons/final-scores'
import { average } from '@/lib/hackathons/calibration'
import { sanitizeJudgingConfig } from '@/lib/hackathons/judge-config'
import {
  normalizeSubmissionStatus, canTransition, statusAfterScore, teamCanEdit, buildStatusUpdate,
  type SubmissionStatus,
} from '@/lib/hackathons/submission-state'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

  const isStaff = isHackathonStaff(user, hk)
  const isJudge = isHackathonJudge(user, hk)
  const team = await (await hackathonTeams()).findOne({ hackathon_id: hk.id, id: sub.team_id, 'members.user_id': user.id })

  const { _id, device_info, ...rest } = sub as any
  void _id
  if (isStaff) return NextResponse.json({ ...rest, device_info })
  if (isJudge) return NextResponse.json(rest)
  // Team members and the public never see judge records; scores only after release.
  const { scores, rubric_scores, auto_score, ...pub } = rest
  void scores; void rubric_scores; void auto_score
  if (team) {
    return NextResponse.json(hk.results_released ? pub : { ...pub, score: null, feedback: undefined, final_score: undefined, final_points: undefined })
  }
  if (hk.results_released && normalizeSubmissionStatus(sub.status) === 'released') {
    const { code, repo_url, commit_sha, feedback, ...safe } = pub
    void code; void repo_url; void commit_sha; void feedback
    return NextResponse.json(safe)
  }
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
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

  const isStaff = isHackathonStaff(user, hk)
  const isJudge = isHackathonJudge(user, hk)

  const subsCol = await hackathonSubmissions()
  const sub = await subsCol.findOne({ id: submissionId, hackathon_id: hk.id })
  if (!sub) return NextResponse.json({ error: 'submission not found' }, { status: 404 })

  const teamsCol = await hackathonTeams()
  const team = await teamsCol.findOne({ id: sub.team_id, hackathon_id: hk.id })
  const isTeamMember = team?.members?.some((m) => m.user_id === user.id) ?? false

  if (!isStaff && !isJudge && !isTeamMember) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: Record<string, any>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })

  const current = normalizeSubmissionStatus(sub.status)
  if (hk.results_released || current === 'released') {
    return NextResponse.json({ error: 'Results are released; this submission is locked' }, { status: 409 })
  }
  const now = nowIso()
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined)

  // ── Team edit (resubmit) ────────────────────────────────────────────────
  if (isTeamMember && !isStaff && !isJudge) {
    const ends = new Date(hk.ends_at).getTime()
    const grace = hk.allow_late_submissions ? (hk.grace_period_minutes || 0) * 60000 : 0
    const withinTime = Number.isNaN(ends) || Date.now() <= ends + grace
    const open = (hk.status === 'live' || (hk.status === 'closed' && hk.allow_late_submissions)) && withinTime
    if (!open) return NextResponse.json({ error: 'submissions are closed' }, { status: 409 })
    if (!teamCanEdit(current)) return NextResponse.json({ error: 'This submission can no longer be edited' }, { status: 409 })

    const $set: Record<string, unknown> = { updated_at: now }
    for (const k of ['repo_url', 'video_url', 'live_url'] as const) {
      const v = str(body[k], 500)
      if (v !== undefined) {
        if (v && !/^https?:\/\//i.test(v)) return NextResponse.json({ error: `${k} must start with http(s)://` }, { status: 400 })
        $set[k] = v
      }
    }
    const comment = str(body.comment, 5000)
    if (comment !== undefined) $set.comment = comment
    const reason = str(body.resubmit_reason, 1000)
    if (reason) $set.resubmit_reason = reason

    const code = str(body.code, 200_000)
    let nextStatus: SubmissionStatus = current
    let sampleResults: unknown = undefined
    if (code) {
      $set.code = code
      $set.language = (str(body.language, 30) || (sub as any).language || 'python').toLowerCase()
      const task = (hk.tasks || []).find((t) => t.problem_slug === sub.problem_slug)
      const g = (hk.scoring as any)?.auto_grade !== false
        ? await gradeCode(sub.problem_slug, code, String($set.language), task?.points ?? sub.max_score).catch(() => null)
        : null
      $set.auto_graded = !!g
      $set.auto_score = g ? g.autoScore : null
      sampleResults = g?.sampleResults
      const judged = judgeTotals(sub as any).length > 0
      if (!judged) $set.score = g ? g.autoScore : null
      nextStatus = g || judged ? 'scored' : current === 'scored' ? 'submitted' : current
    }
    const repoAfter = ($set.repo_url ?? sub.repo_url) as string | undefined
    const codeAfter = ($set.code ?? sub.code) as string | undefined
    if (!repoAfter && !codeAfter) return NextResponse.json({ error: 'Add a GitHub repo URL or submit code' }, { status: 400 })

    const update = nextStatus !== current
      ? buildStatusUpdate(nextStatus, user.id, now, $set)
      : { $set }
    await subsCol.updateOne({ id: sub.id }, update)
    return NextResponse.json({ ok: true, status: nextStatus, test_results: sampleResults })
  }

  // ── Judge / staff ───────────────────────────────────────────────────────
  const cfg = sanitizeJudgingConfig((hk as any).judging_config)
  let scored = false
  const $set: Record<string, unknown> = { updated_at: now }

  if (body.rubric_scores && typeof body.rubric_scores === 'object') {
    const crit = Array.isArray(body.rubric_scores.criteria) ? body.rubric_scores.criteria.slice(0, 20) : []
    const total = rubricTotal(crit, hk.features?.rubric_criteria)
    if (total === null) return NextResponse.json({ error: 'This event has no rubric to score against' }, { status: 400 })
    const feedback = str(body.rubric_scores.feedback ?? body.feedback, 5000) || ''
    const prev = Array.isArray(sub.rubric_scores) ? sub.rubric_scores.filter((r) => r?.judge_id !== user.id) : []
    $set.rubric_scores = [...prev, {
      judge_id: user.id,
      criteria: crit.map((c: any) => ({ name: String(c?.name || '').slice(0, 80), score: Number(c?.score) || 0 })),
      total_score: total,
      feedback,
      created_at: now,
    }]
    $set.feedback = feedback
    scored = true
  } else if (typeof body.score === 'number' && Number.isFinite(body.score)) {
    const score = Math.min(100, Math.max(0, Math.round(body.score)))
    const feedback = str(body.feedback, 5000) || ''
    // One entry per judge: a re-score replaces the judge's earlier entry.
    const prev = Array.isArray(sub.scores) ? sub.scores.filter((r) => r?.judge_id !== user.id) : []
    $set.scores = [...prev, { judge_id: user.id, score, feedback, created_at: now }]
    $set.feedback = feedback
    scored = true
  }

  let nextStatus: SubmissionStatus = current
  let reason: string | undefined
  if (scored) {
    const after = statusAfterScore(current)
    if (!after) return NextResponse.json({ error: `A ${current} submission can't be scored` }, { status: 409 })
    nextStatus = after
    // sub.score = server-computed judge average (0–100), never the last judge's or the client's total.
    const merged = { ...sub, ...$set } as Record<string, unknown>
    const avg = average(judgeTotals(merged), { dropHighLow: cfg.dropHighLow })
    $set.score = avg
    $set.reviewed_at = now
  }

  if (typeof body.status === 'string' && body.status && normalizeSubmissionStatus(body.status) !== nextStatus) {
    const to = body.status === 'review_completed' || body.status === 'accepted' ? 'scored' : body.status
    if (!canTransition(nextStatus, to)) {
      return NextResponse.json({ error: `Cannot change status from ${nextStatus} to ${body.status}` }, { status: 409 })
    }
    if (to === 'scored' && !scored && judgeTotals(sub as any).length === 0 && typeof (sub as any).auto_score !== 'number') {
      return NextResponse.json({ error: 'Score the submission first' }, { status: 409 })
    }
    if (to === 'rejected') {
      reason = str(body.rejection_reason, 1000)
      if (!reason) return NextResponse.json({ error: 'Rejection reason is required' }, { status: 400 })
      $set.rejection_reason = reason
      $set.rejected_at = now
      $set.rejected_by = user.id
    }
    nextStatus = to as SubmissionStatus
    $set.reviewed_at = now
  }

  if (!scored && nextStatus === current) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const update = nextStatus !== current
    ? buildStatusUpdate(nextStatus, user.id, now, $set, reason)
    : { $set }
  await subsCol.updateOne({ id: sub.id }, update)

  // Notify on reviewer-visible moves only; scores stay private until release.
  if (nextStatus !== current && (nextStatus === 'under_review' || nextStatus === 'rejected') && team) {
    try {
      await notifySubmissionStatusChange(hk.id, hk.name, sub.id, sub.problem_slug, team.members, nextStatus, reason)
    } catch { /* notification is best-effort */ }
  }

  return NextResponse.json({ ok: true, status: nextStatus, score: $set.score ?? sub.score })
}

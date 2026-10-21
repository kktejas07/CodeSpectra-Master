import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { hackathons, hackathonTeams, hackathonSubmissions, newId, nowIso } from '@/lib/db/qr-events'
import { gradeCode } from '@/lib/hackathons/grade'
import { isHackathonStaff } from '@/lib/hackathons/access'
import type { SubmissionStatus } from '@/lib/hackathons/submission-state'
import { parseUserAgent } from '@/lib/db/sessions'
import { clientIpOrEmpty } from '@/lib/client-ip'
import { sanitizeMongoInput } from '@/lib/mongo-sanitize'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })
  const { id } = await ctx.params

  const hk = await (await hackathons()).findOne({ $or: [{ id }, { slug: id }] })
  if (!hk) return NextResponse.json({ error: 'event not found' }, { status: 404 })
  
  // Check if submissions are allowed (live event OR within grace period)
  const now = Date.now()
  const ends = new Date(hk.ends_at).getTime()
  const gracePeriod = (hk.grace_period_minutes || 0) * 60000
  // A 'live' status alone isn't enough: status only flips to closed when the
  // event is read or an admin closes it, so also enforce the clock.
  const withinTime = Number.isNaN(ends) || now <= ends + (hk.allow_late_submissions ? gracePeriod : 0)
  const canSubmit = (hk.status === 'live' && withinTime) || (hk.status === 'closed' && hk.allow_late_submissions && now <= ends + gracePeriod)
  
  if (!canSubmit || hk.results_released) {
    return NextResponse.json({ error: 'submissions are closed', code: 'contest_closed' }, { status: 409 })
  }

  const team = await (await hackathonTeams()).findOne({ hackathon_id: hk.id, 'members.user_id': user.id })
  if (!team) return NextResponse.json({ error: 'you are not on a team in this event' }, { status: 403 })

  const body = sanitizeMongoInput(await req.json().catch(() => ({}))) as {
    problem_slug?: string
    repo_url?: string
    commit_sha?: string
    code?: string
    language?: string
    video_url?: string
    live_url?: string
    comment?: string
  }

  if (!body.problem_slug) return NextResponse.json({ error: 'problem_slug required' }, { status: 400 })
  // A code problem submitted from the editor needs no repo; a project needs one.
  const repoUrl = typeof body.repo_url === 'string' ? body.repo_url.trim().slice(0, 500) : ''
  const hasCode = typeof body.code === 'string' && body.code.trim().length > 0
  if (!repoUrl && !hasCode) return NextResponse.json({ error: 'Add a GitHub repo URL or submit code' }, { status: 400 })
  if (repoUrl && !/^https?:\/\//i.test(repoUrl)) return NextResponse.json({ error: 'Repo URL must start with http(s)://' }, { status: 400 })
  const task = (hk.tasks || []).find((t) => t.problem_slug === body.problem_slug)
  if (!task) return NextResponse.json({ error: 'problem not assigned to this event' }, { status: 400 })

  // Enforce solve_limit if set
  if (hk.solve_limit && hk.solve_limit > 0) {
    const selected = team.selected_problems || []
    if (!selected.includes(body.problem_slug)) {
      if (selected.length < hk.solve_limit) {
        // Auto-select the problem since they haven't reached the limit
        selected.push(body.problem_slug)
        const teamsCol = await hackathonTeams()
        await teamsCol.updateOne(
          { id: team.id },
          { $set: { selected_problems: selected, updated_at: nowIso() } }
        )
      } else {
        return NextResponse.json({ error: `You have not selected this problem. You can only solve up to ${hk.solve_limit} problem(s).` }, { status: 403 })
      }
    }
  }

  // Speed contest: enforce per-problem time limit
  if ((hk as any).event_type === 'speed_contest') {
    const timeLimit = (task as any).time_limit_minutes || (hk as any).per_problem_time_minutes || 30
    const subsCol = await hackathonSubmissions()
    const firstSub = await subsCol.find({ team_id: team.id, problem_slug: body.problem_slug })
      .sort({ submitted_at: 1 })
      .limit(1)
      .toArray()
    if (firstSub.length > 0) {
      const elapsed = (Date.now() - new Date(firstSub[0].submitted_at).getTime()) / 60_000
      if (elapsed >= timeLimit) {
        return NextResponse.json({ error: `Time limit of ${timeLimit} minutes exceeded for this problem` }, { status: 409 })
      }
    }
  }

  const code = typeof body.code === 'string' ? body.code.trim().slice(0, 200_000) : ''
  const shouldAutoGrade = (hk.scoring as any)?.auto_grade !== false && !!code
  let autoScore: number | null = null
  let status: SubmissionStatus = 'submitted'
  let sampleResults: any[] | undefined = undefined
  let gradedCount = 0

  if (shouldAutoGrade) {
    try {
      const g = await gradeCode(body.problem_slug, code, body.language || 'python', task.points)
      if (g) {
        autoScore = g.autoScore
        gradedCount = g.testsRun
        sampleResults = g.sampleResults
        status = 'scored'
      }
    } catch { /* auto-grading failed, fall back to manual review */ }
  }

  const at = nowIso()
  const subDoc: any = {
    id: newId(),
    hackathon_id: hk.id,
    team_id: team.id,
    problem_slug: body.problem_slug,
    repo_url: repoUrl || undefined,
    commit_sha: typeof body.commit_sha === 'string' ? body.commit_sha.trim().slice(0, 80) : undefined,
    code: code || undefined,
    language: code ? (body.language || 'python').toLowerCase().slice(0, 30) : undefined,
    video_url: typeof body.video_url === 'string' ? body.video_url.trim().slice(0, 500) : undefined,
    live_url: typeof body.live_url === 'string' ? body.live_url.trim().slice(0, 500) : undefined,
    comment: typeof body.comment === 'string' ? body.comment.trim().slice(0, 5000) : undefined,
    // `score` is the judged/auto score shown after release; judges overwrite it
    // with their average. The raw auto-grade is kept separately.
    score: autoScore,
    auto_graded: autoScore !== null,
    auto_score: autoScore,
    max_score: task.points,
    status,
    status_history: [{ status, changed_by: user.id, changed_at: at }],
    submitted_at: at,
    created_at: at,
    device_info: { ua: req.headers.get('user-agent') || '', ...parseUserAgent(req.headers.get('user-agent') || ''), ip: clientIpOrEmpty(req) },
  }

  await (await hackathonSubmissions()).insertOne(subDoc)
  const teamsCol = await hackathonTeams()
  await teamsCol.updateOne({ id: team.id }, { $inc: { submissions: 1 } })
  // ponytail: XP is granted once, at release, from the final judged score
  // (release-results) — never here, so nothing leaks or double-counts.

  return NextResponse.json({
    ok: true,
    id: subDoc.id,
    status,
    // Scores stay hidden until results are released; sample results are the
    // only test output a team sees.
    score: null,
    max_score: task.points,
    test_results: sampleResults,
    tests_run: gradedCount,
    auto_graded: autoScore !== null,
    grading_error: shouldAutoGrade && autoScore === null ? 'Auto-grading is unavailable for this problem; a judge will review it' : null,
  }, { status: 201 })
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })
  const { id } = await ctx.params

  const hk = await (await hackathons()).findOne({ $or: [{ id }, { slug: id }] })
  if (!hk) return NextResponse.json({ error: 'event not found' }, { status: 404 })

  // Staff = superadmin or this event's own tenant admin (E9).
  const isStaff = isHackathonStaff(user, hk)
  const team = await (await hackathonTeams()).findOne({ hackathon_id: hk.id, 'members.user_id': user.id })

  if (!isStaff && !team) {
    return NextResponse.json({ error: 'Forbidden', code: 'forbidden' }, { status: 403 })
  }

  const queryTeamId = req.nextUrl.searchParams.get('team_id')
  const teamId = isStaff ? (queryTeamId || team?.id) : team!.id

  const filter: Record<string, unknown> = { hackathon_id: hk.id }
  if (teamId) filter.team_id = teamId

  const items = await (await hackathonSubmissions())
    .find(filter, { projection: { _id: 0 } })
    .sort({ submitted_at: -1 })
    .toArray()

  const result = items.map((s) => {
    if (isStaff) return s
    // Team view: no judge records, device info or unreleased scores.
    const { device_info, scores, rubric_scores, auto_score, final_score, final_points, human_avg, ...rest } = s as any
    void device_info; void scores; void rubric_scores; void auto_score; void final_score; void final_points; void human_avg
    const released = !!hk.results_released
    return {
      ...rest,
      score: released ? (s as any).final_points ?? s.score : null,
      feedback: released ? s.feedback : undefined,
    }
  })

  return NextResponse.json({ items: result })
}

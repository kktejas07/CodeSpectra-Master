import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { hackathons, hackathonTeams, hackathonSubmissions, newId, nowIso, xpToLevel } from '@/lib/db/qr-events'
import { problems } from '@/lib/db/problems'
import { executeOnce } from '@/lib/piston'
import { awardXp } from '@/lib/db/leaderboard'
import { parseUserAgent } from '@/lib/db/sessions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params

  const hk = await (await hackathons()).findOne({ $or: [{ id }, { slug: id }] })
  if (!hk) return NextResponse.json({ error: 'event not found' }, { status: 404 })
  
  // Check if submissions are allowed (live event OR within grace period)
  const now = Date.now()
  const ends = new Date(hk.ends_at).getTime()
  const gracePeriod = (hk.grace_period_minutes || 0) * 60000
  const canSubmit = hk.status === 'live' || (hk.status === 'closed' && hk.allow_late_submissions && now <= ends + gracePeriod)
  
  if (!canSubmit) {
    return NextResponse.json({ error: 'submissions are closed' }, { status: 409 })
  }

  const team = await (await hackathonTeams()).findOne({ hackathon_id: hk.id, 'members.user_id': user.id })
  if (!team) return NextResponse.json({ error: 'you are not on a team in this event' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as {
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
  if (!body.repo_url || !body.repo_url.trim()) return NextResponse.json({ error: 'GitHub repo URL is required' }, { status: 400 })
  const task = (hk.tasks || []).find((t) => t.problem_slug === body.problem_slug)
  if (!task) return NextResponse.json({ error: 'problem not assigned to this event' }, { status: 400 })

  // Enforce solve_limit if set
  if (hk.solve_limit && hk.solve_limit > 0) {
    const selected = team.selected_problems || []
    if (!selected.includes(body.problem_slug)) {
      return NextResponse.json({ error: `You have not selected this problem. You can only solve up to ${hk.solve_limit} problem(s).` }, { status: 403 })
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

  const shouldAutoGrade = (hk.scoring as any)?.auto_grade !== false && body.code?.trim()
  let score: number | null = null
  let status = 'pending'
  let testResults: any[] | undefined = undefined

  if (shouldAutoGrade) {
    const lang = (body.language || 'python').toLowerCase()
    try {
      const pCol = await problems()
      const problem = await pCol.findOne({ slug: body.problem_slug })
      const tests = (problem?.test_cases || []).filter((t: any) => t.is_sample)

      if (tests.length > 0) {
        let passed = 0
        const results: any[] = []
        for (const tc of tests) {
          try {
            const piston = await executeOnce({
              language: lang,
              source: body.code!,
              stdin: tc.stdin,
              timeoutMs: 10000,
            })
            const actual = (piston.run.stdout || '').trim()
            const expected = (tc.expected_stdout || '').trim()
            const ok = actual === expected
            if (ok) passed++
            results.push({ passed: ok, input: tc.stdin, expected: tc.expected_stdout, stdout: piston.run.stdout || '' })
          } catch { results.push({ passed: false, input: tc.stdin, expected: tc.expected_stdout, error: 'execution failed' }) }
        }
        score = tests.length > 0 ? Math.round((passed / tests.length) * task.points) : null
        status = score !== null && score >= task.points * 0.5 ? 'released' : 'under_review'
        testResults = results
      }
    } catch { /* auto-grading failed, fall back to manual review */ }
  }

  const subDoc: any = {
    id: newId(),
    hackathon_id: hk.id,
    team_id: team.id,
    problem_slug: body.problem_slug,
    repo_url: body.repo_url?.trim(),
    commit_sha: body.commit_sha?.trim(),
    code: body.code?.trim(),
    video_url: body.video_url?.trim(),
    live_url: body.live_url?.trim(),
    comment: body.comment?.trim(),
    score,
    max_score: task.points,
    status,
    submitted_at: nowIso(),
    created_at: nowIso(),
    device_info: { ua: req.headers.get('user-agent') || '', ...parseUserAgent(req.headers.get('user-agent') || ''), ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || '' },
  }

  await (await hackathonSubmissions()).insertOne(subDoc)
  const teamsCol = await hackathonTeams()
  await teamsCol.updateOne({ id: team.id }, { $inc: { submissions: 1 } })

  // If auto-graded and scored, grant XP once per problem
  if (score && score > 0) {
    try {
      const subsCol = await hackathonSubmissions()
      const prior = await subsCol.findOne({
        team_id: team.id,
        problem_slug: body.problem_slug,
        score: { $gt: 0 },
        _id: { $ne: subDoc._id },
      } as any)
      if (!prior) {
        const xpEarned = score
        const teamDoc = await teamsCol.findOne({ id: team.id })
        if (teamDoc) {
          const newXp = teamDoc.xp + xpEarned
          await teamsCol.updateOne(
            { id: team.id },
            { $set: { xp: newXp, updated_at: nowIso() } },
          )
        }
        // Award individual XP to each team member for the global leaderboard
        for (const m of team.members || []) {
          await awardXp({
            userId: m.user_id,
            amount: xpEarned,
            reason: 'hackathon_score',
            problemId: body.problem_slug,
            submissionId: subDoc.id,
            metadata: { hackathon_id: hk.id, team_id: team.id },
          }).catch(() => {})
        }
      }
    } catch { /* XP best-effort */ }
  }

  return NextResponse.json({
    ok: true,
    status,
    score,
    max_score: task.points,
    test_results: testResults,
    auto_graded: shouldAutoGrade && testResults ? true : false,
    grading_error: shouldAutoGrade && !testResults ? 'No sample test cases available for auto-grading' : null,
  }, { status: 201 })
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params

  const hk = await (await hackathons()).findOne({ $or: [{ id }, { slug: id }] })
  if (!hk) return NextResponse.json({ error: 'event not found' }, { status: 404 })

  const isAdmin = ['superadmin', 'tenant_admin'].includes((user.role || '').toLowerCase())
  const team = await (await hackathonTeams()).findOne({ hackathon_id: hk.id, 'members.user_id': user.id })

  if (!isAdmin && !team) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const queryTeamId = req.nextUrl.searchParams.get('team_id')
  const teamId = isAdmin ? (queryTeamId || team?.id) : team!.id

  const filter: Record<string, unknown> = { hackathon_id: hk.id }
  if (teamId) filter.team_id = teamId

  const items = await (await hackathonSubmissions())
    .find(filter)
    .sort({ submitted_at: -1 })
    .toArray()

  const result = items.map((s) => {
    const masked = { ...s, score: null as number | null }
    if (isAdmin || hk.results_released) {
      masked.score = s.score
    }
    return masked
  })

  return NextResponse.json({ items: result })
}

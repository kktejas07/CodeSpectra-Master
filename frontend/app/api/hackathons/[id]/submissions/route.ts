import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { hackathons, hackathonTeams, hackathonSubmissions, newId, nowIso, xpToLevel } from '@/lib/db/qr-events'
import { problems } from '@/lib/db/problems'
import { executeOnce } from '@/lib/piston'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params

  const hk = await (await hackathons()).findOne({ $or: [{ id }, { slug: id }] })
  if (!hk) return NextResponse.json({ error: 'event not found' }, { status: 404 })
  if (hk.status === 'closed') return NextResponse.json({ error: 'event closed' }, { status: 409 })

  const team = await (await hackathonTeams()).findOne({ hackathon_id: hk.id, 'members.user_id': user.id })
  if (!team) return NextResponse.json({ error: 'you are not on a team in this event' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as {
    problem_slug?: string
    repo_url?: string
    commit_sha?: string
    code?: string
    language?: string
  }

  if (!body.problem_slug) return NextResponse.json({ error: 'problem_slug required' }, { status: 400 })
  const task = (hk.tasks || []).find((t) => t.problem_slug === body.problem_slug)
  if (!task) return NextResponse.json({ error: 'problem not assigned to this event' }, { status: 400 })

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
    score,
    max_score: task.points,
    status,
    submitted_at: nowIso(),
    created_at: nowIso(),
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

  const isAdmin = ['superadmin', 'admin', 'tenant_admin'].includes((user.role || '').toLowerCase())
  const team = await (await hackathonTeams()).findOne({ hackathon_id: hk.id, 'members.user_id': user.id })

  // SECURITY: Only allow filtering by the user's own team. Admins can bypass.
  const queryTeamId = req.nextUrl.searchParams.get('team_id')
  const teamId = isAdmin ? (queryTeamId || team?.id) : (team?.id || '')

  const filter: Record<string, unknown> = { hackathon_id: hk.id }
  if (teamId) filter.team_id = teamId

  const items = await (await hackathonSubmissions())
    .find(filter, { projection: { code: 0 } })
    .sort({ submitted_at: -1 })
    .toArray()

  // Admins always see everything. During an active event, teams can see their
  // own submissions (status, timestamps) but NOT scores until results are released.
  const userIsOnTeam = Boolean(team)
  const showFullDetails = (isAdmin || hk.results_released || userIsOnTeam)
  const result = showFullDetails
    ? items
    : items.map((s) => ({ ...s, score: s.status === 'released' ? s.score : null }))

  return NextResponse.json({ items: result })
}

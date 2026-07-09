import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { hackathons, hackathonTeams, hackathonSubmissions, newId, nowIso } from '@/lib/db/qr-events'

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
  }

  if (!body.problem_slug) return NextResponse.json({ error: 'problem_slug required' }, { status: 400 })
  const task = (hk.tasks || []).find((t) => t.problem_slug === body.problem_slug)
  if (!task) return NextResponse.json({ error: 'problem not assigned to this event' }, { status: 400 })

  const col = await hackathonSubmissions()
  await col.insertOne({
    id: newId(),
    hackathon_id: hk.id,
    team_id: team.id,
    problem_slug: body.problem_slug,
    repo_url: body.repo_url?.trim(),
    commit_sha: body.commit_sha?.trim(),
    code: body.code?.trim(),
    score: null,
    max_score: task.points,
    status: 'pending',
    submitted_at: nowIso(),
    created_at: nowIso(),
  })

  await (await hackathonTeams()).updateOne({ id: team.id }, { $inc: { submissions: 1 } })

  return NextResponse.json({ ok: true, status: 'pending' }, { status: 201 })
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params

  const hk = await (await hackathons()).findOne({ $or: [{ id }, { slug: id }] })
  if (!hk) return NextResponse.json({ error: 'event not found' }, { status: 404 })

  const isAdmin = ['superadmin', 'admin', 'tenant_admin'].includes((user.role || '').toLowerCase())
  const team = await (await hackathonTeams()).findOne({ hackathon_id: hk.id, 'members.user_id': user.id })
  const teamId = team?.id || req.nextUrl.searchParams.get('team_id') || ''

  const filter: Record<string, unknown> = { hackathon_id: hk.id }
  if (teamId) filter.team_id = teamId

  const items = await (await hackathonSubmissions())
    .find(filter, { projection: { code: 0 } })
    .sort({ submitted_at: -1 })
    .toArray()

  // Non-admins can only see released scores
  const result = isAdmin || hk.results_released
    ? items
    : items.map((s) => ({ ...s, score: s.status === 'released' ? s.score : null }))

  return NextResponse.json({ items: result })
}

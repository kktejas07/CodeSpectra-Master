import { NextRequest, NextResponse } from 'next/server'
import { isHackathonStaff } from '@/lib/hackathons/access'
import { getAPIUser } from '@/lib/route-auth'
import { hackathons, hackathonTeams, nowIso } from '@/lib/db/qr-events'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; teamId: string }> }) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, teamId } = await ctx.params

  const hk = await (await hackathons()).findOne({ $or: [{ id }, { slug: id }] })
  if (!hk) return NextResponse.json({ error: 'event not found' }, { status: 404 })

  const team = await (await hackathonTeams()).findOne({ id: teamId, hackathon_id: hk.id })
  if (!team) return NextResponse.json({ error: 'team not found' }, { status: 404 })

  // Verify user is on the team or is an admin
  const isMember = team.members.some((m) => m.user_id === user.id)
  if (!isMember && !isHackathonStaff(user, hk)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({})) as { problem_slug?: string }
  if (!body.problem_slug) return NextResponse.json({ error: 'problem_slug required' }, { status: 400 })

  const task = (hk.tasks || []).find((t) => t.problem_slug === body.problem_slug)
  if (!task) return NextResponse.json({ error: 'problem not assigned to this event' }, { status: 400 })

  const selected = team.selected_problems || []

  // Check if already selected
  if (selected.includes(body.problem_slug)) {
    return NextResponse.json({ ok: true, selected_problems: selected }, { status: 200 })
  }

  // Check limit
  const limit = hk.solve_limit || 0
  if (limit > 0 && selected.length >= limit) {
    return NextResponse.json({ error: `You have reached the solve limit of ${limit} problem(s).` }, { status: 409 })
  }

  const updatedSelected = [...selected, body.problem_slug]
  await (await hackathonTeams()).updateOne(
    { id: team.id },
    { $set: { selected_problems: updatedSelected, updated_at: nowIso() } }
  )

  return NextResponse.json({ ok: true, selected_problems: updatedSelected }, { status: 200 })
}

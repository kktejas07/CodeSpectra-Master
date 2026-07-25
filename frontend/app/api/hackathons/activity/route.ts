import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { hackathons, hackathonActivity, HackathonActivityDoc, newId, nowIso } from '@/lib/db/qr-events'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const type = typeof body?.type === 'string' ? body.type : null
  const hackathonId = typeof body?.hackathon_id === 'string' ? body.hackathon_id : null

  if (!type || !hackathonId) {
    return NextResponse.json({ error: 'type and hackathon_id are required' }, { status: 400 })
  }

  const validTypes = ['problem_started', 'problem_claimed', 'problem_released', 'problem_submitted', 'problem_viewed', 'leaderboard_viewed', 'workspace_entered', 'workspace_left']
  if (!validTypes.includes(type)) {
    return NextResponse.json({ error: 'Invalid activity type' }, { status: 400 })
  }

  const hk = await (await hackathons()).findOne({ $or: [{ id: hackathonId }, { slug: hackathonId }] })
  if (!hk) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  const teamsCol = await import('@/lib/db/qr-events').then(m => m.hackathonTeams())
  const team = await teamsCol.findOne({ hackathon_id: hk.id, 'members.user_id': user.id })
  if (!team) return NextResponse.json({ error: 'You are not on a team for this event' }, { status: 403 })

  const activityCol = await hackathonActivity()
  const doc: HackathonActivityDoc = {
    id: newId(),
    hackathon_id: hk.id,
    team_id: team.id,
    user_id: user.id,
    type,
    problem_slug: typeof body?.problem_slug === 'string' ? body.problem_slug : undefined,
    meta: typeof body?.meta === 'object' && body.meta !== null ? body.meta : undefined,
    created_at: nowIso(),
  }

  await activityCol.insertOne(doc)
  return NextResponse.json({ ok: true })
}
import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { hackathons, hackathonTeams, hackathonActivity, hackathonProctorEvents } from '@/lib/db/qr-events'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params

  const hk = await (await hackathons()).findOne({ $or: [{ id }, { slug: id }] })
  if (!hk) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  const teamsCol = await hackathonTeams()
  const team = await teamsCol.findOne({ hackathon_id: hk.id, 'members.user_id': user.id })
  if (!team) return NextResponse.json({ error: 'Not in a team for this event' }, { status: 403 })

  if (!hk.results_released && user.role !== 'superadmin') {
    return NextResponse.json({ error: 'Results not yet released' }, { status: 403 })
  }

  const [activityCol, proctorCol] = await Promise.all([
    hackathonActivity(),
    hackathonProctorEvents(),
  ])

  const [activity, proctor] = await Promise.all([
    activityCol.find({ hackathon_id: hk.id, team_id: team.id }).sort({ created_at: 1 }).toArray(),
    proctorCol.find({ hackathon_id: hk.id, team_id: team.id }).sort({ created_at: 1 }).toArray(),
  ])

  return NextResponse.json({ activity, proctor })
}
import { NextRequest, NextResponse } from 'next/server'
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
  if (hk.status === 'live') return NextResponse.json({ error: 'event in progress, cannot join' }, { status: 409 })
if (hk.status === 'closed') return NextResponse.json({ error: 'event closed' }, { status: 409 })

  const teamsCol = await hackathonTeams()
  const team = await teamsCol.findOne({
    hackathon_id: hk.id,
    $or: [{ id: teamId }, { slug: teamId }, { qr_token: teamId }],
  })
  if (!team) return NextResponse.json({ error: 'team not found' }, { status: 404 })

  if (team.members.length >= hk.max_per_team) {
    return NextResponse.json({ error: `Team is full (${hk.max_per_team} max)` }, { status: 409 })
  }

  const already = await teamsCol.findOne({
    hackathon_id: hk.id,
    'members.user_id': user.id,
  })
  if (already) {
    return NextResponse.json({ error: `already on a team in this event`, team: already.slug, team_name: already.name }, { status: 409 })
  }

  await teamsCol.updateOne(
    { id: team.id },
    {
      $push: { members: { user_id: user.id, name: user.name || (user.email || '').split('@')[0] || 'Member', role: 'member' } as Record<string, unknown> },
      $set: { updated_at: nowIso() },
    },
  )

  return NextResponse.json({ ok: true, team: { id: team.id, name: team.name, slug: team.slug } })
}

import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/api-auth'
import { hackathonClaims, hackathons, hackathonTeams } from '@/lib/db/qr-events'

export const runtime = 'nodejs'

async function resolveHackathon(idOrSlug: string) {
  const col = await hackathons()
  return col.findOne({ $or: [{ id: idOrSlug }, { slug: idOrSlug }] })
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; slug: string }> },
) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, slug } = await ctx.params
  const hk = await resolveHackathon(id)
  if (!hk) return NextResponse.json({ error: 'hackathon not found' }, { status: 404 })

  const team = await (await hackathonTeams()).findOne({ hackathon_id: hk.id, 'members.user_id': user.id })
  if (!team) return NextResponse.json({ error: 'you are not on a team in this event' }, { status: 403 })
  const claims = await hackathonClaims()
  await claims.deleteOne({
    hackathon_id: hk.id,
    team_id: team.id,
    problem_slug: slug,
    user_id: user.id,
  })

  return NextResponse.json({ ok: true })
}
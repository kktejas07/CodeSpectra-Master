import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { hackathonTeams } from '@/lib/db/qr-events'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string; teamId: string }> }) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, teamId } = await ctx.params

  const teamsCol = await hackathonTeams()
  const team = await teamsCol.findOne({
    $or: [{ id: teamId }, { slug: teamId }],
    'members.user_id': user.id,
  })
  if (!team) return NextResponse.json({ error: 'team not found' }, { status: 404 })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const inviteUrl = `${appUrl}/hackathons/${id}/join/${team.qr_token}`
  const qrUrl = `${appUrl}/qr/${team.qr_token}`

  return NextResponse.json({
    invite_url: inviteUrl,
    qr_url: qrUrl,
    team_name: team.name,
    member_count: team.members.length,
    max_members: 0, // caller should fetch hackathon for max_per_team
  })
}

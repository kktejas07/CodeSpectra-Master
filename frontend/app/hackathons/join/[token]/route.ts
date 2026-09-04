import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { hackathons, hackathonTeams, hackathonInvites, nowIso } from '@/lib/db/qr-events'
import { hackathonEmailTemplates } from '@/lib/email-templates'
import { sendEmail } from '@/lib/send-email'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const user = await getAPIUser()
  if (!user) {
    const { token } = await ctx.params
    return NextResponse.json({ needsAuth: true, token })
  }
  const { token } = await ctx.params

  const invitesCol = await hackathonInvites()
  const invite = await invitesCol.findOne({ token })
  if (!invite) return NextResponse.json({ error: 'Invalid invite' }, { status: 404 })

  if ((invite.email || '').toLowerCase() !== (user.email || '').toLowerCase()) {
    return NextResponse.json({ error: 'This invite was sent to a different email' }, { status: 403 })
  }
  if (invite.accepted_at) return NextResponse.json({ error: 'Invite already used' }, { status: 409 })

  const hk = await (await hackathons()).findOne({ id: invite.hackathon_id })
  if (!hk) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  if (hk.status === 'live') return NextResponse.json({ error: 'Event is in progress, cannot join' }, { status: 409 })
if (hk.status === 'closed') return NextResponse.json({ error: 'Event is closed' }, { status: 409 })

  const teamsCol = await hackathonTeams()
  const team = await teamsCol.findOne({ id: invite.team_id })
  if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })
  if (team.members.length >= hk.max_per_team) {
    return NextResponse.json({ error: 'Team is full' }, { status: 409 })
  }

  const already = await teamsCol.findOne({ hackathon_id: hk.id, 'members.user_id': user.id })
  if (already) return NextResponse.json({ error: 'Already on a team' }, { status: 409 })

  await teamsCol.updateOne(
    { id: team.id },
    {
      $push: { members: { user_id: user.id, name: user.name || (user.email || '').split('@')[0] || 'Member', role: 'member' } as Record<string, unknown> },
      $set: { updated_at: nowIso() },
    },
  )
  await invitesCol.updateOne({ id: invite.id }, { $set: { accepted_at: nowIso(), accepted_by_user_id: user.id } })

  try {
    const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const template = hackathonEmailTemplates.teamJoinConfirmation({
      eventName: hk.name, teamName: team.name,
      memberName: user.name || 'Team Member',
      workspaceUrl: `${base}/hackathons/${hk.slug}/workspace`,
    })
    await sendEmail(user.email || '', template)
  } catch { /* non-critical */ }

  return NextResponse.json({ ok: true, team: { id: team.id, name: team.name, slug: team.slug } })
}
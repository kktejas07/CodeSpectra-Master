import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { hackathons, hackathonTeams, hackathonInvites, nowIso } from '@/lib/db/qr-events'
import { hackathonEmailTemplates, sendEmail } from '@/lib/email-templates'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 })

  const invitesCol = await hackathonInvites()
  const invite = await invitesCol.findOne({ token })
  if (!invite) return NextResponse.json({ error: 'Invalid or expired invite' }, { status: 404 })
  if (invite.accepted_at) return NextResponse.json({ error: 'Invite already used' }, { status: 409 })

  const hk = await (await hackathons()).findOne({ id: invite.hackathon_id })
  if (!hk) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  const team = await (await hackathonTeams()).findOne({ id: invite.team_id })
  if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

  return NextResponse.json({
    token,
    eventName: hk.name,
    eventSlug: hk.slug,
    teamName: team.name,
    teamId: team.id,
    invitedBy: invite.invited_by_name,
    expiresAt: invite.expires_at,
  })
}

export async function POST(req: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const token = typeof body?.token === 'string' ? body.token : null
  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 })

  const invitesCol = await hackathonInvites()
  const invite = await invitesCol.findOne({ token })
  if (!invite) return NextResponse.json({ error: 'Invalid or expired invite' }, { status: 404 })
  if (invite.accepted_at) return NextResponse.json({ error: 'Invite already used' }, { status: 409 })
  if (new Date(invite.expires_at) < new Date()) return NextResponse.json({ error: 'Invite has expired' }, { status: 410 })

  if (invite.email.toLowerCase() !== (user.email || '').toLowerCase()) {
    return NextResponse.json({ error: 'This invite was sent to a different email address' }, { status: 403 })
  }

  const hk = await (await hackathons()).findOne({ id: invite.hackathon_id })
  if (!hk) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  if (hk.status === 'closed') return NextResponse.json({ error: 'Event is closed' }, { status: 409 })

  const teamsCol = await hackathonTeams()
  const team = await teamsCol.findOne({ id: invite.team_id })
  if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })
  if (team.members.length >= hk.max_per_team) {
    return NextResponse.json({ error: 'Team is full' }, { status: 409 })
  }

  const already = await teamsCol.findOne({
    hackathon_id: hk.id,
    'members.user_id': user.id,
  })
  if (already) return NextResponse.json({ error: 'You are already on a team for this event' }, { status: 409 })

  await teamsCol.updateOne(
    { id: team.id },
    {
      $push: { members: { user_id: user.id, name: user.name || (user.email || '').split('@')[0] || 'Member', role: 'member' } as Record<string, unknown> },
      $set: { updated_at: nowIso() },
    },
  )

  await invitesCol.updateOne(
    { id: invite.id },
    { $set: { accepted_at: nowIso(), accepted_by_user_id: user.id } },
  )

  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  try {
    const template = hackathonEmailTemplates.teamJoinConfirmation({
      eventName: hk.name,
      teamName: team.name,
      memberName: user.name || 'Team Member',
      workspaceUrl: `${base}/hackathons/${hk.slug}/workspace`,
    })
    await sendEmail(user.email || '', template)
  } catch { /* non-critical */ }

  return NextResponse.json({ ok: true, team: { id: team.id, name: team.name, slug: team.slug } })
}
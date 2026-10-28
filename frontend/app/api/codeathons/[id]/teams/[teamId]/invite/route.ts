import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { sanitizeMongoInput } from '@/lib/mongo-sanitize'

export const runtime = 'nodejs'

// POST: Invite a user to team
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; teamId: string }> }
): Promise<NextResponse> {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })

  const { id: codeathonId, teamId } = await params
  const body = sanitizeMongoInput(await request.json()) as { email: string }

  if (!body.email?.trim()) {
    return NextResponse.json({ error: 'Email is required', code: 'auth_email_required' }, { status: 400 })
  }

  try {
    const db = await getMongoDb()

    // Check user is captain
    const membership = await db.collection('codeathon_team_members').findOne({
      team_id: teamId,
      user_id: user.id,
      codeathon_id: codeathonId,
      role: 'captain',
    })
    if (!membership) {
      return NextResponse.json({ error: 'Only team captain can invite' }, { status: 403 })
    }

    // Check team size
    const codeathon = await db.collection('codeathons').findOne({ id: codeathonId })
    const memberCount = await db.collection('codeathon_team_members').countDocuments({ team_id: teamId })
    const maxSize = (codeathon as any).team_size_max || 4
    if (memberCount >= maxSize) {
      return NextResponse.json({ error: 'Team is full' }, { status: 400 })
    }

    // Find user by email
    const invitee = await db.collection('user').findOne({ email: body.email.trim().toLowerCase() })
    if (!invitee) {
      return NextResponse.json({ error: 'User not found', code: 'user_not_found' }, { status: 404 })
    }

    // Check if already in a team
    const existingMembership = await db.collection('codeathon_team_members').findOne({
      codeathon_id: codeathonId,
      user_id: invitee.id,
    })
    if (existingMembership) {
      return NextResponse.json({ error: 'User is already in a team' }, { status: 400 })
    }

    // Check if already invited
    const existingInvite = await db.collection('codeathon_invitations').findOne({
      codeathon_id: codeathonId,
      team_id: teamId,
      invitee_id: invitee.id,
      status: 'pending',
    })
    if (existingInvite) {
      return NextResponse.json({ error: 'User already invited' }, { status: 400 })
    }

    // Create invitation
    const invite = {
      id: crypto.randomUUID(),
      codeathon_id: codeathonId,
      team_id: teamId,
      team_name: (await db.collection('codeathon_teams').findOne({ id: teamId }))?.name || '',
      inviter_id: user.id,
      inviter_name: user.fullName || user.email || 'Unknown',
      invitee_id: invitee.id,
      invitee_email: body.email.trim().toLowerCase(),
      status: 'pending',
      created_at: new Date().toISOString(),
    }
    await db.collection('codeathon_invitations').insertOne(invite)

    // Send notification
    try {
      const { notify } = await import('@/lib/notifications')
      await notify({
        user_id: invitee.id,
        type: 'team_invitation',
        title: 'Team Invitation',
        message: `${user.fullName || user.email} invited you to join "${invite.team_name}" for a codeathon`,
        title_i18n: { key: 'type.team.invite' },
        message_i18n: { key: 'codeathon.teamInvite.message', params: { inviter: String(user.fullName || user.email), team: String(invite.team_name) } },
        link: `/dashboard/codeathons/${codeathonId}`,
        icon: 'users',
      })
    } catch { /* notification best-effort */ }

    return NextResponse.json({ invitation: invite }, { status: 201 })
  } catch (e) {
    console.error('[Team invite]', e)
    return NextResponse.json({ error: 'Failed to send invitation' }, { status: 500 })
  }
}

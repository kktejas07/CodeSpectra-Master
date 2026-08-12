import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'

// POST: Accept invitation
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; inviteId: string }> }
): Promise<NextResponse> {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: codeathonId, inviteId } = await params

  try {
    const db = await getMongoDb()

    // Find invitation
    const invite = await db.collection('codeathon_invitations').findOne({
      id: inviteId,
      codeathon_id: codeathonId,
      invitee_id: user.id,
      status: 'pending',
    })
    if (!invite) {
      return NextResponse.json({ error: 'Invitation not found or expired' }, { status: 404 })
    }

    // Check user not already in a team
    const existingMembership = await db.collection('codeathon_team_members').findOne({
      codeathon_id: codeathonId,
      user_id: user.id,
    })
    if (existingMembership) {
      return NextResponse.json({ error: 'You are already in a team' }, { status: 400 })
    }

    // Check team size
    const codeathon = await db.collection('codeathons').findOne({ id: codeathonId })
    const memberCount = await db.collection('codeathon_team_members').countDocuments({ team_id: invite.team_id })
    const maxSize = (codeathon as any).team_size_max || 4
    if (memberCount >= maxSize) {
      return NextResponse.json({ error: 'Team is now full' }, { status: 400 })
    }

    // Join team
    const member = {
      id: crypto.randomUUID(),
      team_id: invite.team_id,
      codeathon_id: codeathonId,
      user_id: user.id,
      role: 'member',
      joined_at: new Date().toISOString(),
    }
    await db.collection('codeathon_team_members').insertOne(member)

    // Update invitation status
    await db.collection('codeathon_invitations').updateOne(
      { id: inviteId },
      { $set: { status: 'accepted', accepted_at: new Date().toISOString() } }
    )

    // Increment participant counter
    await db.collection('codeathons').updateOne(
      { id: codeathonId },
      { $inc: { participants: 1 } }
    )

    return NextResponse.json({ member })
  } catch (e) {
    console.error('[Invite accept]', e)
    return NextResponse.json({ error: 'Failed to accept invitation' }, { status: 500 })
  }
}

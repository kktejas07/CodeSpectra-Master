import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'

// POST: Decline invitation
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; inviteId: string }> }
): Promise<NextResponse> {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })

  const { id: codeathonId, inviteId } = await params

  try {
    const db = await getMongoDb()

    const invite = await db.collection('codeathon_invitations').findOne({
      id: inviteId,
      codeathon_id: codeathonId,
      invitee_id: user.id,
      status: 'pending',
    })
    if (!invite) {
      return NextResponse.json({ error: 'Invitation not found', code: 'invite_not_found' }, { status: 404 })
    }

    await db.collection('codeathon_invitations').updateOne(
      { id: inviteId },
      { $set: { status: 'declined', declined_at: new Date().toISOString() } }
    )

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[Invite decline]', e)
    return NextResponse.json({ error: 'Failed to decline invitation' }, { status: 500 })
  }
}

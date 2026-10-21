import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'

// POST: Leave a team
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; teamId: string }> }
): Promise<NextResponse> {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })

  const { id: codeathonId, teamId } = await params

  try {
    const db = await getMongoDb()

    // Check membership
    const membership = await db.collection('codeathon_team_members').findOne({
      team_id: teamId,
      user_id: user.id,
      codeathon_id: codeathonId,
    })
    if (!membership) {
      return NextResponse.json({ error: 'You are not in this team' }, { status: 400 })
    }

    // Captain can't leave — must delete team or transfer captainship
    if (membership.role === 'captain') {
      const memberCount = await db.collection('codeathon_team_members').countDocuments({ team_id: teamId })
      if (memberCount > 1) {
        return NextResponse.json({ error: 'Captain cannot leave with members. Transfer captainship first.' }, { status: 400 })
      }
    }

    // Remove member
    await db.collection('codeathon_team_members').deleteOne({ id: membership.id })

    // Decrement participant counter
    await db.collection('codeathons').updateOne(
      { id: codeathonId },
      { $inc: { participants: -1 } }
    )

    // If team is empty, delete it
    const remaining = await db.collection('codeathon_team_members').countDocuments({ team_id: teamId })
    if (remaining === 0) {
      await db.collection('codeathon_teams').deleteOne({ id: teamId })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[Team leave]', e)
    return NextResponse.json({ error: 'Failed to leave team' }, { status: 500 })
  }
}

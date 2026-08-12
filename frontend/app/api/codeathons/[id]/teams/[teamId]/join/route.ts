import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'

// POST: Join a team
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; teamId: string }> }
): Promise<NextResponse> {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: codeathonId, teamId } = await params

  try {
    const db = await getMongoDb()

    // Check team exists
    const team = await db.collection('codeathon_teams').findOne({ id: teamId, codeathon_id: codeathonId })
    if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

    // Check codeathon
    const codeathon = await db.collection('codeathons').findOne({ id: codeathonId })
    if (!codeathon) return NextResponse.json({ error: 'Codeathon not found' }, { status: 404 })
    if (codeathon.event_type !== 'team') {
      return NextResponse.json({ error: 'This codeathon is individual only' }, { status: 400 })
    }

    // Check if user already in a team
    const existingMembership = await db.collection('codeathon_team_members').findOne({
      codeathon_id: codeathonId,
      user_id: user.id,
    })
    if (existingMembership) {
      return NextResponse.json({ error: 'You are already in a team' }, { status: 400 })
    }

    // Check team size limit
    const memberCount = await db.collection('codeathon_team_members').countDocuments({ team_id: teamId })
    const maxSize = (codeathon as any).team_size_max || 4
    if (memberCount >= maxSize) {
      return NextResponse.json({ error: 'Team is full' }, { status: 400 })
    }

    // Join team
    const member = {
      id: crypto.randomUUID(),
      team_id: teamId,
      codeathon_id: codeathonId,
      user_id: user.id,
      role: 'member',
      joined_at: new Date().toISOString(),
    }
    await db.collection('codeathon_team_members').insertOne(member)

    // Increment participant counter
    await db.collection('codeathons').updateOne(
      { id: codeathonId },
      { $inc: { participants: 1 } }
    )

    return NextResponse.json({ member }, { status: 201 })
  } catch (e) {
    console.error('[Team join]', e)
    return NextResponse.json({ error: 'Failed to join team' }, { status: 500 })
  }
}

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

    // A join needs the team's join code (shared by its members) — team ids are
    // listed publicly, so an id alone must never be enough.
    const body = (await request.json().catch(() => ({}))) as { join_code?: unknown }
    const code = typeof body.join_code === 'string' ? body.join_code.trim().toUpperCase() : ''
    const team = await db.collection('codeathon_teams').findOne({ id: teamId, codeathon_id: codeathonId })
    if (!team || !code || !team.join_code || team.join_code !== code) {
      return NextResponse.json({ error: 'That join code is not valid for this team' }, { status: 403 })
    }

    // Check codeathon
    const codeathon = await db.collection('codeathons').findOne({ id: codeathonId })
    if (!codeathon) return NextResponse.json({ error: 'Codeathon not found' }, { status: 404 })
    if (codeathon.event_type !== 'team') {
      return NextResponse.json({ error: 'This codeathon is individual only' }, { status: 400 })
    }
    if (codeathon.endDate && new Date(String(codeathon.endDate)).getTime() < Date.now()) {
      return NextResponse.json({ error: 'This codeathon has ended' }, { status: 409 })
    }

    // Check if user already in a team
    const existingMembership = await db.collection('codeathon_team_members').findOne({
      codeathon_id: codeathonId,
      user_id: user.id,
    })
    if (existingMembership) {
      return NextResponse.json({ error: 'You are already in a team' }, { status: 400 })
    }

    // Team size limit
    const maxSize = Number((codeathon as any).team_size_max) || 4
    const memberCount = await db.collection('codeathon_team_members').countDocuments({ team_id: teamId })
    if (memberCount >= maxSize) {
      return NextResponse.json({ error: 'Team is full' }, { status: 409 })
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
    // Two joins can race past the check above; whoever lands over the cap backs out.
    const after = await db.collection('codeathon_team_members')
      .find({ team_id: teamId }, { projection: { id: 1, joined_at: 1 } }).sort({ joined_at: 1, id: 1 }).toArray()
    if (after.findIndex((m) => m.id === member.id) >= maxSize) {
      await db.collection('codeathon_team_members').deleteOne({ id: member.id })
      return NextResponse.json({ error: 'Team is full' }, { status: 409 })
    }

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

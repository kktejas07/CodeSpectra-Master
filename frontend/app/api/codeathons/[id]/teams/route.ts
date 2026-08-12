import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'

// GET: List teams for a codeathon
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params

  try {
    const db = await getMongoDb()
    const teams = await db.collection('codeathon_teams')
      .find({ codeathon_id: id })
      .sort({ created_at: -1 })
      .toArray()

    // Get member counts and names
    const teamIds = teams.map(t => t.id)
    const members = await db.collection('codeathon_team_members')
      .find({ team_id: { $in: teamIds } })
      .toArray()

    const teamsWithMembers = teams.map(team => ({
      ...team,
      members: members.filter(m => m.team_id === team.id),
      member_count: members.filter(m => m.team_id === team.id).length,
    }))

    return NextResponse.json({ teams: teamsWithMembers })
  } catch (e) {
    console.error('[Teams list]', e)
    return NextResponse.json({ error: 'Failed to list teams' }, { status: 500 })
  }
}

// POST: Create a new team
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: codeathonId } = await params
  const body = await request.json() as { name: string }

  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'Team name is required' }, { status: 400 })
  }

  try {
    const db = await getMongoDb()

    // Check if codeathon is team mode
    const codeathon = await db.collection('codeathons').findOne({ id: codeathonId })
    if (!codeathon) return NextResponse.json({ error: 'Codeathon not found' }, { status: 404 })
    if (codeathon.event_type !== 'team') {
      return NextResponse.json({ error: 'This codeathon is individual only' }, { status: 400 })
    }

    // Check if user already has a team
    const existingMembership = await db.collection('codeathon_team_members').findOne({
      codeathon_id: codeathonId,
      user_id: user.id,
    })
    if (existingMembership) {
      return NextResponse.json({ error: 'You are already in a team' }, { status: 400 })
    }

    // Check team name uniqueness
    const existingTeam = await db.collection('codeathon_teams').findOne({
      codeathon_id: codeathonId,
      name: body.name.trim(),
    })
    if (existingTeam) {
      return NextResponse.json({ error: 'Team name already taken' }, { status: 400 })
    }

    // Create team
    const teamId = crypto.randomUUID()
    const team = {
      id: teamId,
      codeathon_id: codeathonId,
      name: body.name.trim(),
      created_by: user.id,
      created_at: new Date().toISOString(),
    }
    await db.collection('codeathon_teams').insertOne(team)

    // Add creator as captain
    const member = {
      id: crypto.randomUUID(),
      team_id: teamId,
      codeathon_id: codeathonId,
      user_id: user.id,
      role: 'captain',
      joined_at: new Date().toISOString(),
    }
    await db.collection('codeathon_team_members').insertOne(member)

    // Increment participant counter
    await db.collection('codeathons').updateOne(
      { id: codeathonId },
      { $inc: { participants: 1 } }
    )

    return NextResponse.json({
      team: { ...team, members: [member], member_count: 1 },
    }, { status: 201 })
  } catch (e) {
    console.error('[Team create]', e)
    return NextResponse.json({ error: 'Failed to create team' }, { status: 500 })
  }
}

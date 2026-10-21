import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { randomBytes } from 'node:crypto'
import { isTenantStaff } from '@/lib/exam-access'

export const runtime = 'nodejs'

// GET: List teams for a codeathon
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })

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

    // The join code is the team's secret: only its members (and staff) see it.
    const codeathon = await db.collection('codeathons').findOne({ id }, { projection: { tenant_id: 1 } })
    const staff = !!codeathon && isTenantStaff(user, codeathon as unknown as Record<string, unknown>)
    const teamsWithMembers = teams.map(({ _id, join_code, ...team }) => {
      void _id
      const teamMembers = members.filter(m => m.team_id === team.id)
      const mine = teamMembers.some((m) => m.user_id === user.id)
      return {
        ...team,
        ...(mine || staff ? { join_code } : {}),
        members: teamMembers.map(({ _id: _m, ...m }) => { void _m; return m }),
        member_count: teamMembers.length,
      }
    })

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
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })

  const { id: codeathonId } = await params
  const body = (await request.json().catch(() => ({}))) as { name?: unknown }
  if (typeof body.name !== 'string' || !body.name.trim()) {
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
    if (codeathon.endDate && new Date(String(codeathon.endDate)).getTime() < Date.now()) {
      return NextResponse.json({ error: 'This codeathon has ended' }, { status: 409 })
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
      name: (body.name as string).trim(),
    })
    if (existingTeam) {
      return NextResponse.json({ error: 'Team name already taken' }, { status: 400 })
    }

    // Create team
    const teamId = crypto.randomUUID()
    const team = {
      id: teamId,
      codeathon_id: codeathonId,
      name: body.name.trim().slice(0, 80),
      // Share this code with teammates; joining by team id alone is not allowed.
      join_code: randomBytes(4).toString('hex').toUpperCase(),
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

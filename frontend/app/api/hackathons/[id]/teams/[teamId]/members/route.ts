import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { hackathons, hackathonTeams, nowIso } from '@/lib/db/qr-events'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isAdmin(role?: string | null): boolean {
  return ['superadmin', 'admin', 'tenant_admin'].includes((role || '').toLowerCase())
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; teamId: string }> },
) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, teamId } = await ctx.params

  const hk = await (await hackathons()).findOne({ $or: [{ id }, { slug: id }] })
  if (!hk) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  const teamsCol = await hackathonTeams()
  const team = await teamsCol.findOne({
    hackathon_id: hk.id,
    $or: [{ id: teamId }, { slug: teamId }],
  })
  if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

  const isCaptain = Array.isArray(team.members) && team.members.some(m => m.user_id === user.id && m.role === 'captain')
  if (!isAdmin(user.role) && !isCaptain) {
    return NextResponse.json({ error: 'Only team captain or admins can add members' }, { status: 403 })
  }

  if (team.members.length >= hk.max_per_team) {
    return NextResponse.json({ error: `Team is full (${hk.max_per_team} max)` }, { status: 409 })
  }

  const body = await req.json()
  const targetIdentifier = typeof body?.user === 'string' ? body.user.trim() : null
  if (!targetIdentifier) return NextResponse.json({ error: 'User identifier (name, email, or ID) is required' }, { status: 400 })

  const db = await getMongoDb()
  const foundUser = await db.collection('users').findOne({
    $or: [
      { id: targetIdentifier },
      { email: { $regex: `^${targetIdentifier}$`, $options: 'i' } },
      { name: { $regex: `^${targetIdentifier}$`, $options: 'i' } },
    ],
  })

  const targetUserId = foundUser ? (foundUser.id || foundUser._id.toString()) : targetIdentifier
  const targetName = foundUser ? (foundUser.name || foundUser.email || targetIdentifier) : targetIdentifier

  if (team.members.some(m => m.user_id === targetUserId)) {
    return NextResponse.json({ error: 'User is already on this team' }, { status: 409 })
  }

  const already = await teamsCol.findOne({
    hackathon_id: hk.id,
    'members.user_id': targetUserId,
  })

  if (already) {
    if (already.members.length === 1 && (already.submissions || 0) === 0) {
      await teamsCol.deleteOne({ id: already.id })
    } else {
      return NextResponse.json({ error: `User is already on team "${already.name}"` }, { status: 409 })
    }
  }

  await teamsCol.updateOne(
    { id: team.id },
    {
      $push: { members: { user_id: targetUserId, name: targetName, role: 'member' } as Record<string, unknown> },
      $set: { updated_at: nowIso() },
    },
  )

  return NextResponse.json({ ok: true, member: { user_id: targetUserId, name: targetName, role: 'member' } })
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; teamId: string }> },
) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, teamId } = await ctx.params

  const { searchParams } = new URL(req.url)
  const removeUserId = searchParams.get('user_id')
  if (!removeUserId) return NextResponse.json({ error: 'user_id query param required' }, { status: 400 })

  const hk = await (await hackathons()).findOne({ $or: [{ id }, { slug: id }] })
  if (!hk) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  const teamsCol = await hackathonTeams()
  const team = await teamsCol.findOne({
    hackathon_id: hk.id,
    $or: [{ id: teamId }, { slug: teamId }],
  })
  if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

  const isCaptain = Array.isArray(team.members) && team.members.some(m => m.user_id === user.id && m.role === 'captain')
  const isSelf = user.id === removeUserId

  if (!isAdmin(user.role) && !isCaptain && !isSelf) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const updatedMembers = team.members.filter(m => m.user_id !== removeUserId)
  if (updatedMembers.length === 0) {
    await teamsCol.deleteOne({ id: team.id })
    return NextResponse.json({ ok: true, dissolved: true })
  }

  await teamsCol.updateOne(
    { id: team.id },
    {
      $set: { members: updatedMembers, updated_at: nowIso() },
    },
  )

  return NextResponse.json({ ok: true })
}

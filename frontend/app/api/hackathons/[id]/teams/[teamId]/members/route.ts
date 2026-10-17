import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { hackathons, hackathonTeams, nowIso } from '@/lib/db/qr-events'
import { users } from '@/lib/db/admin'
import { isHackathonStaff } from '@/lib/hackathons/access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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

  // Organisers only. Captains invite by email (teams/[teamId]/invite) so the
  // person consents; force-adding someone else is not a captain power.
  if (!isHackathonStaff(user, hk)) {
    return NextResponse.json({ error: 'Only organisers can add members directly; captains can send an invite' }, { status: 403 })
  }

  if (team.members.length >= hk.max_per_team) {
    return NextResponse.json({ error: `Team is full (${hk.max_per_team} max)` }, { status: 409 })
  }

  const body = await req.json().catch(() => ({}))
  const targetIdentifier = typeof body?.user === 'string' ? body.user.trim().slice(0, 200) : null
  if (!targetIdentifier) return NextResponse.json({ error: 'User identifier (name, email, or ID) is required' }, { status: 400 })

  const exact = new RegExp(`^${escapeRegex(targetIdentifier)}$`, 'i')
  const foundUser = await (await users()).findOne({
    $or: [
      { id: targetIdentifier },
      { _id: targetIdentifier },
      { email: exact },
      { name: exact },
    ],
  } as Record<string, unknown>)
  if (!foundUser) return NextResponse.json({ error: 'No user found with that email, name or ID' }, { status: 404 })

  const targetUserId = String(foundUser.id || foundUser._id)
  const targetName = foundUser.fullName || foundUser.name || foundUser.email || 'Member'
  if ((hk.judges || []).includes(targetUserId)) {
    return NextResponse.json({ error: 'Judges of this event cannot join a team' }, { status: 409 })
  }

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

  // Atomic size cap: only push while the team is still under max_per_team.
  const res = await teamsCol.updateOne(
    { id: team.id, [`members.${Math.max(0, hk.max_per_team - 1)}`]: { $exists: false } } as Record<string, unknown>,
    {
      $push: { members: { user_id: targetUserId, name: targetName, role: 'member' } as never },
      $set: { updated_at: nowIso() },
    },
  )
  if (res.modifiedCount === 0) return NextResponse.json({ error: `Team is full (${hk.max_per_team} max)` }, { status: 409 })

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

  if (!isHackathonStaff(user, hk) && !isCaptain && !isSelf) {
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

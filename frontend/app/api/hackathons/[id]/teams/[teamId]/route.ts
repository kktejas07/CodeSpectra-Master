/**
 * /api/hackathons/[id]/teams/[teamId]
 *   GET    -> team detail with refreshed QR SVG
 *   PATCH  -> staff: grant XP / push achievement / rename; captain: rename only
 *   DELETE -> admin/tenant_admin: remove team (e.g. disqualified)
 *
 * PATCH body (any subset):
 *   { name?: string,
 *     xp_delta?: number,                  // positive or negative XP change
 *     achievement?: string,               // pushed onto achievements[]
 *     submission?: boolean }              // bumps submissions++ counter
 *
 * Team `level` is auto-recomputed from xp (1 per 100 XP).
 * `teamId` accepts both the team UUID and the team slug.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/api-auth'
import { hackathons, hackathonTeams, newId, nowIso, xpToLevel, type HackathonAchievement } from '@/lib/db/qr-events'
import { isHackathonStaff } from '@/lib/hackathons/access'

export const runtime = 'nodejs'

async function resolveEventAndTeam(hackathonIdOrSlug: string, teamIdOrSlug: string) {
  const hk = await (await hackathons()).findOne({
    $or: [{ id: hackathonIdOrSlug }, { slug: hackathonIdOrSlug }],
  })
  if (!hk) return null
  const team = await (await hackathonTeams()).findOne({
    hackathon_id: hk.id,
    $or: [{ id: teamIdOrSlug }, { slug: teamIdOrSlug }],
  })
  return team ? { hk, team } : null
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; teamId: string }> },
) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, teamId } = await ctx.params
  const found = await resolveEventAndTeam(id, teamId)
  if (!found) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const { hk, team } = found
  const staff = isHackathonStaff(user, hk)
  if (hk.status === 'draft' && !staff) return NextResponse.json({ error: 'not found' }, { status: 404 })

  // Join token is a bearer credential for the share link — only admins or
  // members of the team may read it. Everyone else gets the team sans token.
  const isMember = Array.isArray(team.members) && team.members.some((m: { user_id?: string }) => m.user_id === user.id)
  if (!staff && !isMember) {
    const { qr_token: _qr, _id: _omit, verify_token: _vt, ...clean } = team as typeof team & { _id?: unknown; qr_token?: string; verify_token?: string }
    void _qr
    void _omit
    void _vt
    return NextResponse.json({ team: clean })
  }

  const { _id: _omit, ...clean } = team as typeof team & { _id?: unknown }
  void _omit
  return NextResponse.json({ team: clean })
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; teamId: string }> },
) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, teamId } = await ctx.params
  let body: {
    name?: string
    xp_delta?: number
    achievement?: string
    submission?: boolean
  } = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  const found = await resolveEventAndTeam(id, teamId)
  if (!found) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const { hk, team } = found

  const isCaptain = Array.isArray(team.members) && team.members.some((m: { user_id?: string; role?: string }) => m.user_id === user.id && m.role === 'captain')
  const staff = isHackathonStaff(user, hk)
  if (!staff && !isCaptain) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  // Points are server-awarded only: XP, achievements and counters are staff-only.
  // A captain may only rename the team.
  if (!staff && (body.xp_delta !== undefined || body.achievement !== undefined || body.submission !== undefined)) {
    return NextResponse.json({ error: 'Only organisers can change XP or achievements' }, { status: 403 })
  }

  const $set: Record<string, unknown> = { updated_at: nowIso() }
  const $push: Record<string, unknown> = {}
  const $inc: Record<string, number> = {}

  if (typeof body.name === 'string' && body.name.trim()) $set.name = body.name.trim().slice(0, 80)
  if (staff && typeof body.xp_delta === 'number' && Number.isFinite(body.xp_delta)) {
    $inc.xp = Math.max(-10000, Math.min(10000, Math.round(body.xp_delta)))
  }
  if (staff && body.submission === true) $inc.submissions = 1
  if (staff && typeof body.achievement === 'string' && body.achievement.trim()) {
    const ach: HackathonAchievement = {
      id: newId(),
      name: body.achievement.trim().slice(0, 80),
      awarded_at: nowIso(),
    }
    $push.achievements = ach
  }

  const update: Record<string, unknown> = {}
  if (Object.keys($set).length) update.$set = $set
  if (Object.keys($inc).length) update.$inc = $inc
  if (Object.keys($push).length) update.$push = $push

  const col = await hackathonTeams()
  await col.updateOne({ id: team.id }, update)

  // Recompute level after xp change.
  const next = await col.findOne({ id: team.id })
  if (next) {
    const newLevel = xpToLevel(next.xp)
    if (newLevel !== next.level) {
      await col.updateOne({ id: team.id }, { $set: { level: newLevel } })
      next.level = newLevel
    }
  }
  const { _id: _omit, ...clean } = (next || {}) as typeof team & { _id?: unknown }
  void _omit
  return NextResponse.json({ team: clean })
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; teamId: string }> },
) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, teamId } = await ctx.params
  const found = await resolveEventAndTeam(id, teamId)
  if (!found) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const { hk, team } = found
  if (!isHackathonStaff(user, hk)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  await (await hackathonTeams()).deleteOne({ id: team.id })
  return NextResponse.json({ ok: true })
}

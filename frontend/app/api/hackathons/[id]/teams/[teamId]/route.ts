/**
 * /api/hackathons/[id]/teams/[teamId]
 *   GET    -> team detail with refreshed QR SVG
 *   PATCH  -> admin/tenant_admin: grant XP / push achievement / rename
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
import {
  hackathonTeams,
  newId,
  nowIso,
  xpToLevel,
  type HackathonAchievement,
} from '@/lib/db/qr-events'
import { generateQrSvg } from '@/lib/qr'

export const runtime = 'nodejs'

function isAdmin(role?: string | null): boolean {
  return ['superadmin', 'admin', 'tenant_admin'].includes((role || '').toLowerCase())
}

function absoluteOrigin(req: NextRequest): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, '')
  if (env) return env
  const proto = req.headers.get('x-forwarded-proto') || 'https'
  const host =
    req.headers.get('x-forwarded-host') ||
    req.headers.get('host') ||
    'localhost:3000'
  return `${proto}://${host}`
}

async function resolveTeam(hackathonIdOrSlug: string, teamIdOrSlug: string) {
  const col = await hackathonTeams()
  return col.findOne({
    $and: [
      { $or: [{ hackathon_id: hackathonIdOrSlug }, { 'hackathon.slug': hackathonIdOrSlug }] },
      { $or: [{ id: teamIdOrSlug }, { slug: teamIdOrSlug }] },
    ],
  })
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; teamId: string }> },
) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, teamId } = await ctx.params
  const team = await resolveTeam(id, teamId)
  if (!team) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const qrUrl = `${absoluteOrigin(req)}/qr/${team.qr_token}`
  const qrSvg = await generateQrSvg(qrUrl, { size: 320 })
  const { _id: _omit, ...clean } = team as typeof team & { _id?: unknown }
  void _omit
  return NextResponse.json({ team: clean, qr_url: qrUrl, qr_svg: qrSvg })
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; teamId: string }> },
) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
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

  const team = await resolveTeam(id, teamId)
  if (!team) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const $set: Record<string, unknown> = { updated_at: nowIso() }
  const $push: Record<string, unknown> = {}
  const $inc: Record<string, number> = {}

  if (body.name) $set.name = body.name
  if (typeof body.xp_delta === 'number' && Number.isFinite(body.xp_delta)) {
    $inc.xp = body.xp_delta
  }
  if (body.submission) $inc.submissions = 1
  if (body.achievement) {
    const ach: HackathonAchievement = {
      id: newId(),
      name: body.achievement.slice(0, 80),
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
  if (!isAdmin(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id, teamId } = await ctx.params
  const team = await resolveTeam(id, teamId)
  if (!team) return NextResponse.json({ error: 'not found' }, { status: 404 })
  await (await hackathonTeams()).deleteOne({ id: team.id })
  return NextResponse.json({ ok: true })
}

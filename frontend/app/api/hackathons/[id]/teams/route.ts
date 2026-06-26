/**
 * /api/hackathons/[id]/teams
 *   GET   -> list teams (with QR token + level + xp)
 *   POST  -> register a new team. Captain is the caller.
 *
 * The `id` segment accepts either the hackathon `id` (UUID) or the `slug`.
 *
 * On POST we:
 *   1. Enforce `num_teams` capacity.
 *   2. Enforce the caller isn't already on another team in this event.
 *   3. Generate a unique QR token + slug.
 *   4. Insert the team with xp=0, level=1, achievements=[].
 *   5. Return the team + QR SVG so the caller can show it immediately.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/api-auth'
import {
  hackathons,
  hackathonTeams,
  newId,
  newToken,
  nowIso,
  type HackathonTeamDoc,
} from '@/lib/db/qr-events'
import { generateQrSvg } from '@/lib/qr'

export const runtime = 'nodejs'

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || `team-${Math.random().toString(36).slice(2, 6)}`
  )
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

async function resolveHackathon(idOrSlug: string) {
  const col = await hackathons()
  return col.findOne({ $or: [{ id: idOrSlug }, { slug: idOrSlug }] })
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const hk = await resolveHackathon(id)
  if (!hk) return NextResponse.json({ error: 'hackathon not found' }, { status: 404 })
  const items = await (await hackathonTeams())
    .find({ hackathon_id: hk.id }, { projection: { _id: 0 } })
    .sort({ xp: -1, created_at: 1 })
    .toArray()
  return NextResponse.json({ items, hackathon: { id: hk.id, slug: hk.slug, name: hk.name } })
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const hk = await resolveHackathon(id)
  if (!hk) return NextResponse.json({ error: 'hackathon not found' }, { status: 404 })
  if (hk.status === 'closed') {
    return NextResponse.json({ error: 'event closed' }, { status: 409 })
  }

  let body: { name?: string } = {}
  try {
    body = (await req.json()) as { name?: string }
  } catch {
    /* empty body OK — we'll auto-name */
  }

  const teamsCol = await hackathonTeams()
  const teamCount = await teamsCol.countDocuments({ hackathon_id: hk.id })
  if (teamCount >= hk.num_teams) {
    return NextResponse.json(
      { error: `event is full (${hk.num_teams} teams)` },
      { status: 409 },
    )
  }

  // No double-registration.
  const already = await teamsCol.findOne({
    hackathon_id: hk.id,
    'members.user_id': user.id,
  })
  if (already) {
    return NextResponse.json(
      { error: 'already a member of a team in this event', team: already.slug },
      { status: 409 },
    )
  }

  const baseName = (body.name || `${user.name || 'Captain'}'s team`).trim()
  let slug = slugify(baseName)
  let suffix = 0
  while (await teamsCol.findOne({ hackathon_id: hk.id, slug })) {
    suffix += 1
    slug = `${slugify(baseName)}-${suffix}`
  }

  const token = newToken()
  const doc: HackathonTeamDoc = {
    id: newId(),
    hackathon_id: hk.id,
    name: baseName,
    slug,
    qr_token: token,
    members: [{ user_id: user.id, name: user.name || baseName, role: 'captain' }],
    xp: 0,
    level: 1,
    achievements: [],
    submissions: 0,
    created_at: nowIso(),
    updated_at: nowIso(),
  }
  await teamsCol.insertOne(doc)

  const qrUrl = `${absoluteOrigin(req)}/qr/${token}`
  const qrSvg = await generateQrSvg(qrUrl, { size: 320 })
  const { _id: _omit, ...clean } = doc as HackathonTeamDoc & { _id?: unknown }
  void _omit
  return NextResponse.json(
    { team: clean, qr_url: qrUrl, qr_svg: qrSvg },
    { status: 201 },
  )
}

/**
 * /api/hackathons/[id]/teams
 *   GET   -> list teams (level + xp). Join token only exposed to members/admins.
 *   POST  -> register a new team. Captain is the caller.
 *
 * The `id` segment accepts either the hackathon `id` (UUID) or the `slug`.
 *
 * On POST we:
 *   1. Enforce `num_teams` capacity.
 *   2. Enforce the caller isn't already on another team in this event.
 *   3. Generate a unique join token + slug.
 *   4. Insert the team with xp=0, level=1, achievements=[].
 *   5. Return the team + share URL so the captain can invite teammates.
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
import { isHackathonStaff } from '@/lib/hackathons/access'

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
  // Public for published events (the detail page works signed out). Drafts
  // are visible to the event's own staff only.
  const user = await getAPIUser().catch(() => null)
  const { id } = await ctx.params
  const hk = await resolveHackathon(id)
  if (!hk) return NextResponse.json({ error: 'hackathon not found' }, { status: 404 })
  const isAdmin = isHackathonStaff(user, hk)
  if (hk.status === 'draft' && !isAdmin) return NextResponse.json({ error: 'hackathon not found' }, { status: 404 })
  const rows = await (await hackathonTeams())
    .find({ hackathon_id: hk.id }, { projection: { _id: 0 } })
    .sort({ xp: -1, created_at: 1 })
    .toArray()
  // The join token powers the share link + email invite. Only members of a
  // team (and admins) may read it; everyone else gets the team sans token.
  const items = rows.map((t) => {
    const isMember = !!user && Array.isArray(t.members) && t.members.some((m: { user_id?: string }) => m.user_id === user.id)
    if (isAdmin || isMember) return t
    const { qr_token: _q, verify_token: _v, ...safe } = t as typeof t & { qr_token?: string; verify_token?: string }
    void _q; void _v
    // Signed-out viewers don't get member user ids.
    return user ? safe : { ...safe, members: (safe.members || []).map((m) => ({ user_id: '', name: m.name, role: m.role })) }
  })
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
  if (hk.status === 'draft') return NextResponse.json({ error: 'hackathon not found' }, { status: 404 })
  if (hk.status === 'closed' || hk.results_released) {
    return NextResponse.json({ error: 'event closed' }, { status: 409 })
  }
  if ((hk.judges || []).includes(user.id)) {
    return NextResponse.json({ error: 'Judges of this event cannot register a team' }, { status: 409 })
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

  const baseName = (typeof body.name === 'string' && body.name.trim() ? body.name : `${user.name || 'Captain'}'s team`).trim().slice(0, 80)
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
  void import('@/lib/automation/events').then(({ emit }) => emit('hackathon.registered', {
    event_id: hk.id, event_kind: 'hackathon', event_name: hk.name, user_id: user.id, team_name: doc.name, starts_at: hk.starts_at ?? null,
  }, { tenantId: hk.tenant_id ?? null, idempotencyKey: `hackathon.registered:${hk.id}:${user.id}` })).catch((e) => console.error('[automation] emit failed:', e))

  const shareUrl = `${absoluteOrigin(req)}/hackathons/${hk.slug}/join/${token}`
  const { _id: _omit, ...clean } = doc as HackathonTeamDoc & { _id?: unknown }
  void _omit
  return NextResponse.json(
    { team: clean, share_url: shareUrl },
    { status: 201 },
  )
}

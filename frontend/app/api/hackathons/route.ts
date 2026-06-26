/**
 * Hackathon events CRUD.
 *
 *   GET  /api/hackathons           -> list (any signed-in user; status='draft' filtered out)
 *   POST /api/hackathons           -> create (admin / tenant_admin only)
 *
 * Hackathon shape:
 *   { name, description, num_teams, max_per_team, timeout_minutes, starts_at }
 *
 * `ends_at` is derived: `starts_at + timeout_minutes`. `slug` is auto-built
 * from `name` (lowercase, hyphenated). `status` lifecycle is:
 *   draft → open (registration) → live (event running) → closed.
 *
 * Time is stored as ISO strings; clients pass either ISO or a UTC date.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/api-auth'
import {
  hackathons,
  newId,
  nowIso,
  type HackathonDoc,
} from '@/lib/db/qr-events'

export const runtime = 'nodejs'

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || `event-${Math.random().toString(36).slice(2, 8)}`
  )
}

function isAdmin(role?: string | null): boolean {
  return ['superadmin', 'admin', 'tenant_admin'].includes((role || '').toLowerCase())
}

export async function GET() {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const col = await hackathons()
  const filter = isAdmin(user.role) ? {} : { status: { $ne: 'draft' } }
  const items = await col
    .find(filter, { projection: { _id: 0 } })
    .sort({ created_at: -1 })
    .toArray()
  return NextResponse.json({ items })
}

export async function POST(req: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: Partial<HackathonDoc> = {}
  try {
    body = (await req.json()) as Partial<HackathonDoc>
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  if (!body.name) return NextResponse.json({ error: 'name required' }, { status: 400 })
  const numTeams = Math.min(500, Math.max(1, Number(body.num_teams) || 8))
  const maxPerTeam = Math.min(20, Math.max(1, Number(body.max_per_team) || 4))
  const timeoutMin = Math.min(7 * 24 * 60, Math.max(5, Number(body.timeout_minutes) || 60))
  const startsAt = body.starts_at ? new Date(body.starts_at) : new Date()
  if (Number.isNaN(startsAt.getTime())) {
    return NextResponse.json({ error: 'invalid starts_at' }, { status: 400 })
  }
  const endsAt = new Date(startsAt.getTime() + timeoutMin * 60_000)

  // Ensure unique slug.
  const col = await hackathons()
  let slug = slugify(body.name)
  let suffix = 0
  while (await col.findOne({ slug })) {
    suffix += 1
    slug = `${slugify(body.name)}-${suffix}`
  }

  const doc: HackathonDoc = {
    id: newId(),
    name: body.name,
    slug,
    description: body.description || '',
    num_teams: numTeams,
    max_per_team: maxPerTeam,
    timeout_minutes: timeoutMin,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    status: 'open',
    created_by: user.id,
    created_at: nowIso(),
    updated_at: nowIso(),
  }
  await col.insertOne(doc)
  const { _id: _omit, ...clean } = doc as HackathonDoc & { _id?: unknown }
  void _omit
  return NextResponse.json(clean, { status: 201 })
}

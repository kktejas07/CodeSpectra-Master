/**
 * /api/hackathons/[id]
 *   GET    -> fetch by id OR slug (`?by=slug`)
 *   PATCH  -> admin/tenant_admin only — update name/desc/timeout/status
 *   DELETE -> admin/tenant_admin only — only if no teams have registered
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/api-auth'
import {
  hackathons,
  hackathonTeams,
  nowIso,
  type HackathonDoc,
} from '@/lib/db/qr-events'

export const runtime = 'nodejs'

function isAdmin(role?: string | null): boolean {
  return ['superadmin', 'admin', 'tenant_admin'].includes((role || '').toLowerCase())
}

async function resolve(idOrSlug: string, by: 'id' | 'slug'): Promise<HackathonDoc | null> {
  const col = await hackathons()
  return (await col.findOne(
    by === 'slug' ? { slug: idOrSlug } : { id: idOrSlug },
    { projection: { _id: 0 } },
  )) as HackathonDoc | null
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const by = (new URL(req.url).searchParams.get('by') === 'slug' ? 'slug' : 'id') as 'id' | 'slug'
  const doc = await resolve(id, by)
  if (!doc) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (doc.status === 'draft' && !isAdmin(user.role)) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  return NextResponse.json(doc)
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id } = await ctx.params
  let body: Partial<HackathonDoc> = {}
  try {
    body = (await req.json()) as Partial<HackathonDoc>
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  const $set: Record<string, unknown> = { updated_at: nowIso() }
  for (const k of ['name', 'description', 'num_teams', 'max_per_team', 'status'] as const) {
    if (k in body) $set[k] = body[k]
  }
  // Recompute ends_at if timeout or starts_at changed.
  const col = await hackathons()
  const cur = await col.findOne({ id })
  if (!cur) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const newTimeout = body.timeout_minutes ?? cur.timeout_minutes
  const newStart = body.starts_at ? new Date(body.starts_at) : new Date(cur.starts_at)
  if (body.timeout_minutes != null || body.starts_at != null) {
    if (Number.isNaN(newStart.getTime())) {
      return NextResponse.json({ error: 'invalid starts_at' }, { status: 400 })
    }
    $set.starts_at = newStart.toISOString()
    $set.timeout_minutes = newTimeout
    $set.ends_at = new Date(newStart.getTime() + newTimeout * 60_000).toISOString()
  }

  await col.updateOne({ id }, { $set })
  const next = await col.findOne({ id }, { projection: { _id: 0 } })
  return NextResponse.json(next)
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id } = await ctx.params
  const teams = await (await hackathonTeams()).countDocuments({ hackathon_id: id })
  if (teams > 0) {
    return NextResponse.json(
      { error: `cannot delete — ${teams} team(s) are registered` },
      { status: 409 },
    )
  }
  await (await hackathons()).deleteOne({ id })
  return NextResponse.json({ ok: true })
}

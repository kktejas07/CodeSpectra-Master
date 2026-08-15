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
  type HackathonFeatures,
  DEFAULT_FEATURES,
} from '@/lib/db/qr-events'

export const runtime = 'nodejs'

function isAdmin(role?: string | null): boolean {
  return ['superadmin', 'admin', 'tenant_admin'].includes((role || '').toLowerCase())
}

function computeStatus(startsAt: string, endsAt: string, currentStatus?: string): 'draft' | 'open' | 'live' | 'closed' {
  if (currentStatus === 'draft') return 'draft'
  if (currentStatus === 'closed') return 'closed'
  const now = Date.now()
  const start = new Date(startsAt).getTime()
  const end = new Date(endsAt).getTime()
  if (now >= end) return 'closed'
  if (now >= start) return 'live'
  return 'open'
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
  // ponytail: auto-compute status only for auto-transitions (open→live when time hits,
  // live→closed when ended). Don't override manually set statuses from PATCH.
  const autoStatus = computeStatus(doc.starts_at, doc.ends_at, doc.status)
  if (autoStatus !== doc.status && (autoStatus === 'closed' || (autoStatus === 'live' && doc.status === 'open'))) {
    await (await hackathons()).updateOne({ id: doc.id }, { $set: { status: autoStatus, updated_at: nowIso() } })
    doc.status = autoStatus
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
  
  // Fetch current document first for validation
  const col = await hackathons()
  const cur = await col.findOne({ id })
  if (!cur) return NextResponse.json({ error: 'not found' }, { status: 404 })
  
  // tenant_admin can only mutate their own tenant's hackathons
  if (user.role === 'tenant_admin' && user.tenantId && cur.tenant_id !== user.tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  
  // Status changes with validation
  if (body.status && typeof body.status === 'string') {
    const validStatuses = ['draft', 'open', 'live', 'closed']
    if (!validStatuses.includes(body.status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }
    const validTransitions: Record<string, string[]> = {
      draft: ['open', 'closed'],
      open: ['live', 'draft', 'closed'],
      live: ['closed', 'open'],
      closed: ['open'],
    }
    if (!validTransitions[cur.status]?.includes(body.status)) {
      return NextResponse.json({ error: `Cannot change status from ${cur.status} to ${body.status}` }, { status: 409 })
    }
    $set.status = body.status
  }

  for (const k of ['name', 'description', 'num_teams', 'max_per_team', 'event_type', 'per_problem_time_minutes', 'cert_template', 'solve_limit', 'grace_period_minutes', 'allow_late_submissions'] as const) {
    if (k in body) $set[k] = body[k]
  }
  if (Array.isArray(body.judges)) {
    $set.judges = body.judges
  }
  
  // Lock tasks, rules, scoring during live/closed
  const hasProtectedFields = body.tasks !== undefined || body.rules !== undefined || body.scoring !== undefined
  if ((cur.status === 'live' || cur.status === 'closed') && hasProtectedFields) {
    return NextResponse.json({ error: 'Cannot modify tasks, rules, or scoring during live/closed event' }, { status: 409 })
  }
  
  // Lock features during live/closed
  if ((cur.status === 'live' || cur.status === 'closed') && body.features) {
    return NextResponse.json({ error: 'Cannot modify features during live/closed event' }, { status: 409 })
  }
  
  if (Array.isArray(body.tasks)) {
    $set.tasks = body.tasks.map((t: any, i: number) => ({
      problem_slug: String(t.problem_slug || ''),
      problem_title: String(t.problem_title || ''),
      points: Number(t.points) || 100,
      difficulty: String(t.difficulty || 'medium'),
      required: t.required !== false,
      order: i,
      ...(typeof t.time_limit_minutes === 'number' ? { time_limit_minutes: t.time_limit_minutes } : {}),
    }))
  }
  if (Array.isArray(body.rules)) {
    $set.rules = body.rules.map((r: any) => ({
      type: (r.type || 'general') as 'scoring' | 'submission' | 'conduct' | 'general',
      title: String(r.title || ''),
      description: String(r.description || ''),
    }))
  }
  if (body.scoring && typeof body.scoring === 'object') {
    const s = body.scoring as any
    $set.scoring = {
      auto_grade: s.auto_grade !== false,
      points_per_problem: Number(s.points_per_problem) || 100,
      bonus_time: Number(s.bonus_time) || 0,
      penalty_per_attempt: Number(s.penalty_per_attempt) || 0,
    }
  }
  if ('banner_url' in body) {
    $set.banner_url = typeof body.banner_url === 'string' ? body.banner_url : ''
  }
  if (body.features && typeof body.features === 'object') {
    $set.features = {
      ...DEFAULT_FEATURES,
      ...body.features,
      rubric_criteria: body.features.rubric_criteria || DEFAULT_FEATURES.rubric_criteria,
      sponsor_tracks: body.features.sponsor_tracks || DEFAULT_FEATURES.sponsor_tracks,
    }
  }
  // Recompute ends_at if timeout or starts_at changed.
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
  // Recalculate status from new dates
  const after = await col.findOne({ id }, { projection: { _id: 0 } })
  if (after) {
    const computed = computeStatus(after.starts_at, after.ends_at, after.status)
    if (computed !== after.status) {
      await col.updateOne({ id }, { $set: { status: computed, updated_at: nowIso() } })
      after.status = computed
    }
  }
  return NextResponse.json(after)
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
  const col = await hackathons()
  const doc = await col.findOne({ id }, { projection: { _id: 0 } })
  if (!doc) return NextResponse.json({ error: 'not found' }, { status: 404 })
  // tenant_admin can only delete their own tenant's hackathons
  if (user.role === 'tenant_admin' && user.tenantId && doc.tenant_id !== user.tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const teams = await (await hackathonTeams()).countDocuments({ hackathon_id: id })
  if (teams > 0 && doc.status !== 'closed') {
    return NextResponse.json(
      { error: `cannot delete — ${teams} team(s) are registered and hackathon is ${doc.status}` },
      { status: 409 },
    )
  }
  await (await hackathons()).deleteOne({ id })
  return NextResponse.json({ ok: true })
}

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
  hackathonSubmissions,
  hackathonClaims,
  hackathonInvites,
  hackathonActivity,
  nowIso,
  type HackathonDoc,
  type HackathonFeatures,
  DEFAULT_FEATURES,
} from '@/lib/db/qr-events'
import { sanitizeJudgingConfig } from '@/lib/hackathons/judge-config'
import { isHackathonStaff } from '@/lib/hackathons/access'
import { requireAdmin } from '@/lib/route-auth'
import { checkTaskProblems, checkNewJudges } from '@/lib/hackathons/admin-checks'

export const runtime = 'nodejs'

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
  // Public read: logged-out visitors can view any non-draft event (sign-in is
  // only needed to register). Drafts are visible to the event's own staff.
  const user = await getAPIUser().catch(() => null)
  const { id } = await ctx.params
  const by = (new URL(req.url).searchParams.get('by') === 'slug' ? 'slug' : 'id') as 'id' | 'slug'
  const doc = await resolve(id, by)
  if (!doc) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const staff = isHackathonStaff(user, doc)
  if (doc.status === 'draft' && !staff) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  // ponytail: auto-compute status only for auto-transitions (open→live when time hits,
  // live→closed when ended). Don't override manually set statuses from PATCH.
  const autoStatus = computeStatus(doc.starts_at, doc.ends_at, doc.status)
  if (autoStatus !== doc.status && (autoStatus === 'closed' || (autoStatus === 'live' && doc.status === 'open'))) {
    await (await hackathons()).updateOne({ id: doc.id }, { $set: { status: autoStatus, updated_at: nowIso() } })
    doc.status = autoStatus
  }
  if (!user) {
    // Anonymous view: no judge ids or creator id.
    const { judges, created_by, ...pub } = doc
    void judges; void created_by
    return NextResponse.json({ ...pub, is_judge: false, is_staff: false })
  }
  // is_staff lets the admin pages tell a company admin when an event isn't theirs to manage.
  return NextResponse.json({ ...doc, is_judge: (doc.judges || []).includes(user.id), is_staff: staff })
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const user = gate.user
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
  
  // Superadmin, or this event's own tenant admin (deny by default).
  if (!isHackathonStaff(user, cur)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Status changes with validation. The edit form always sends the current
  // status, so an unchanged status is a no-op rather than a 409.
  const statusChanged = typeof body.status === 'string' && body.status !== cur.status
  if (statusChanged && typeof body.status === 'string') {
    const validStatuses = ['draft', 'open', 'live', 'closed']
    if (!validStatuses.includes(body.status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }
    const validTransitions: Record<string, string[]> = {
      draft: ['open', 'closed'],
      open: ['live', 'draft', 'closed'],
      live: ['closed', 'open', 'draft'],
      closed: ['open'],
    }
    if (!validTransitions[cur.status]?.includes(body.status)) {
      return NextResponse.json({ error: `Cannot change status from ${cur.status} to ${body.status}` }, { status: 409 })
    }
    if (cur.results_released && body.status !== 'closed') {
      return NextResponse.json({ error: 'Results are released; the event stays closed' }, { status: 409 })
    }
    $set.status = body.status
  }

  const clampInt = (v: unknown, lo: number, hi: number): number | null => {
    const n = Math.round(Number(v))
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : null
  }
  if ('name' in body) {
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : ''
    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    $set.name = name
  }
  if ('description' in body) $set.description = typeof body.description === 'string' ? body.description.slice(0, 20000) : ''
  if ('num_teams' in body) {
    const n = clampInt(body.num_teams, 1, 10000)
    if (n === null) return NextResponse.json({ error: 'num_teams must be a number' }, { status: 400 })
    $set.num_teams = n
  }
  if ('max_per_team' in body) {
    const n = clampInt(body.max_per_team, 1, 50)
    if (n === null) return NextResponse.json({ error: 'max_per_team must be a number' }, { status: 400 })
    $set.max_per_team = n
  }
  if ('event_type' in body) $set.event_type = body.event_type === 'speed_contest' ? 'speed_contest' : 'hackathon'
  if ('per_problem_time_minutes' in body) $set.per_problem_time_minutes = clampInt(body.per_problem_time_minutes, 1, 1440) ?? 30
  if ('cert_template' in body && typeof body.cert_template === 'string') $set.cert_template = body.cert_template.slice(0, 30)
  if ('solve_limit' in body) $set.solve_limit = body.solve_limit == null ? undefined : clampInt(body.solve_limit, 0, 1000) ?? undefined
  if ('grace_period_minutes' in body) $set.grace_period_minutes = clampInt(body.grace_period_minutes, 0, 1440) ?? 0
  if ('allow_late_submissions' in body) $set.allow_late_submissions = body.allow_late_submissions === true
  if (Array.isArray(body.judges)) {
    const judges = [...new Set(body.judges.filter((j): j is string => typeof j === 'string' && j.trim().length > 0).map((j) => j.trim()))].slice(0, 100)
    // Company admins may only add judges from their own organization.
    const judgeError = await checkNewJudges(user, judges, cur.judges || [])
    if (judgeError) return NextResponse.json({ error: judgeError }, { status: 403 })
    $set.judges = judges
  }
  if (body.timeout_minutes != null && clampInt(body.timeout_minutes, 1, 60 * 24 * 60) === null) {
    return NextResponse.json({ error: 'timeout_minutes must be a number' }, { status: 400 })
  }
  // J3/J4 judging config (validated; published to all viewers via GET).
  if ('judging_config' in body) {
    $set.judging_config = sanitizeJudgingConfig(
      (body as unknown as { judging_config?: unknown }).judging_config,
    )
  }
  
  if (Array.isArray(body.tasks)) {
    // Company admins: platform problems + their own organization's only. Tasks
    // already on the event (e.g. added by a superadmin) stay allowed.
    const existingSlugs = new Set((cur.tasks || []).map((t) => t.problem_slug))
    const taskError = await checkTaskProblems(user, body.tasks.map((t: any) => String(t?.problem_slug || '')).filter((s: string) => !existingSlugs.has(s)))
    if (taskError) return NextResponse.json({ error: taskError }, { status: 403 })
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
  const newTimeout = body.timeout_minutes != null ? (clampInt(body.timeout_minutes, 1, 60 * 24 * 60) as number) : cur.timeout_minutes
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
  // Recalculate status from new dates — unless the organiser just set one by hand.
  const after = await col.findOne({ id }, { projection: { _id: 0 } })
  if (after && !statusChanged) {
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
  const gate = await requireAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { id } = await ctx.params
  const col = await hackathons()
  const doc = await col.findOne({ id }, { projection: { _id: 0 } })
  if (!doc) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (!isHackathonStaff(gate.user, doc)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const teams = await (await hackathonTeams()).countDocuments({ hackathon_id: id })
  if (teams > 0 && doc.status !== 'closed') {
    return NextResponse.json(
      { error: `cannot delete — ${teams} team(s) are registered and hackathon is ${doc.status}` },
      { status: 409 },
    )
  }
  // Cascade so a closed event leaves no orphaned teams, submissions, claims or invites.
  await Promise.all([
    (await hackathonTeams()).deleteMany({ hackathon_id: id }),
    (await hackathonSubmissions()).deleteMany({ hackathon_id: id }),
    (await hackathonClaims()).deleteMany({ hackathon_id: id }),
    (await hackathonInvites()).deleteMany({ hackathon_id: id }),
    (await hackathonActivity()).deleteMany({ hackathon_id: id }),
  ])
  await (await hackathons()).deleteOne({ id })
  return NextResponse.json({ ok: true })
}

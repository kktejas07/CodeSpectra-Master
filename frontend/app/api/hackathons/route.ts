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
  type HackathonTask,
  type HackathonRule,
} from '@/lib/db/qr-events'
import { getGeneralSettings } from '@/lib/platform-general-settings-server'

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

export async function GET(req: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const col = await hackathons()
  const isJudgeFilter = req.nextUrl.searchParams.get('judge') === '1'
  const tenantFilter: Record<string, unknown> = user.role === 'tenant_admin'
    ? (user.tenantId ? { tenant_id: user.tenantId } : { _id: null })
    : {}
  const filter: Record<string, unknown> = { ...tenantFilter }
  if (!isAdmin(user.role)) {
    filter.status = { $ne: 'draft' as const }
  }
  if (isJudgeFilter) {
    filter.judges = user.id
  }
  const items = await col
    .find(filter as any, { projection: { _id: 0 } })
    .sort({ created_at: -1 })
    .toArray()

  // Auto-transition status based on dates
  const updates: Promise<void>[] = []
  for (const h of items) {
    const computed = computeStatus(h.starts_at, h.ends_at, h.status)
    if (computed !== h.status) {
      updates.push(
        col.updateOne({ id: h.id }, { $set: { status: computed, updated_at: nowIso() } }).then(() => {})
      )
      h.status = computed
    }
  }
  void updates

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

  const tasks: HackathonTask[] = (body.tasks || []).map((t: any, i: number) => ({
    problem_slug: String(t.problem_slug || ''),
    problem_title: String(t.problem_title || ''),
    points: Number(t.points) || 100,
    difficulty: String(t.difficulty || 'medium'),
    required: t.required !== false,
    order: i,
    ...(typeof t.time_limit_minutes === 'number' ? { time_limit_minutes: t.time_limit_minutes } : {}),
  }))

  const rulesHackathon: HackathonRule[] = (body.rules || []).map((r: any) => ({
    type: (r.type as HackathonRule['type']) || 'general',
    title: String(r.title || ''),
    description: String(r.description || ''),
  }))

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
    status: computeStatus(startsAt.toISOString(), endsAt.toISOString(), body.status || 'open'),
    event_type: body.event_type === 'speed_contest' ? 'speed_contest' : 'hackathon',
    per_problem_time_minutes: Math.min(1440, Math.max(1, Number(body.per_problem_time_minutes) || 30)),
    solve_limit: body.solve_limit ? Number(body.solve_limit) : undefined,
    tasks,
    rules: rulesHackathon,
    scoring: {
      auto_grade: body.scoring?.auto_grade !== false,
      points_per_problem: Number(body.scoring?.points_per_problem) || 100,
      bonus_time: Number(body.scoring?.bonus_time) || 0,
      penalty_per_attempt: Number(body.scoring?.penalty_per_attempt) || 0,
    },
    results_released: false,
    banner_url: body.banner_url || '',
    cert_template: body.cert_template || (await getGeneralSettings()).certificate_template,
    created_by: user.id,
    tenant_id: user.tenantId || null,
    created_at: nowIso(),
    updated_at: nowIso(),
  }
  await col.insertOne(doc)
  const { _id: _omit, ...clean } = doc as HackathonDoc & { _id?: unknown }
  void _omit
  return NextResponse.json(clean, { status: 201 })
}

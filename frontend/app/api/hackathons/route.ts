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
import { gateErrorBody, isAdminCaller, requireAdmin } from '@/lib/route-auth'
import { hackathons, nowIso, type HackathonDoc } from '@/lib/db/qr-events'
import { eventListTenantFilter } from '@/lib/hackathons/tenant-scope'
import { createHackathon, computeHackathonStatus as computeStatus } from '@/lib/services/hackathons'

export const runtime = 'nodejs'


export async function GET(req: NextRequest) {
  const user = await getAPIUser()
  const col = await hackathons()
  const isJudgeFilter = req.nextUrl.searchParams.get('judge') === '1'
  // Company admins: own organization only. Superadmin: everything, or ?tenant=global|<id>.
  const tenantFilter = eventListTenantFilter(user, req.nextUrl.searchParams.get('tenant'))
  const filter: Record<string, unknown> = { ...tenantFilter }
  if (!isAdminCaller(user)) { // SEC-029
    filter.status = { $ne: 'draft' as const }
  }
  if (isJudgeFilter && user) {
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
    // Same rule as GET /api/hackathons/[id]: only time-driven moves (open→live,
    // anything→closed at the end) — never undo a status an organiser set by hand.
    if (computed !== h.status && (computed === 'closed' || (computed === 'live' && h.status === 'open'))) {
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
  // SEC-029: shared guard (admin 2FA; a tenant admin without a tenant is refused,
  // so no unowned global event can be created).
  const gate = await requireAdmin()
  if ('error' in gate) return NextResponse.json(gateErrorBody(gate), { status: gate.status })
  const user = gate.user

  let body: Partial<HackathonDoc> = {}
  try {
    body = (await req.json()) as Partial<HackathonDoc>
  } catch {
    return NextResponse.json({ error: 'invalid JSON', code: 'invalid_json' }, { status: 400 })
  }

  // Validation, problem checks and the new doc: lib/services/hackathons (shared with the admin agent).
  const r = await createHackathon(user, body)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  return NextResponse.json(r.data, { status: 201 })
}

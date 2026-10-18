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
} from '@/lib/db/qr-events'
import { isHackathonStaff } from '@/lib/hackathons/access'
import { requireAdmin } from '@/lib/route-auth'
import { knowledgeOnEventChange } from '@/lib/rag/hooks'
import { updateHackathon, computeHackathonStatus } from '@/lib/services/hackathons'

export const runtime = 'nodejs'

const computeStatus = computeHackathonStatus

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

  // Validation, transitions, problem / judge rules: lib/services/hackathons (shared with the admin agent).
  const r = await updateHackathon(user, id, body)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  return NextResponse.json(r.data)
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
  knowledgeOnEventChange('hackathon', id)
  return NextResponse.json({ ok: true })
}

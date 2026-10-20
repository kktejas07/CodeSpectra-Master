import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { newId, nowIso } from '@/lib/db/ids'
import { auditAdmin } from '@/lib/admin-audit'

export async function GET() {
  const gate = await requireAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    const db = await getMongoDb()
    const filter: Record<string, unknown> = {}
    if (gate.user.role === 'tenant_admin') {
      // A tenant admin with no tenant owns no teams.
      if (!gate.user.tenantId) return NextResponse.json({ data: [] })
      filter.$or = [{ tenant_id: gate.user.tenantId }, { tenantId: gate.user.tenantId }]
    }
    const data = await db.collection('teams').find(filter, { projection: { _id: 0, name_key: 0 } }).toArray()
    return NextResponse.json({ data })
  } catch (e) {
    console.error('[CodeSpectra] admin/teams GET:', e)
    return NextResponse.json({ error: 'Failed to load teams' }, { status: 500 })
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * POST /api/admin/teams — create a team inside an organisation.
 * - superadmin: any organisation (`tenantId` required)
 * - tenant_admin: always their own organisation (body `tenantId` ignored)
 * Body: { name, tenantId?, adminEmail } — the admin must be an existing user
 * of that organisation.
 */
export async function POST(request: NextRequest) {
  const gate = await requireAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  let body: { name?: unknown; tenantId?: unknown; adminEmail?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : ''
  if (name.length < 2 || name.length > 80) {
    return NextResponse.json({ error: 'Team name must be 2 to 80 characters.' }, { status: 400 })
  }
  const adminEmail = typeof body.adminEmail === 'string' ? body.adminEmail.trim().toLowerCase() : ''
  if (!EMAIL_RE.test(adminEmail) || adminEmail.length > 254) {
    return NextResponse.json({ error: 'Enter a valid admin email.' }, { status: 400 })
  }

  let tenantId: string | null
  if (gate.user.role === 'superadmin') {
    tenantId = typeof body.tenantId === 'string' && body.tenantId.trim() ? body.tenantId.trim() : null
    if (!tenantId) return NextResponse.json({ error: 'Choose an organisation.' }, { status: 400 })
  } else {
    tenantId = gate.user.tenantId ?? null
    if (!tenantId) {
      return NextResponse.json({ error: 'You must belong to an organisation to create teams.' }, { status: 403 })
    }
  }

  try {
    const db = await getMongoDb()
    const tenant = await db.collection('tenants').findOne({ id: tenantId }, { projection: { id: 1, name: 1, is_active: 1 } })
    if (!tenant) return NextResponse.json({ error: 'Organisation not found.' }, { status: 404 })

    const adminUser = await db.collection('user').findOne(
      { email: adminEmail },
      { projection: { id: 1, _id: 1, email: 1, name: 1, fullName: 1, tenantId: 1, organizationId: 1 } },
    )
    const adminTenant = (adminUser?.tenantId as string | null) ?? (adminUser?.organizationId as string | null) ?? null
    if (!adminUser || adminTenant !== tenantId) {
      return NextResponse.json(
        { error: 'No member with that email in this organisation. Add them as a member first.' },
        { status: 400 },
      )
    }

    const adminUserId = String(adminUser.id ?? adminUser._id)
    const nameKey = `${tenantId}:${name.toLowerCase()}`
    const now = nowIso()
    const doc = {
      id: newId(),
      name,
      name_key: nameKey,
      tenant_id: tenantId,
      tenant_name: (tenant.name as string) || '',
      admin: adminEmail,
      admin_user_id: adminUserId,
      member_ids: [adminUserId],
      members: 1,
      status: 'active',
      created_by: gate.user.id,
      created_at: now,
      updated_at: now,
    }

    // Upsert keyed on (tenant, lower-cased name) so a double submit can't
    // create two teams with the same name in one organisation.
    const res = await db.collection('teams').updateOne(
      { name_key: nameKey },
      { $setOnInsert: doc },
      { upsert: true },
    )
    if (!res.upsertedCount) {
      return NextResponse.json({ error: 'A team with that name already exists in this organisation.' }, { status: 409 })
    }

    const { name_key: _omit, ...data } = doc
    void _omit
    await auditAdmin(gate.user, 'admin.team.create', 'team', `team/${String(doc.id)}`)
    return NextResponse.json({ data }, { status: 201 })
  } catch (e) {
    console.error('[CodeSpectra] admin/teams POST:', e)
    return NextResponse.json({ error: 'Failed to create team' }, { status: 500 })
  }
}

/** Team the caller may manage: superadmin any, tenant_admin only their own organisation's. */
async function manageableTeam(db: Awaited<ReturnType<typeof getMongoDb>>, id: string, user: { role: string; tenantId?: string | null }) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null
  const team = await db.collection('teams').findOne({ id })
  if (!team) return null
  if (user.role !== 'superadmin' && (!user.tenantId || (team.tenant_id ?? team.tenantId) !== user.tenantId)) return null
  return team
}

/**
 * PATCH /api/admin/teams?id= — rename, add or remove a member (D23).
 * Body: { name? , addMemberEmail?, removeMemberId? }. Members must belong to
 * the team's organisation; the team admin can't be removed.
 */
export async function PATCH(request: NextRequest) {
  const gate = await requireAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const id = request.nextUrl.searchParams.get('id') || ''
  const body = (await request.json().catch(() => ({}))) as { name?: unknown; addMemberEmail?: unknown; removeMemberId?: unknown }
  try {
    const db = await getMongoDb()
    const team = await manageableTeam(db, id, gate.user)
    if (!team) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const tenantId = String(team.tenant_id ?? team.tenantId)
    const now = nowIso()

    if (typeof body.name === 'string') {
      const name = body.name.trim().replace(/\s+/g, ' ')
      if (name.length < 2 || name.length > 80) return NextResponse.json({ error: 'Team name must be 2 to 80 characters.' }, { status: 400 })
      const nameKey = `${tenantId}:${name.toLowerCase()}`
      const clash = await db.collection('teams').findOne({ name_key: nameKey, id: { $ne: id } }, { projection: { _id: 1 } })
      if (clash) return NextResponse.json({ error: 'A team with that name already exists in this organisation.' }, { status: 409 })
      await db.collection('teams').updateOne({ id }, { $set: { name, name_key: nameKey, updated_at: now } })
    }
    if (typeof body.addMemberEmail === 'string') {
      const email = body.addMemberEmail.trim().toLowerCase()
      if (!EMAIL_RE.test(email)) return NextResponse.json({ error: 'Enter a valid email.' }, { status: 400 })
      const u = await db.collection('user').findOne({ email }, { projection: { id: 1, _id: 1, tenantId: 1, organizationId: 1 } })
      const uTenant = (u?.tenantId as string | null) ?? (u?.organizationId as string | null) ?? null
      if (!u || uTenant !== tenantId) return NextResponse.json({ error: 'No member with that email in this organisation.' }, { status: 400 })
      const uid = String(u.id ?? u._id)
      await db.collection('teams').updateOne({ id, member_ids: { $ne: uid } }, { $push: { member_ids: uid } as never, $inc: { members: 1 }, $set: { updated_at: now } })
    }
    if (typeof body.removeMemberId === 'string') {
      if (body.removeMemberId === team.admin_user_id) return NextResponse.json({ error: "The team admin can't be removed." }, { status: 400 })
      await db.collection('teams').updateOne({ id, member_ids: body.removeMemberId }, { $pull: { member_ids: body.removeMemberId } as never, $inc: { members: -1 }, $set: { updated_at: now } })
    }
    await auditAdmin(gate.user, 'admin.team.update', 'team', `team/${id}`, Object.keys(body).join(', '))
    const data = await db.collection('teams').findOne({ id }, { projection: { _id: 0, name_key: 0 } })
    return NextResponse.json({ data })
  } catch (e) {
    console.error('[CodeSpectra] admin/teams PATCH:', e)
    return NextResponse.json({ error: 'Failed to update team' }, { status: 500 })
  }
}

/** DELETE /api/admin/teams?id= — delete a team (members keep their accounts). */
export async function DELETE(request: NextRequest) {
  const gate = await requireAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    const db = await getMongoDb()
    const id = request.nextUrl.searchParams.get('id') || ''
    const team = await manageableTeam(db, id, gate.user)
    if (!team) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    await db.collection('teams').deleteOne({ id })
    await auditAdmin(gate.user, 'admin.team.delete', 'team', `team/${id}`, undefined, 'warning')
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[CodeSpectra] admin/teams DELETE:', e)
    return NextResponse.json({ error: 'Failed to delete team' }, { status: 500 })
  }
}

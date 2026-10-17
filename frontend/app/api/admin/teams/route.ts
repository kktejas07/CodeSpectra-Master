import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { newId, nowIso } from '@/lib/db/ids'

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
    return NextResponse.json({ data }, { status: 201 })
  } catch (e) {
    console.error('[CodeSpectra] admin/teams POST:', e)
    return NextResponse.json({ error: 'Failed to create team' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/route-auth'
import { users as getUsersCollection } from '@/lib/db/admin'
import bcrypt from 'bcryptjs'
import { getAdminAuthInstance } from '@/lib/firebase-admin'
import { getMongoDb } from '@/lib/mongodb'
import { sendEmail } from '@/lib/send-email'
import { emailTemplates } from '@/lib/email-templates'

function parseEmail(s: string | null | undefined): string | null {
  const e = (s || '').trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null
}

export async function GET(req: NextRequest) {
  const gate = await requireAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  try {
    const { searchParams } = new URL(req.url)
    const statsOnly = searchParams.get('stats') === 'true'
    const userCol = await getUsersCollection()

    // Resolve the caller's own tenant — that scopes the org view.
    const me = await userCol.findOne({ id: gate.user.id })
    let tenantId: string | null = (me?.tenantId as string | null) ?? null
    if (!tenantId) tenantId = (me?.organizationId as string | null) ?? null

    // Superadmin may pass ?tenantId= to inspect any org; tenant admins are always scoped to theirs.
    const requested = searchParams.get('tenantId')
    if (gate.user.role === 'superadmin' && requested && requested !== 'all') {
      tenantId = requested
    }
    if (gate.user.role === 'superadmin' && requested === 'all') tenantId = null

    if (!tenantId) {
      return NextResponse.json({
        data: [],
        stats: { total: 0, active: 0, scans: 0, challenges: 0 },
        error: gate.user.role === 'superadmin' ? undefined : 'You must belong to an organization to manage members.',
      })
    }

    const members = await userCol
      .find({ tenantId })
      .sort({ createdAt: -1 })
      .toArray()

    const data = members.map((u) => ({
      id: u.id || String(u._id),
      name: u.fullName ?? u.name ?? ((u.email || '').split('@')[0] || 'User'),
      email: u.email || '',
      role: (u.role as string) || 'user',
      joinedAt: typeof u.createdAt === 'string' ? u.createdAt : u.createdAt?.toISOString?.() ?? '',
      status: (u as any).status === 'inactive' ? 'inactive' : 'active',
    }))

    if (statsOnly) {
      return NextResponse.json({
        data,
        stats: {
          total: data.length,
          active: data.filter((m) => m.status === 'active').length,
          scans: 0,
          challenges: 0,
        },
      })
    }

    return NextResponse.json({ data })
  } catch (e: unknown) {
    const msg = 'Failed'
    console.error('[CodeSpectra] admin/teams/members GET:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/**
 * POST /api/admin/teams/members — tenant_admin creates a member in their own
 * tenant (always role `user`; tenant admins cannot promote roles).
 */
export async function POST(request: NextRequest) {
  const gate = await requireAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  let body: { email?: string; name?: string; password?: string; tenantId?: string; role?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const email = parseEmail(body.email)
  if (!email) {
    return NextResponse.json({ error: 'Valid email is required' }, { status: 400 })
  }

  try {
    const userCol = await getUsersCollection()
    const me = await userCol.findOne({ id: gate.user.id })
    let tenantId: string | null = (me?.tenantId as string | null) ?? null
    if (!tenantId) tenantId = (me?.organizationId as string | null) ?? null

    if (gate.user.role === 'superadmin' && body.tenantId) tenantId = body.tenantId
    if (!tenantId) {
      return NextResponse.json(
        { error: 'You must belong to an organization to add members.' },
        { status: 400 },
      )
    }

    // Superadmin may provision the new member as an org admin; tenant admins always add plain users.
    const requestedRole = (body.role || '').trim().toLowerCase()
    const memberRole = gate.user.role === 'superadmin' && requestedRole === 'tenant_admin' ? 'tenant_admin' : 'user'

    const existing = await userCol.findOne({ email })
    if (existing) {
      const isSuperAdminCaller = gate.user.role === 'superadmin'
      // Cross-tenant takeover guard: a non-superadmin may not pull a user that
      // belongs to another organization into their own (would overwrite tenantId
      // and demote foreign admins to 'user').
      const victimTenant =
        ((existing.tenantId as string | null) ?? (existing.organizationId as string | null) ?? null)
      if (!isSuperAdminCaller && victimTenant && victimTenant !== tenantId) {
        return NextResponse.json(
          { error: 'user belongs to another organization' },
          { status: 403 },
        )
      }
      // Never touch the tenantId (or role) of an existing superadmin.
      const setUpdate: Record<string, unknown> = { updatedAt: new Date() }
      if (existing.role !== 'superadmin') {
        setUpdate.tenantId = tenantId
        setUpdate.role = memberRole
      }
      await userCol.updateOne({ email }, { $set: setUpdate })
      return NextResponse.json({ user: { id: existing.id || String(existing._id), email, already_existed: true } }, { status: 200 })
    }

    // Create via Firebase first (password hashing + account linkage)
    const adminAuth = await getAdminAuthInstance()
    let newUserId: string
    if (adminAuth) {
      try {
        const rec = await adminAuth.createUser({
          email,
          password: body.password && body.password.length >= 8 ? body.password : undefined,
          displayName: (body.name || '').trim() || email.split('@')[0] || 'User',
        })
        newUserId = rec.uid
      } catch (e: any) {
        if (e?.code === 'auth/email-already-exists') {
          const existingUser = await adminAuth.getUserByEmail(email)
          await userCol.updateOne(
            { email },
            { $set: { tenantId, updatedAt: new Date() } },
          )
          return NextResponse.json({ user: { id: existingUser.uid, email, already_existed: true } }, { status: 200 })
        }
        throw e
      }
    } else {
      newUserId = `local-${crypto.randomUUID()}`
    }

    const db = await getMongoDb()
    const passwordHash = await bcrypt.hash(
      body.password && body.password.length >= 8 ? body.password : `temp-${Math.random().toString(36).slice(2)}A1!`,
      10,
    )
    const fullName = (body.name || '').trim() || email.split('@')[0] || 'User'

    await db.collection('user').updateOne(
      { email },
      {
        $set: {
          id: newUserId,
          email,
          name: fullName,
          fullName,
          passwordHash,
          role: memberRole,
          tenantId,
          updatedAt: new Date(),
        },
        $setOnInsert: { _id: newUserId, createdAt: new Date() },
      },
      { upsert: true },
    )

    // Send welcome email with credentials
    const tempPassword = body.password && body.password.length >= 8 ? body.password : null
    try {
      const { tenants: tenantsCol } = await import('@/lib/db/admin')
      const tenantDoc = await (await tenantsCol()).findOne({ id: tenantId })
      const orgName = tenantDoc?.name || 'your organization'
      const emailResult = await sendEmail(
        email,
        emailTemplates.accountCredentials({
          name: fullName,
          email,
          orgName,
          role: memberRole === 'tenant_admin' ? 'Organization Admin' : 'Team Member',
        }),
      )

    } catch (e) {
      console.error(`[Members] Welcome email to ${email} failed:`, e)
    }

    return NextResponse.json({ user: { id: newUserId, email, full_name: fullName, role: memberRole, tenant_id: tenantId } }, { status: 201 })
  } catch (e: unknown) {
    const msg = 'Failed to add member'
    console.error('[CodeSpectra] admin/teams/members POST:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

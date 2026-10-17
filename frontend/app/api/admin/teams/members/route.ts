import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, type APIUser } from '@/lib/route-auth'
import { createOrgInvitation, checkSeatLimit } from '@/lib/org-invitations'
import { auditAdmin } from '@/lib/admin-audit'
import crypto from 'node:crypto'
import { users as getUsersCollection, tenants } from '@/lib/db/admin'
import bcrypt from 'bcryptjs'
import { normalizeUserRole } from '@/lib/rbac'
import { existingAccountInviteAction, passwordProblem } from '@/lib/auth-account'
import { revokeAllUserSessions } from '@/lib/session'
import { issuePasswordSetupLink, accountSetupEmail } from '@/lib/auth-setup-link'
import { sendEmail } from '@/lib/send-email'
import { emailTemplates } from '@/lib/email-templates'

/** Existing accounts join only by accepting an invitation (D30/D31). */
async function inviteExisting(caller: APIUser, tenantId: string, email: string, role: 'user' | 'tenant_admin') {
  const seatDenied = await checkSeatLimit(caller, tenantId)
  if (seatDenied) return NextResponse.json(seatDenied, { status: 402 })
  const { invitation, emailed } = await createOrgInvitation({
    tenantId,
    email,
    role,
    invitedBy: { id: caller.id, name: caller.fullName || caller.name, email: caller.email },
  })
  await auditAdmin(caller, 'admin.org.invite', 'organization', `tenant/${tenantId}`, `${email} as ${role}`)
  return NextResponse.json({ invited: true, emailed, invitation }, { status: 202 })
}

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
 * POST /api/admin/teams/members — add someone to an organisation.
 *
 * - New email: creates the account in the org (role `user`; a superadmin may
 *   choose `tenant_admin`). No password given ⇒ a set-password link is sent.
 * - Existing account already in this org: nothing changes.
 * - Existing account with no org: a tenant admin can't move it silently — an
 *   organisation invitation is emailed and the person must accept it.
 * - Account in another org, or a superadmin: refused (superadmins may move
 *   accounts between orgs, never a superadmin).
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
    const isSuper = gate.user.role === 'superadmin'
    let tenantId: string | null = isSuper
      ? (typeof body.tenantId === 'string' && body.tenantId.trim()) || gate.user.tenantId || null
      : gate.user.tenantId || null
    if (!tenantId) {
      return NextResponse.json({ error: 'You must belong to an organization to add members.' }, { status: 400 })
    }
    const tenantDoc = await (await tenants()).findOne({ id: tenantId })
    if (!tenantDoc || tenantDoc.is_active === false) {
      return NextResponse.json({ error: 'Organization not found or not active' }, { status: 400 })
    }
    tenantId = tenantDoc.id
    const orgName = tenantDoc.name || 'your organization'

    // Superadmin may provision the new member as an org admin; tenant admins always add plain users.
    const requestedRole = (body.role || '').trim().toLowerCase()
    const memberRole = isSuper && requestedRole === 'tenant_admin' ? 'tenant_admin' : 'user'

    const userCol = await getUsersCollection()
    const escaped = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const existing = await userCol.findOne({ $or: [{ email }, { email: { $regex: `^${escaped}$`, $options: 'i' } }] } as never)
    if (existing) {
      const existingId = existing.id || String(existing._id)
      const action = existingAccountInviteAction({ role: gate.user.role, tenantId }, existing)
      if (action === 'forbidden') {
        return NextResponse.json({ error: 'This person belongs to another organization.' }, { status: 403 })
      }
      if (action === 'needs_consent') {
        return inviteExisting(gate.user, tenantId, email, 'user')
      }
      // link: superadmin, or already a member of this org
      if (isSuper && normalizeUserRole(existing.role) !== 'superadmin') {
        const set: Record<string, unknown> = {}
        if ((existing.tenantId ?? existing.organizationId ?? null) !== tenantId) set.tenantId = tenantId
        if (memberRole === 'tenant_admin' && normalizeUserRole(existing.role) !== 'tenant_admin') set.role = 'tenant_admin'
        if (Object.keys(set).length) {
          await userCol.updateOne({ _id: existing._id } as never, { $set: { ...set, updatedAt: new Date() } })
          await revokeAllUserSessions(existingId).catch(() => {})
          await auditAdmin(gate.user, 'admin.member.move', 'user', `user/${existingId}`, Object.entries(set).map(([k, v]) => `${k}=${String(v)}`).join(' '), 'warning')
        }
      }
      return NextResponse.json({ user: { id: existingId, email, already_existed: true } }, { status: 200 })
    }

    const fullName = (body.name || '').trim().slice(0, 120) || email.split('@')[0] || 'User'
    const password = typeof body.password === 'string' && body.password ? body.password : ''
    if (password) {
      const problem = passwordProblem(password)
      if (problem) return NextResponse.json({ error: problem }, { status: 400 })
    }

    const seatDenied = await checkSeatLimit(gate.user, tenantId)
    if (seatDenied) return NextResponse.json(seatDenied, { status: 402 })

    // Sign-in is local (bcrypt) — no Firebase user needed.
    const newUserId = crypto.randomUUID()
    const now = new Date()
    await userCol.insertOne({
      _id: newUserId,
      id: newUserId,
      email,
      name: fullName,
      fullName,
      ...(password ? { passwordHash: await bcrypt.hash(password, 12) } : {}),
      role: memberRole,
      tenantId,
      emailVerified: false,
      session_version: 1,
      createdAt: now,
      updatedAt: now,
    } as never)

    const roleName = memberRole === 'tenant_admin' ? 'Organization Admin' : 'Team Member'
    let emailSent = false
    try {
      if (password) {
        const r = await sendEmail(email, emailTemplates.accountCredentials({ name: fullName, email, orgName, role: roleName }))
        emailSent = !!r?.success
      } else {
        const hours = 72
        const setupUrl = await issuePasswordSetupLink(newUserId, hours)
        const r = await sendEmail(email, accountSetupEmail({ name: fullName, orgName, role: roleName, setupUrl, validHours: hours }))
        emailSent = !!r?.success
      }
    } catch (e) {
      console.error(`[Members] Welcome email to ${email} failed:`, e)
    }

    await auditAdmin(gate.user, 'admin.member.create', 'user', `user/${newUserId}`, `email=${email} role=${memberRole} tenant=${tenantId}`)
    return NextResponse.json({ user: { id: newUserId, email, full_name: fullName, role: memberRole, tenant_id: tenantId }, welcomeEmailSent: emailSent }, { status: 201 })
  } catch (e: unknown) {
    const msg = 'Failed to add member'
    console.error('[CodeSpectra] admin/teams/members POST:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

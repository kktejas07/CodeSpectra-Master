import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import type { Filter } from 'mongodb'
import { requireSuperAdmin } from '@/lib/api-auth'
import { getAdminAuthInstance } from '@/lib/firebase-admin'
import { getUserById, updateUserById, deleteUserById, users } from '@/lib/db/admin'
import { revokeAllUserSessions, invalidateAuthProfile } from '@/lib/session'
import { passwordProblem, stripUserSecrets } from '@/lib/auth-account'
import { issuePasswordSetupLink } from '@/lib/auth-setup-link'
import { auditAdmin } from '@/lib/admin-audit'
import { normalizeUserRole } from '@/lib/rbac'
import { getMongoDb } from '@/lib/mongodb'
import { sendEmail } from '@/lib/send-email'
import { emailTemplates } from '@/lib/email-templates'
import { sanitizeMongoInput } from '@/lib/mongo-sanitize'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  const { userId } = await params
  const user = await getUserById(userId)
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }
  // Deny-list every secret (TOTP, reset/verification hashes, biometric template).
  return NextResponse.json(stripUserSecrets(user as unknown as Record<string, unknown>))
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  const { userId } = await params

  let body: { role?: string; full_name?: string; status?: string; plan?: string; password?: string; email?: string; tenantId?: string | null }
  try {
    body = sanitizeMongoInput(await request.json())
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const target = await getUserById(userId)
  if (!target) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }
  const targetId = String(target.id || target._id)
  const isSelf = targetId === gate.user.id
  const currentRole = normalizeUserRole(target.role)

  const updates: Record<string, unknown> = {}
  if (body.role !== undefined) updates.role = normalizeUserRole(body.role)
  if (body.full_name !== undefined) updates.fullName = String(body.full_name).trim().slice(0, 120)
  if (body.status !== undefined) updates.status = body.status === 'active' ? 'active' : 'inactive'
  if (body.plan !== undefined) updates.plan = typeof body.plan === 'string' ? body.plan.slice(0, 60) : null

  // Never lock the platform out: no self-demotion / self-deactivation, and
  // the last superadmin can't be demoted or deactivated.
  const demotingSuper = currentRole === 'superadmin' && updates.role !== undefined && updates.role !== 'superadmin'
  const deactivating = updates.status === 'inactive'
  if (isSelf && (demotingSuper || deactivating)) {
    return NextResponse.json({ error: 'You can’t demote or deactivate your own account.' }, { status: 400 })
  }
  if (currentRole === 'superadmin' && (demotingSuper || deactivating)) {
    const others = await (await users()).countDocuments({ role: 'superadmin', _id: { $ne: target._id }, status: { $ne: 'inactive' } } as never)
    if (others === 0) {
      return NextResponse.json({ error: 'This is the only active superadmin. Promote someone else first.' }, { status: 409 })
    }
  }
  if (body.tenantId !== undefined) {
    if (body.tenantId === null || body.tenantId === '') {
      updates.tenantId = null
    } else {
      const { tenants } = await import('@/lib/db/admin')
      const tenantCol = await tenants()
      const tenant = await tenantCol.findOne({ id: body.tenantId })
      if (!tenant) {
        return NextResponse.json({ error: 'Tenant not found' }, { status: 400 })
      }
      updates.tenantId = tenant.id
    }
  }
  const finalRole = (updates.role as string | undefined) ?? currentRole
  const finalTenant = updates.tenantId !== undefined ? updates.tenantId : (target.tenantId ?? target.organizationId ?? null)
  if (finalRole === 'tenant_admin' && !finalTenant) {
    return NextResponse.json({ error: 'An organization admin needs an organization. Pick one first.' }, { status: 400 })
  }

  if (body.password !== undefined) {
    const problem = passwordProblem(body.password)
    if (problem) {
      return NextResponse.json({ error: problem }, { status: 400 })
    }
    const passwordHash = await bcrypt.hash(body.password, 12)
    const db = await getMongoDb()
    await db.collection('user').updateOne(
      { $or: [{ _id: userId }, { id: userId }] } as Filter<any>,
      { $set: { passwordHash, updatedAt: new Date() } },
    )
    const adminAuth = await getAdminAuthInstance()
    if (adminAuth) {
      try {
        await adminAuth.updateUser(userId, { password: body.password })
      } catch { /* Firebase may not have this user */ }
    }
  }

  if (body.email !== undefined) {
    const email = body.email.trim().toLowerCase()
    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
    }
    const db = await getMongoDb()
    const existing = await db.collection('user').findOne({ email, _id: { $ne: target._id } } as Filter<any>)
    if (existing) {
      return NextResponse.json({ error: 'Email already in use' }, { status: 400 })
    }
    await db.collection('user').updateOne(
      { $or: [{ _id: userId }, { id: userId }] } as Filter<any>,
      { $set: { email, updatedAt: new Date() } },
    )
    const adminAuth = await getAdminAuthInstance()
    if (adminAuth) {
      try {
        await adminAuth.updateUser(userId, { email })
      } catch { /* Firebase may not have this user */ }
    }
  }

  if (Object.keys(updates).length > 0) {
    try {
      await updateUserById(userId, updates as any)
    } catch (e: unknown) {
      console.error('[CodeSpectra] admin/users PATCH:', e)
      return NextResponse.json({ error: 'Update failed' }, { status: 500 })
    }
  }

  // Role, status, tenant, email or password changes end every existing
  // session, so the old privileges (or the old password) stop working now.
  const roleChanged = updates.role !== undefined && updates.role !== currentRole
  const tenantChanged = updates.tenantId !== undefined && updates.tenantId !== (target.tenantId ?? null)
  const securityChange = roleChanged || tenantChanged || deactivating || body.password !== undefined || body.email !== undefined
  if (securityChange) await revokeAllUserSessions(targetId)
  else invalidateAuthProfile(targetId)
  // W4-08: their scheduled copilot reports stop (the run-time check would too).
  if (roleChanged || tenantChanged || deactivating) {
    const { disableSchedulesCreatedBy } = await import('@/lib/agent/schedule-guard')
    await disableSchedulesCreatedBy(targetId).catch(() => 0)
  }

  const changed = [
    ...Object.keys(updates).map((k) => (k === 'role' || k === 'status' || k === 'tenantId' ? `${k}=${String(updates[k])}` : k)),
    ...(body.password !== undefined ? ['password'] : []),
    ...(body.email !== undefined ? ['email'] : []),
  ]
  await auditAdmin(gate.user, 'admin.user.update', 'user', `user/${targetId}`, changed.join(' '), securityChange ? 'warning' : 'info')

  return NextResponse.json({ ok: true })
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  const { userId } = await params
  const user = await getUserById(userId)
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  // Same page and token rules as forgot-password (/auth/reset-password?code=);
  // also re-arms reset_token_used, which made a second admin reset link fail.
  const resetUrl = await issuePasswordSetupLink(user._id, 1)
  const template = emailTemplates.passwordReset(resetUrl)
  try {
    await sendEmail(user.email!, template)
  } catch (e) {
    console.error('[admin/users] reset email failed:', e)
    return NextResponse.json({ error: 'Couldn’t send the reset email. Try again.' }, { status: 502 })
  }
  await auditAdmin(gate.user, 'admin.user.password_reset_link', 'user', `user/${String(user.id || user._id)}`, 'reset link emailed', 'warning')

  return NextResponse.json({ ok: true, message: 'Password reset email sent' })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  const target = await getUserById(userId)
  if (!target) {
    return NextResponse.json({ error: 'User not found or already deleted' }, { status: 404 })
  }
  const targetId = String(target.id || target._id)
  if (targetId === gate.user.id) {
    return NextResponse.json({ error: 'You can’t delete your own account here.' }, { status: 400 })
  }
  if (normalizeUserRole(target.role) === 'superadmin') {
    const others = await (await users()).countDocuments({ role: 'superadmin', _id: { $ne: target._id } } as never)
    if (others === 0) {
      return NextResponse.json({ error: 'This is the only superadmin. Promote someone else first.' }, { status: 409 })
    }
  }

  // End every session before the account disappears (the token would
  // otherwise keep working until it expires).
  await revokeAllUserSessions(targetId).catch(() => {})
  await import('@/lib/agent/schedule-guard').then((m) => m.disableSchedulesCreatedBy(targetId)).catch(() => 0)

  try {
    const adminAuth = await getAdminAuthInstance()
    if (adminAuth) {
      const ids = new Set([userId, targetId, target.firebase_uid].filter((x): x is string => typeof x === 'string' && !!x))
      for (const id of ids) {
        try {
          await adminAuth.deleteUser(id)
        } catch (e: any) {
          if (e?.code !== 'auth/user-not-found') console.error('[admin/users] Firebase delete failed:', e)
        }
      }
    }
  } catch {
    // Firebase optional
  }

  try {
    const deleted = await deleteUserById(userId)
    if (!deleted) {
      return NextResponse.json({ error: 'User not found or already deleted' }, { status: 404 })
    }
    invalidateAuthProfile(targetId)
    await auditAdmin(gate.user, 'admin.user.delete', 'user', `user/${targetId}`, `email=${target.email}`, 'critical')
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    console.error('[CodeSpectra] admin/users DELETE:', e)
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }
}

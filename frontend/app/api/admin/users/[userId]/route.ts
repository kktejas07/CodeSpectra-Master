import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import type { Filter } from 'mongodb'
import { requireSuperAdmin } from '@/lib/api-auth'
import { getAdminAuthInstance } from '@/lib/firebase-admin'
import { getUserById, updateUserById, deleteUserById, users } from '@/lib/db/admin'
import { normalizeUserRole } from '@/lib/rbac'
import { getMongoDb } from '@/lib/mongodb'
import { sendEmail } from '@/lib/send-email'
import { emailTemplates } from '@/lib/email-templates'

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
  const safe: Record<string, unknown> = { ...(user as unknown as Record<string, unknown>) }
  delete safe.passwordHash
  return NextResponse.json(safe)
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
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  if (body.role !== undefined) updates.role = normalizeUserRole(body.role)
  if (body.full_name !== undefined) updates.fullName = body.full_name.trim()
  if (body.status !== undefined) updates.status = body.status === 'active' ? 'active' : 'inactive'
  if (body.plan !== undefined) updates.plan = body.plan
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

  if (body.password !== undefined) {
    if (body.password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
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
    const existing = await db.collection('user').findOne({ email, $or: [{ _id: { $ne: userId } }, { id: { $ne: userId } }] } as Filter<any>)
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
      const msg = e instanceof Error ? e.message : 'Update failed'
      return NextResponse.json({ error: msg }, { status: 500 })
    }
  }

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

  const resetToken = crypto.randomBytes(32).toString('hex')
  const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex')
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()

  const db = await getMongoDb()
  await db.collection('user').updateOne(
    { $or: [{ _id: userId }, { id: userId }] } as Filter<any>,
    { $set: { reset_token_hash: hashedToken, reset_token_expires: expiresAt } },
  )

  const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://codespectra.ai'}/reset-password?code=${resetToken}`
  const template = emailTemplates.passwordReset(resetUrl)
  await sendEmail(user.email!, template)

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

  try {
    const adminAuth = await getAdminAuthInstance()
    if (adminAuth) {
      try {
        await adminAuth.deleteUser(userId)
      } catch (e: any) {
        if (e?.code !== 'auth/user-not-found') throw e
      }
    }
  } catch {
    // Firebase delete failed, try MongoDB delete below
  }

  try {
    const deleted = await deleteUserById(userId)
    if (!deleted) {
      return NextResponse.json({ error: 'User not found or already deleted' }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Delete failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

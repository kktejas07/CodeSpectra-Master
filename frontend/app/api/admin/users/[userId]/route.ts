import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/api-auth'
import { getAdminAuthInstance } from '@/lib/firebase-admin'
import { getUserById, updateUserById, deleteUserById } from '@/lib/db/admin'
import { normalizeUserRole } from '@/lib/rbac'

export async function PATCH(
  request: Request,
  { params }: { params: { userId: string } }
) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  const userId = params.userId

  let body: { role?: string; full_name?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  if (body.role !== undefined) {
    updates.role = normalizeUserRole(body.role)
  }
  if (body.full_name !== undefined) {
    updates.fullName = body.full_name.trim()
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  try {
    await updateUserById(userId, updates)
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Update failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { userId: string } }
) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  try {
    const adminAuth = await getAdminAuthInstance()
    if (adminAuth) {
      try {
        await adminAuth.deleteUser(params.userId)
      } catch (e: any) {
        if (e?.code !== 'auth/user-not-found') throw e
      }
    }
  } catch {
    // Firebase delete failed, try MongoDB delete below
  }

  try {
    await deleteUserById(params.userId)
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Delete failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

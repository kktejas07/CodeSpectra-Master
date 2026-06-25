import { NextResponse } from 'next/server'
import { getAPIUser, requireSuperAdmin } from '@/lib/api-auth'
import { buildAdminUserRow, type ProfileRow } from '@/lib/admin-users'
import { getUserById, updateUserById, deleteUserById } from '@/lib/db/admin'
import { normalizeUserRole, type UserRole } from '@/lib/rbac'

const ALLOWED_ROLES: UserRole[] = ['superadmin', 'tenant_admin', 'user']

function toRowFromDoc(doc: Awaited<ReturnType<typeof getUserById>>) {
  if (!doc) return null
  const profile: ProfileRow = {
    id: (doc._id as unknown as string) || doc.id || '',
    email: doc.email,
    full_name: doc.fullName ?? doc.name ?? null,
    role: normalizeUserRole(doc.role),
    created_at:
      typeof doc.createdAt === 'string'
        ? doc.createdAt
        : doc.createdAt?.toISOString?.() ?? new Date().toISOString(),
    updated_at:
      typeof doc.updatedAt === 'string'
        ? doc.updatedAt
        : doc.updatedAt?.toISOString?.() ?? new Date().toISOString(),
  }
  const fakeAuthUser = {
    id: profile.id,
    email: doc.email,
    created_at: profile.created_at,
    last_sign_in_at: null,
    email_confirmed_at: doc.emailVerified ? profile.created_at : null,
    user_metadata: { full_name: profile.full_name, role: profile.role },
    app_metadata: {},
  } as unknown as Parameters<typeof buildAdminUserRow>[0]
  return buildAdminUserRow(fakeAuthUser, profile)
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ userId: string }> },
) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  const { userId } = await ctx.params
  if (!userId) {
    return NextResponse.json({ error: 'Missing user id' }, { status: 400 })
  }

  let body: { role?: string; full_name?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const role = body.role !== undefined ? normalizeUserRole(body.role) : undefined
  if (role !== undefined && !ALLOWED_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }
  const full_name =
    body.full_name !== undefined ? String(body.full_name).trim() : undefined

  try {
    const existing = await getUserById(userId)
    if (!existing) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const updated = await updateUserById(userId, {
      ...(role !== undefined ? { role } : {}),
      ...(full_name !== undefined ? { fullName: full_name, name: full_name } : {}),
    })

    return NextResponse.json({ user: toRowFromDoc(updated) })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Update failed'
    console.error('[CodeSpectra] admin/users PATCH:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ userId: string }> },
) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  const me = await getAPIUser()
  const { userId } = await ctx.params
  if (!userId) {
    return NextResponse.json({ error: 'Missing user id' }, { status: 400 })
  }
  if (me?.id === userId) {
    return NextResponse.json(
      { error: 'You cannot delete your own account' },
      { status: 400 },
    )
  }

  try {
    const ok = await deleteUserById(userId)
    if (!ok) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Delete failed'
    console.error('[CodeSpectra] admin/users DELETE:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

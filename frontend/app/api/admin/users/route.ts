import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/api-auth'
import { auth } from '@/lib/auth'
import { listAllUsers, getUserById } from '@/lib/db/admin'
import { buildAdminUserRow, type ProfileRow } from '@/lib/admin-users'
import { normalizeUserRole } from '@/lib/rbac'

/**
 * GET /api/admin/users — list all users (superadmin only).
 * Phase 4 migration: reads directly from Better Auth's MongoDB `user`
 * collection. The `buildAdminUserRow` shape is preserved by shimming a
 * `User`-like object from the Better Auth user document.
 */
export async function GET() {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  try {
    const usersList = await listAllUsers()

    const rows = usersList.map((u) => {
      const profile: ProfileRow = {
        id: (u._id as unknown as string) || u.id || '',
        email: u.email,
        full_name: u.fullName ?? u.name ?? null,
        role: normalizeUserRole(u.role),
        created_at:
          typeof u.createdAt === 'string'
            ? u.createdAt
            : u.createdAt?.toISOString?.() ?? new Date().toISOString(),
        updated_at:
          typeof u.updatedAt === 'string'
            ? u.updatedAt
            : u.updatedAt?.toISOString?.() ?? new Date().toISOString(),
      }

      // buildAdminUserRow expects a Supabase User-like object as 1st arg.
      // We pass the minimum shape it reads.
      const fakeAuthUser = {
        id: profile.id,
        email: u.email,
        created_at: profile.created_at,
        last_sign_in_at: null,
        email_confirmed_at: u.emailVerified ? profile.created_at : null,
        user_metadata: { full_name: profile.full_name, role: profile.role },
        app_metadata: {},
      } as unknown as Parameters<typeof buildAdminUserRow>[0]

      return buildAdminUserRow(fakeAuthUser, profile)
    })

    return NextResponse.json({ users: rows })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to list users'
    console.error('[CodeSpectra] admin/users GET:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/**
 * POST /api/admin/users — provision a new user (superadmin only).
 * Phase 4 migration: uses Better Auth's `signUpEmail` server API to create
 * the user (which handles password hashing + `account` linkage), then
 * upgrades the role/fullName via MongoDB.
 *
 * Welcome-email delivery (previously via Resend/SendGrid in
 * `provisionAdminUser`) is deferred to a later phase.
 */
export async function POST(request: Request) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  let body: { email?: string; password?: string; full_name?: string; role?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const email = (body.email || '').trim().toLowerCase()
  const full_name = (body.full_name || '').trim() || email.split('@')[0] || 'User'
  const role = normalizeUserRole(body.role)
  const password =
    (body.password && body.password.length >= 8 ? body.password : undefined) ||
    // Generate a temporary password if none provided. The admin should
    // immediately ask the user to reset it via /auth/forgot-password.
    `temp-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}A1!`

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Valid email is required' }, { status: 400 })
  }

  try {
    const signupRes = await auth.api.signUpEmail({
      body: { email, password, name: full_name },
    })
    const newUserId = signupRes.user?.id
    if (!newUserId) {
      return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
    }

    const { updateUserById } = await import('@/lib/db/admin')
    await updateUserById(newUserId, { role, fullName: full_name })

    const created = await getUserById(newUserId)
    return NextResponse.json({
      user: {
        id: newUserId,
        email,
        full_name,
        role,
        created_at:
          created?.createdAt instanceof Date
            ? created.createdAt.toISOString()
            : (created?.createdAt as unknown as string) ?? new Date().toISOString(),
      },
      welcomeEmailSent: false,
      delivery: 'none',
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to create user'
    console.error('[CodeSpectra] admin/users POST:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

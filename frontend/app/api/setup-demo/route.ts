import { auth } from '@/lib/auth'
import { updateUserById } from '@/lib/db/admin'

const demoUsers = [
  {
    email: 'superadmin@codespectra.com',
    password: 'SuperAdmin123!',
    full_name: 'Super Admin',
    role: 'superadmin',
  },
  {
    email: 'admin@codespectra.com',
    password: 'TenantAdmin123!',
    full_name: 'Tenant Admin',
    role: 'tenant_admin',
  },
  {
    email: 'demo@codespectra.com',
    password: 'DemoPass123!',
    full_name: 'Demo User',
    role: 'user',
  },
]

/**
 * POST /api/setup-demo
 * Phase 6 migration: provisions the three demo users via Better Auth's
 * `signUpEmail` server API, then upgrades their role + fullName in the
 * MongoDB `user` collection. Idempotent — re-running just updates roles.
 */
export async function POST() {
  const createdUsers: Array<{
    email: string
    password: string
    full_name: string
    role: string
    userId: string
  }> = []
  const errors: string[] = []

  for (const u of demoUsers) {
    try {
      let userId: string | null = null
      try {
        const res = await auth.api.signUpEmail({
          body: { email: u.email, password: u.password, name: u.full_name },
        })
        userId = res.user?.id ?? null
      } catch (err) {
        // Most likely "User already exists" — try to look them up instead.
        const msg = err instanceof Error ? err.message : String(err)
        if (!msg.toLowerCase().includes('exist')) {
          errors.push(`${u.email}: ${msg}`)
        }
        const { users } = await import('@/lib/db/admin')
        const userCol = await users()
        const existing = await userCol.findOne({ email: u.email })
        userId = (existing?._id as string | undefined) ?? (existing?.id as string | undefined) ?? null
      }

      if (!userId) {
        errors.push(`${u.email}: could not resolve user id`)
        continue
      }

      await updateUserById(userId, {
        role: u.role,
        fullName: u.full_name,
        name: u.full_name,
      })

      createdUsers.push({ ...u, userId })
    } catch (e) {
      errors.push(`${u.email}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  if (createdUsers.length === 0) {
    return new Response(
      JSON.stringify({
        success: false,
        error: errors.length
          ? errors.join(' | ')
          : 'No demo users were created. Check server logs.',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  return new Response(
    JSON.stringify({
      success: true,
      message: 'Demo users are ready. You can now log in!',
      users: createdUsers,
      warnings: errors.length ? errors : undefined,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

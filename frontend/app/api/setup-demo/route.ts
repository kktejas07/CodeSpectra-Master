import { adminAuth } from '@/lib/firebase-admin'
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
        const userRecord = await adminAuth.createUser({
          email: u.email,
          password: u.password,
          displayName: u.full_name,
        })
        userId = userRecord.uid
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (!msg.toLowerCase().includes('already exist')) {
          errors.push(`${u.email}: ${msg}`)
          continue
        }
        const existing = await adminAuth.getUserByEmail(u.email)
        userId = existing.uid
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

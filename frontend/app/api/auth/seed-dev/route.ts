import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import { getMongoDb } from '@/lib/mongodb'
import { requireSuperAdmin } from '@/lib/route-auth'
import { apiErrorFor } from '@/lib/api-errors'

export const runtime = 'nodejs'

// No built-in default: the password must come from the environment.
const SEED_PASSWORD = process.env.SEED_PASSWORD || ''

const DEV_ACCOUNTS = [
  { email: 'superadmin@codespectra.com', password: SEED_PASSWORD, role: 'superadmin', name: 'Super Admin' },
  { email: 'admin@codespectra.com', password: SEED_PASSWORD, role: 'tenant_admin', name: 'Tenant Admin' },
  { email: 'demo@codespectra.com', password: SEED_PASSWORD, role: 'user', name: 'Demo User' },
]

export async function POST() {
  // Resets well-known accounts to a predictable password — a dev bootstrap
  // primitive, never a prod tool. Blocked in production unless explicitly
  // re-enabled via env (SEED_DEV_ENABLED=1).
  if (process.env.NODE_ENV === 'production' && process.env.SEED_DEV_ENABLED !== '1') {
    return NextResponse.json({ error: 'Disabled in production' }, { status: 404 })
  }

  if (SEED_PASSWORD.length < 12) {
    return NextResponse.json(apiErrorFor('seed_password_required'), { status: 400 })
  }

  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  const db = await getMongoDb()
  const results: { email: string; action: string }[] = []

  for (const acc of DEV_ACCOUNTS) {
    const existing = await db.collection('user').findOne({ email: acc.email })
    const passwordHash = await bcrypt.hash(acc.password, 12)

    if (existing) {
      await db.collection('user').updateOne(
        { email: acc.email },
        { $set: { passwordHash, role: acc.role, updatedAt: new Date() } },
      )
      results.push({ email: acc.email, action: 'updated (passwordHash set)' })
    } else {
      const uid = randomUUID()
      await db.collection('user').insertOne({
        _id: uid,
        email: acc.email,
        name: acc.name,
        passwordHash,
        role: acc.role,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any)
      results.push({ email: acc.email, action: 'created' })
    }
  }

  return NextResponse.json({ seeded: results })
}

import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import { getMongoDb } from '@/lib/mongodb'
import { requireSuperAdmin } from '@/lib/route-auth'

export const runtime = 'nodejs'

const DEV_ACCOUNTS = [
  { email: 'superadmin@codespectra.com', password: 'SuperAdmin123!', role: 'superadmin', name: 'Super Admin' },
  { email: 'admin@codespectra.com', password: 'TenantAdmin123!', role: 'tenant_admin', name: 'Tenant Admin' },
  { email: 'demo@codespectra.com', password: 'DemoPass123!', role: 'user', name: 'Demo User' },
  { email: 'recruiter@codespectra.com', password: 'RecruiterPass123!', role: 'user', name: 'Recruiter' },
]

export async function POST() {
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

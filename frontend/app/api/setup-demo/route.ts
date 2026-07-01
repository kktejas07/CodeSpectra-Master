import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getMongoDb } from '@/lib/mongodb'
import { requireSuperAdmin } from '@/lib/route-auth'

const DEMO_USERS = [
  { email: 'superadmin@codespectra.com', password: 'SuperAdmin123!', name: 'Super Admin', role: 'superadmin' },
  { email: 'admin@codespectra.com', password: 'TenentAdmin123!', name: 'Tenant Admin', role: 'tenant_admin' },
  { email: 'demo@codespectra.com', password: 'DemoPass123!', name: 'Demo User', role: 'user' },
  { email: 'qa@codespectra.dev', password: 'QAAdmin123!', name: 'QA Admin', role: 'superadmin' },
]

export async function POST() {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  try {
    const db = await getMongoDb()
    const usersCol = db.collection('users')
    const createdUsers: Array<{ email: string; name: string; role: string }> = []

    for (const u of DEMO_USERS) {
      const exists = await usersCol.findOne({ email: u.email })
      if (!exists) {
        const hashed = await bcrypt.hash(u.password, 12)
        const now = new Date().toISOString()
        await usersCol.insertOne({
          id: crypto.randomUUID(),
          email: u.email,
          password: hashed,
          name: u.name,
          role: u.role,
          created_at: now,
          updated_at: now,
        })
        createdUsers.push({ email: u.email, name: u.name, role: u.role })
      }
    }

    return NextResponse.json({
      success: true,
      users: createdUsers.length > 0
        ? createdUsers.map(u => ({ ...u, password: DEMO_USERS.find(d => d.email === u.email)!.password }))
        : DEMO_USERS.map(u => ({ email: u.email, name: u.name, role: u.role, password: u.password })),
    })
  } catch (error) {
    console.error('[CodeSpectra] Setup demo error:', error)
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}

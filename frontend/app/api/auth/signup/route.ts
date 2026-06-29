import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import { getMongoDb } from '@/lib/mongodb'
import { setSessionCookie } from '@/lib/session'
import { normalizeUserRole } from '@/lib/rbac'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const { email, password, name } = await request.json()
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }

    const normalizedEmail = email.toLowerCase().trim()
    const db = await getMongoDb()
    const existing = await db.collection('user').findOne({ email: normalizedEmail })
    if (existing) {
      return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 })
    }

    const passwordHash = await bcrypt.hash(password, 12)
    const uid = randomUUID()
    const now = new Date()

    await db.collection('user').insertOne({
      _id: uid,
      email: normalizedEmail,
      name: name || null,
      passwordHash,
      role: 'user',
      emailVerified: false,
      createdAt: now,
      updatedAt: now,
    } as any)

    const role = normalizeUserRole('user')
    await setSessionCookie({ uid, email: normalizedEmail, role })

    return NextResponse.json({ user: { id: uid, email: normalizedEmail, role, name: name || null } })
  } catch (error) {
    console.error('[Signup] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

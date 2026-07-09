import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import { getMongoDb } from '@/lib/mongodb'
import { setSessionCookie } from '@/lib/session'
import { normalizeUserRole } from '@/lib/rbac'
import { rateLimitSlidingWindow, clientLimiterKeyFromRequest } from '@/lib/in-memory-rate-limit'
import { writeAuditLog } from '@/lib/db/misc'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const ipKey = clientLimiterKeyFromRequest(request, null)
    const ipCheck = rateLimitSlidingWindow(`signup:ip:${ipKey}`, 3, 3600_000)
    if (!ipCheck.ok) {
      return NextResponse.json(
        { error: `Too many accounts created from this location. Try again later.` },
        { status: 429 },
      )
    }

    const { email, password, name } = await request.json()
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }

    const normalizedEmail = email.toLowerCase().trim()
    const actorIp = clientLimiterKeyFromRequest(request, null).replace(/^(ip:|u:)/, '')
    const db = await getMongoDb()
    const existing = await db.collection('user').findOne({ email: normalizedEmail })
    if (existing) {
      await writeAuditLog({ action: 'auth.signup', outcome: 'denied', actor: normalizedEmail, actorIp, resource: 'email/' + normalizedEmail, resourceType: 'auth', severity: 'warning', detail: 'email already registered', user_id: normalizedEmail })
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

    await writeAuditLog({ action: 'auth.signup', outcome: 'success', actor: normalizedEmail, actorIp, resource: 'user/' + uid, resourceType: 'auth', severity: 'info', user_id: uid })
    return NextResponse.json({ user: { id: uid, email: normalizedEmail, role, name: name || null } })
  } catch (error) {
    console.error('[Signup] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

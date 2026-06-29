import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getMongoDb } from '@/lib/mongodb'
import { setSessionCookie } from '@/lib/session'
import { normalizeUserRole } from '@/lib/rbac'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json()
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }

    const normalizedEmail = email.toLowerCase().trim()
    const db = await getMongoDb()
    const user = await db.collection('user').findOne({ email: normalizedEmail })
    if (!user) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    if (!user.passwordHash) {
      return NextResponse.json(
        { error: 'This account does not have a password set. Sign in with Google/GitHub or reset your password.' },
        { status: 400 },
      )
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    const uid = user.id || user._id
    const role = normalizeUserRole(user.role as string | undefined | null)
    await setSessionCookie({ uid, email: user.email, role })

    return NextResponse.json({ user: { id: uid, email: user.email, role, name: user.name || null } })
  } catch (error) {
    console.error('[Login] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

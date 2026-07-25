import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { clearSessionCookie, revokeAllUserSessions } from '@/lib/session'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  try {
    const { password } = await request.json()
    if (!password) {
      return NextResponse.json({ error: 'Password is required' }, { status: 400 })
    }

    const db = await getMongoDb()
    const user = await db.collection('user').findOne({ id: gate.user.id })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (user.passwordHash) {
      const valid = await bcrypt.compare(password, user.passwordHash)
      if (!valid) {
        return NextResponse.json({ error: 'Invalid password' }, { status: 403 })
      }
    }

    await db.collection('user').deleteOne({ id: gate.user.id })
    const response = NextResponse.json({ success: true })
    await clearSessionCookie()
    return response
  } catch (error) {
    console.error('[DeleteAccount] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

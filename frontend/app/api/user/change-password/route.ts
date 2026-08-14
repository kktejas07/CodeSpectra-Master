import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  const rateCheck = await rateLimitRedis(`change-pw:${gate.user.id}`, 3, 60_000)
  if (!rateCheck.ok) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${rateCheck.retryAfterSec}s.` },
      { status: 429 },
    )
  }

  try {
    const { currentPassword, newPassword } = await request.json()
    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: 'Current password and new password are required' }, { status: 400 })
    }
    if (newPassword.length < 8) {
      return NextResponse.json({ error: 'New password must be at least 8 characters' }, { status: 400 })
    }

    const db = await getMongoDb()
    const user = await db.collection('user').findOne({ id: gate.user.id })
    if (!user?.passwordHash) {
      return NextResponse.json({ error: 'No password set on this account' }, { status: 400 })
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!valid) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 403 })
    }

    const passwordHash = await bcrypt.hash(newPassword, 12)
    await db.collection('user').updateOne(
      { id: gate.user.id },
      { $set: { passwordHash, updatedAt: new Date() } },
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[ChangePassword] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export async function POST(request: Request) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  try {
    const { password } = await request.json()
    if (!password) {
      return NextResponse.json({ error: 'Current password is required to disable 2FA.' }, { status: 400 })
    }

    const db = await getMongoDb()
    const user = await db.collection('user').findOne({ id: gate.user.id })
    if (!user?.passwordHash) {
      return NextResponse.json({ error: 'Cannot disable 2FA: no password set on this account.' }, { status: 400 })
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      return NextResponse.json({ error: 'Invalid password.' }, { status: 403 })
    }

    await db.collection('user').updateOne(
      { id: gate.user.id },
      { $unset: { totp_secret: '', totp_setup_at: '', totp_verified_at: '' }, $set: { totp_enabled: false } }
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[CodeSpectra] 2FA disable error:', error)
    return NextResponse.json({ error: 'Failed to disable 2FA' }, { status: 500 })
  }
}

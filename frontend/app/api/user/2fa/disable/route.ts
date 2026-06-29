import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export async function POST() {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  try {
    const db = await getMongoDb()
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

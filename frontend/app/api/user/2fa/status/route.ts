import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export async function GET() {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  try {
    const db = await getMongoDb()
    const user = await db.collection('user').findOne(
      { id: gate.user.id },
      { projection: { totp_enabled: 1, totp_setup_at: 1, totp_verified_at: 1, created_at: 1, createdAt: 1 } }
    )

    return NextResponse.json({
      enabled: user?.totp_enabled ?? false,
      setupAt: user?.totp_setup_at ?? null,
      verifiedAt: user?.totp_verified_at ?? null,
    })
  } catch (error) {
    console.error('[CodeSpectra] 2FA status error:', error)
    return NextResponse.json({ error: 'Failed to check 2FA status' }, { status: 500 })
  }
}

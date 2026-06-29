import { NextRequest, NextResponse } from 'next/server'
import { authenticator } from 'otplib'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export async function POST(req: NextRequest) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  try {
    const { token } = (await req.json()) as { token: string }
    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 })
    }

    const db = await getMongoDb()
    const user = await db.collection('user').findOne({ id: gate.user.id })

    if (!user?.totp_secret) {
      return NextResponse.json({ error: '2FA not set up. Call setup first.' }, { status: 400 })
    }

    const isValid = authenticator.verify({ token, secret: user.totp_secret })
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid code' }, { status: 400 })
    }

    await db.collection('user').updateOne(
      { id: gate.user.id },
      { $set: { totp_enabled: true, totp_verified_at: new Date().toISOString() } }
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[CodeSpectra] 2FA verify error:', error)
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
  }
}

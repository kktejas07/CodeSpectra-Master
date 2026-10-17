import { NextRequest, NextResponse } from 'next/server'
import { checkTotp } from '@/lib/totp'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'

export async function POST(req: NextRequest) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  const rateCheck = await rateLimitRedis(`2fa:verify:${gate.user.id}`, 5, 60_000)
  if (!rateCheck.ok) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${rateCheck.retryAfterSec}s.` },
      { status: 429 },
    )
  }

  try {
    const { token } = (await req.json()) as { token: string }
    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 })
    }

    const db = await getMongoDb()
    const user = await db.collection('user').findOne({ id: gate.user.id })

    // Enrolment secret from /setup; fall back to a legacy un-verified totp_secret.
    const secret = user?.totp_pending_secret || (!user?.totp_enabled ? user?.totp_secret : null)
    if (!secret) {
      return NextResponse.json({ error: '2FA not set up. Call setup first.' }, { status: 400 })
    }

    const isValid = checkTotp(token, secret)
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid code' }, { status: 400 })
    }

    await db.collection('user').updateOne(
      { id: gate.user.id },
      {
        $set: { totp_secret: secret, totp_enabled: true, totp_verified_at: new Date().toISOString() },
        $unset: { totp_pending_secret: '' },
      }
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[CodeSpectra] 2FA verify error:', error)
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
  }
}

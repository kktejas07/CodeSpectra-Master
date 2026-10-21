import { NextRequest, NextResponse } from 'next/server'
import { sealTotpSecret, totpMatchStep } from '@/lib/totp'
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
      { error: `Too many attempts. Try again in ${rateCheck.retryAfterSec}s.`, code: 'auth_too_many_attempts', params: { seconds: rateCheck.retryAfterSec } },
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

    const step = totpMatchStep(token, secret)
    if (step === null) {
      return NextResponse.json({ error: 'Invalid code', code: 'auth_invalid_code' }, { status: 400 })
    }

    await db.collection('user').updateOne(
      { id: gate.user.id },
      {
        // Sealed at rest; the enrolment code is burnt so it can't also sign in.
        $set: { totp_secret: sealTotpSecret(String(secret)), totp_enabled: true, totp_verified_at: new Date().toISOString(), totp_last_step: step },
        $unset: { totp_pending_secret: '' },
      }
    )

    const { invalidateAdmin2faCache } = await import('@/lib/admin-2fa')
    invalidateAdmin2faCache(gate.user.id)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[CodeSpectra] 2FA verify error:', error)
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
  }
}

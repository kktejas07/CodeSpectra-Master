import { NextResponse } from 'next/server'
import { generateSecret, generateURI } from 'otplib'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { sealTotpSecret } from '@/lib/totp'

/**
 * Starts (or restarts) 2FA enrolment. The new secret is parked in
 * `totp_pending_secret`; `/api/user/2fa/verify` promotes it once the user
 * proves they can read codes from it. This route never touches
 * `totp_enabled` or the live secret, so it can't be used to switch 2FA off —
 * that needs `/api/user/2fa/disable` (password or current code).
 */
export async function POST() {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  try {
    const db = await getMongoDb()
    const current = await db.collection('user').findOne({ id: gate.user.id }, { projection: { totp_enabled: 1 } })
    if (current?.totp_enabled) {
      return NextResponse.json(
        { error: 'Two-factor authentication is already on. Turn it off first if you want to set up a new device.' },
        { status: 409 },
      )
    }

    const secret = generateSecret()
    const otpauth = generateURI({
      issuer: 'CodeSpectra',
      label: gate.user.email,
      secret,
    } as any)

    await db.collection('user').updateOne(
      { id: gate.user.id },
      { $set: { totp_pending_secret: sealTotpSecret(secret), totp_setup_at: new Date().toISOString() } }
    )

    return NextResponse.json({ secret, otpauth })
  } catch (error) {
    console.error('[CodeSpectra] 2FA setup error:', error)
    return NextResponse.json({ error: 'Failed to setup 2FA' }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { authenticator } from 'otplib'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export async function POST() {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  try {
    const secret = authenticator.generateSecret()
    const service = 'CodeSpectra'
    const otpauth = authenticator.keyuri(gate.user.email, service, secret)

    const db = await getMongoDb()
    await db.collection('user').updateOne(
      { id: gate.user.id },
      { $set: { totp_secret: secret, totp_enabled: false, totp_setup_at: new Date().toISOString() } }
    )

    const QRCode = await import('qrcode')
    const qrCodeDataUrl = await QRCode.toDataURL(otpauth)

    return NextResponse.json({ secret, qrCode: qrCodeDataUrl, otpauth })
  } catch (error) {
    console.error('[CodeSpectra] 2FA setup error:', error)
    return NextResponse.json({ error: 'Failed to setup 2FA' }, { status: 500 })
  }
}

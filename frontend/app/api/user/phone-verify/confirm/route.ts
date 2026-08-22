import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COL = 'phone_verify_otps'

/** POST — confirm emailed OTP and mark phone verified on the user + extended profile. */
export async function POST(req: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const phone = String(body.phone || '').replace(/\D/g, '')
  const countryCode = String(body.countryCode || '+91')
  const code = String(body.code || '').trim()
  if (!phone || !code) {
    return NextResponse.json({ error: 'Phone and code are required' }, { status: 400 })
  }

  const db = await getMongoDb()
  const row = await db.collection(COL).findOne({ userId: user.id, phone })
  if (!row || String(row.code) !== code) {
    return NextResponse.json({ error: 'Invalid verification code' }, { status: 400 })
  }
  if (row.expiresAt && new Date(row.expiresAt).getTime() < Date.now()) {
    return NextResponse.json({ error: 'Code expired — request a new one' }, { status: 400 })
  }

  const now = new Date().toISOString()
  await db.collection('user').updateOne(
    { $or: [{ id: user.id }, { _id: user.id as any }] },
    {
      $set: {
        phone,
        countryCode,
        phoneVerified: true,
        phone_verified_at: now,
        updatedAt: new Date(),
      },
    },
  )
  await db.collection('user_extended_profiles').updateOne(
    { userId: user.id },
    {
      $set: {
        'basic.phone': phone,
        'basic.countryCode': countryCode,
        'basic.phoneVerified': true,
        phone,
        phoneVerified: true,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now, userId: user.id },
    },
    { upsert: true },
  )
  await db.collection(COL).deleteOne({ userId: user.id })

  return NextResponse.json({ ok: true, phone, countryCode })
}

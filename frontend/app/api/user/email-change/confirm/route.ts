import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { updateUserById } from '@/lib/db/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COL = 'email_change_otps'

/** POST — confirm OTP and update the user's login email. */
export async function POST(req: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const email = String(body.email || '').trim().toLowerCase()
  const code = String(body.code || '').trim()
  if (!email || !code) {
    return NextResponse.json({ error: 'Email and code are required' }, { status: 400 })
  }

  const db = await getMongoDb()
  const row = await db.collection(COL).findOne({ userId: user.id, email })
  if (!row || String(row.code) !== code) {
    return NextResponse.json({ error: 'Invalid verification code' }, { status: 400 })
  }
  if (row.expiresAt && new Date(row.expiresAt).getTime() < Date.now()) {
    return NextResponse.json({ error: 'Code expired — request a new one' }, { status: 400 })
  }

  const taken = await db.collection('user').findOne({ email })
  if (taken && String((taken as any).id || (taken as any)._id) !== user.id) {
    return NextResponse.json({ error: 'That email is already in use' }, { status: 409 })
  }

  await db.collection('user').updateOne(
    { $or: [{ id: user.id }, { _id: user.id as any }] },
    { $set: { email, emailVerified: true, updatedAt: new Date() } },
  )
  // Also try Better Auth helper path when present
  try {
    await updateUserById(user.id, { email } as any)
  } catch { /* optional */ }

  await db.collection(COL).deleteOne({ userId: user.id })

  return NextResponse.json({ ok: true, email })
}

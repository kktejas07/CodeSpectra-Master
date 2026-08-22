import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COL = 'user_extended_profiles'

/** GET — load the signed-in user's extended profile (About, skills, links, …).
 * Also backfills a username for older accounts that never got one.
 */
export async function GET() {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const db = await getMongoDb()
    let doc = await db.collection(COL).findOne({ userId: user.id })
    const basic = (doc as any)?.basic || {}
    const username = String(basic.username || (doc as any)?.username || '').trim()
    if (!username) {
      const { generateUsernameCandidate } = await import('@/lib/username')
      let candidate = generateUsernameCandidate({
        firstName: basic.firstName,
        lastName: basic.lastName,
        email: user.email,
        name: user.name || user.fullName,
      })
      // Ensure uniqueness among extended profiles (best-effort)
      for (let i = 0; i < 5; i++) {
        const clash = await db.collection(COL).findOne({
          userId: { $ne: user.id },
          $or: [{ 'basic.username': candidate }, { username: candidate }],
        })
        if (!clash) break
        candidate = generateUsernameCandidate({
          firstName: basic.firstName,
          lastName: basic.lastName,
          email: user.email,
          name: user.name || user.fullName,
          suffix: Math.floor(1000 + Math.random() * 9000),
        })
      }
      const now = new Date().toISOString()
      await db.collection(COL).updateOne(
        { userId: user.id },
        {
          $set: {
            'basic.username': candidate,
            username: candidate,
            userId: user.id,
            updatedAt: now,
          },
          $setOnInsert: { createdAt: now },
        },
        { upsert: true },
      )
      await db.collection('user').updateOne(
        { $or: [{ id: user.id }, { _id: user.id as any }] },
        { $set: { username: candidate, updatedAt: new Date() } },
      )
      doc = await db.collection(COL).findOne({ userId: user.id })
    }
    if (!doc) return NextResponse.json({ data: null })
    const { _id, userId, ...rest } = doc as any
    return NextResponse.json({ data: rest })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

/** PUT — upsert extended profile fields (replaces localStorage-only saves). */
export async function PUT(request: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const body = await request.json().catch(() => ({}))
    const { _id: _a, userId: _b, ...rest } = body || {}
    const db = await getMongoDb()
    const now = new Date().toISOString()
    await db.collection(COL).updateOne(
      { userId: user.id },
      { $set: { ...rest, userId: user.id, updatedAt: now }, $setOnInsert: { createdAt: now } },
      { upsert: true },
    )
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

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
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })
  try {
    const db = await getMongoDb()
    let doc = await db.collection(COL).findOne({ userId: user.id })
    const basic = (doc as any)?.basic || {}
    const username = String(basic.username || (doc as any)?.username || '').trim()
    const { generateUsernameCandidate, isGenericUsername } = await import('@/lib/username')
    const identity = {
      firstName: basic.firstName,
      lastName: basic.lastName,
      email: user.email,
      name: user.name || user.fullName,
    }
    const hasRealName = Boolean(
      String(basic.firstName || '').trim() ||
        String(basic.lastName || '').trim() ||
        String(user.name || user.fullName || '').trim(),
    )
    // Missing username OR placeholder user1234 once we know their name → LinkedIn-style handle
    if (!username || (isGenericUsername(username) && hasRealName)) {
      let candidate = generateUsernameCandidate(identity)
      // LinkedIn-style: try bare name, then name2, name3, …
      for (let n = 2; n <= 50; n++) {
        const clash = await db.collection(COL).findOne({
          userId: { $ne: user.id },
          $or: [{ 'basic.username': candidate }, { username: candidate }],
        })
        if (!clash) break
        candidate = generateUsernameCandidate({ ...identity, suffix: n })
      }
      if (isGenericUsername(candidate) && hasRealName) {
        candidate = generateUsernameCandidate({ ...identity, suffix: Math.floor(10 + Math.random() * 90) })
      }
      if (candidate && candidate !== username) {
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
    }
    if (!doc) return NextResponse.json({ data: null })
    const { _id, userId, ...rest } = doc as any
    return NextResponse.json({ data: rest })
  } catch (e) {
    console.error('[user/extended-profile] GET:', e)
    return NextResponse.json({ error: 'Your profile couldn’t be loaded. Try again.' }, { status: 500 })
  }
}

// Fields the profile editor may write. Everything else (userId, username,
// basic.phoneVerified, …) is server-owned and ignored.
const TOP_LEVEL_FIELDS = [
  'avatar', 'phone', 'location', 'designation', 'about', 'skills', 'experience', 'education',
  'projects', 'achievements', 'responsibilities', 'certificates', 'links', 'personalDetails',
] as const
const BASIC_FIELDS = [
  'firstName', 'lastName', 'phone', 'location', 'designation', 'organisation', 'avatar', 'gender',
  'userType', 'purpose', 'workExperience', 'careerGoal', 'countryCode',
] as const
const MAX_BODY_BYTES = 1_500_000
const MAX_FIELD_BYTES = 200_000
const MAX_AVATAR_BYTES = 1_000_000

function sizeOf(v: unknown): number {
  try { return JSON.stringify(v ?? null).length } catch { return Infinity }
}

/** PUT — upsert extended profile fields (allow-listed, size-capped). */
export async function PUT(request: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })
  try {
    const text = await request.text()
    if (text.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'Profile is too large. Use a smaller photo or shorter text.' }, { status: 413 })
    }
    let body: Record<string, unknown> = {}
    try { body = JSON.parse(text || '{}') } catch {
      return NextResponse.json({ error: 'Invalid request', code: 'invalid_request' }, { status: 400 })
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid request', code: 'invalid_request' }, { status: 400 })
    }

    const db = await getMongoDb()
    const current = (await db.collection(COL).findOne({ userId: user.id })) as Record<string, any> | null
    const now = new Date().toISOString()
    const $set: Record<string, unknown> = { userId: user.id, updatedAt: now }

    for (const key of TOP_LEVEL_FIELDS) {
      if (!(key in body)) continue
      const limit = key === 'avatar' ? MAX_AVATAR_BYTES : MAX_FIELD_BYTES
      if (sizeOf(body[key]) > limit) {
        return NextResponse.json({ error: `The ${key} section is too large.`, code: 'profile_section_too_large', params: { key } }, { status: 413 })
      }
      $set[key] = body[key]
    }
    if ('phone' in body && current?.phoneVerified && String(body.phone ?? '') !== String(current?.phone ?? '')) {
      $set.phoneVerified = false
    }
    const basic = body.basic
    if (basic && typeof basic === 'object' && !Array.isArray(basic)) {
      const b = basic as Record<string, unknown>
      for (const key of BASIC_FIELDS) {
        if (!(key in b)) continue
        const v = b[key]
        if (v !== null && typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') continue
        const limit = key === 'avatar' ? MAX_AVATAR_BYTES : 2_000
        if (typeof v === 'string' && v.length > limit) {
          return NextResponse.json({ error: `The ${key} field is too long.`, code: 'profile_field_too_long', params: { key } }, { status: 413 })
        }
        $set[`basic.${key}`] = v
      }
      // Editing the phone number drops its verified badge.
      const verifiedPhone = current?.basic?.phoneVerified ? String(current?.basic?.phone ?? '') : null
      if ('phone' in b && verifiedPhone !== null && String(b.phone ?? '') !== verifiedPhone) {
        $set['basic.phoneVerified'] = false
      }
    }

    await db.collection(COL).updateOne(
      { userId: user.id },
      { $set, $setOnInsert: { createdAt: now } },
      { upsert: true },
    )
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[user/extended-profile] PUT:', e)
    return NextResponse.json({ error: 'Your profile couldn’t be saved. Try again.' }, { status: 500 })
  }
}

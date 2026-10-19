import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { getUserById } from '@/lib/db/admin'
import { writeAuditLog } from '@/lib/db/misc'
import { clientLimiterKeyFromRequest } from '@/lib/in-memory-rate-limit'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'
import { consumeTotp } from '@/lib/totp'
import { sealFaceTemplate } from '@/lib/identity-media'

export const dynamic = 'force-dynamic'

const RECENT_SIGN_IN_MS = 15 * 60_000

function isDescriptor(v: unknown): v is number[] {
  return Array.isArray(v) && v.length === 128 && v.every((x) => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) <= 10)
}

/**
 * POST /api/auth/face-enroll — save the signed-in user's face template.
 * Body: { descriptor, password?, code? }
 *
 * First enrolment needs only the session. REPLACING an existing template
 * (it is also an identity check for proctored assessments) needs a re-auth:
 * the account password, or a current authenticator code, or — for accounts
 * with neither — a sign-in in the last 15 minutes.
 */
export async function POST(request: Request) {
  try {
    const user = await getAPIUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const limit = await rateLimitRedis(`face-enroll:${user.id}`, 10, 3600_000)
    if (!limit.ok) {
      return NextResponse.json({ error: `Too many attempts. Try again in ${limit.retryAfterSec}s.` }, { status: 429 })
    }

    const body = (await request.json().catch(() => ({}))) as { descriptor?: unknown; password?: unknown; code?: unknown }
    if (!isDescriptor(body.descriptor)) {
      return NextResponse.json({ error: 'Invalid face scan. Try again.' }, { status: 400 })
    }

    // ponytail: signup stores `_id` as a UUID string. Passing that UUID to the
    // BSON ObjectId constructor throws (500) for every email-signup user.
    // Look up via getUserById, then update by the actual `_id`.
    const profile = (await getUserById(user.id)) as (Record<string, unknown> & { _id: unknown }) | null
    if (!profile) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 })
    }

    if (profile.facial_biometric_template) {
      const password = typeof body.password === 'string' ? body.password : ''
      const code = typeof body.code === 'string' ? body.code.replace(/\s/g, '') : ''
      let reauthed = false
      if (password && typeof profile.passwordHash === 'string') {
        reauthed = await bcrypt.compare(password, profile.passwordHash)
      } else if (code && profile.totp_enabled && typeof profile.totp_secret === 'string') {
        reauthed = await consumeTotp(profile, code)
      } else if (!profile.passwordHash && !profile.totp_enabled) {
        const last = profile.lastLoginAt ? new Date(profile.lastLoginAt as string).getTime() : 0
        reauthed = Date.now() - last < RECENT_SIGN_IN_MS
      }
      if (!reauthed) {
        return NextResponse.json(
          {
            error: profile.passwordHash || profile.totp_enabled
              ? 'Confirm it’s you: enter your password or an authenticator code to replace your face scan.'
              : 'For your security, sign out and sign in again, then replace your face scan within 15 minutes.',
            reauthRequired: true,
            methods: { password: !!profile.passwordHash, totp: !!profile.totp_enabled },
          },
          { status: 403 },
        )
      }
    }

    const db = await getMongoDb()
    const result = await db.collection('user').updateOne(
      { _id: profile._id } as never,
      {
        $set: {
          // Sealed at rest (AES-GCM, lib/identity-media.ts — A-042).
          facial_biometric_template: await sealFaceTemplate(body.descriptor as number[]),
          biometric_enrolled_at: new Date(),
        },
      },
    )
    if (result.matchedCount === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 })
    }

    const actorIp = clientLimiterKeyFromRequest(request, null).replace(/^(ip:|u:)/, '')
    await writeAuditLog({
      action: 'auth.biometric_enroll',
      outcome: 'success',
      actor: user.email,
      actorIp,
      resource: 'user/' + user.id,
      resourceType: 'auth',
      severity: 'info',
      user_id: user.id,
      detail: profile.facial_biometric_template ? 'Face template replaced (re-authenticated)' : 'Face template enrolled',
    }).catch(() => {})

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[FaceEnroll] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

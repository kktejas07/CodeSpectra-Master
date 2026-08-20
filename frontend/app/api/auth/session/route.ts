import { NextRequest, NextResponse } from 'next/server'
import { getAdminAuthInstance } from '@/lib/firebase-admin'
import { cookies } from 'next/headers'
import { users as getUsersCollection, getUserById, updateUserById } from '@/lib/db/admin'
import { verifySessionToken, setSessionCookie } from '@/lib/session'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { createUserSession, updateSessionHeartbeat } from '@/lib/db/sessions'
import { getUserById } from '@/lib/db/admin'
import { clientLimiterKeyFromRequest } from '@/lib/in-memory-rate-limit'
import { isIpBlocked, trackDeviceFingerprint, recordSecurityEvent } from '@/lib/db/security'

const SESSION_COOKIE_NAME = 'codespectra_session'
const SESSION_EXPIRES_IN = 60 * 60 * 24 * 7 * 1000

async function ensureUserProfile(uid: string, email: string, displayName?: string, loginMethod?: string) {
  try {
    const userCol = await getUsersCollection()
    const existing = await getUserById(uid)
    const updateFields: Record<string, unknown> = { updatedAt: new Date() }
    if (loginMethod) {
      updateFields.lastLoginMethod = loginMethod
      updateFields.lastLoginAt = new Date()
    }
    if (!existing) {
      await userCol.insertOne({
        _id: uid,
        id: uid,
        email,
        name: displayName || email?.split('@')[0] || 'User',
        fullName: displayName || email?.split('@')[0] || 'User',
        role: 'user',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...(loginMethod ? { lastLoginMethod: loginMethod, lastLoginAt: new Date() } : {}),
      } as any)
    } else {
      await updateUserById(uid, updateFields as any)
    }
  } catch (e) {
    console.error('[Session] Profile sync error:', e)
  }
}

/** Record a user session + track the device fingerprint for OAuth sign-ins. */
async function recordOAuthSession(request: NextRequest, uid: string, email: string, visitorId?: string) {
  try {
    const rawIp = clientLimiterKeyFromRequest(request, null).replace(/^(ip:|u:)/, '')
    const userAgent = request.headers.get('user-agent') || 'Unknown device'
    if (await isIpBlocked(rawIp)) {
      await recordSecurityEvent({ type: 'auth.blocked_ip', severity: 'critical', ip: rawIp, user_id: uid, email, detail: 'Blocked IP attempted OAuth sign-in' })
      return
    }
    // Heartbeat path: session POST fires on every 5-min heartbeat — update the existing
    // session instead of inserting a new doc. Create one only when none matched.
    const matched = await updateSessionHeartbeat(uid, rawIp, userAgent, visitorId)
    if (matched === 0) {
      await createUserSession({ user_id: uid, email, ip: rawIp, user_agent: userAgent, visitor_id: visitorId || undefined })
    }
    if (visitorId) {
      const fp = await trackDeviceFingerprint({ visitorId, user_id: uid, email, ip: rawIp, user_agent: userAgent })
      if (fp.multiAccountRisk) {
        await recordSecurityEvent({ type: 'auth.multi_account', severity: 'warning', user_id: uid, email, ip: rawIp, visitorId, detail: 'Same device fingerprint used by multiple accounts' })
      }
    }
  } catch (e) {
    console.error('[Session] recordOAuthSession failed:', e)
  }
}

export async function POST(request: NextRequest) {
  try {
    const { idToken, loginMethod, visitorId } = await request.json()
    if (!idToken) {
      return NextResponse.json({ error: 'idToken required' }, { status: 400 })
    }

    const auth = await getAdminAuthInstance()
    if (auth) {
      const decoded = await auth.verifyIdToken(idToken)
      if (!decoded) {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
      }
      const sessionCookie = await auth.createSessionCookie(idToken, { expiresIn: SESSION_EXPIRES_IN })
      const response = NextResponse.json({ ok: true })
      response.cookies.set(SESSION_COOKIE_NAME, sessionCookie, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        maxAge: SESSION_EXPIRES_IN / 1000,
      })
      await ensureUserProfile(decoded.uid, decoded.email || '', decoded.name, loginMethod)
      await recordOAuthSession(request, decoded.uid, decoded.email || '', typeof visitorId === 'string' ? visitorId : undefined)
      return response
    }

    // ponytail: fallback when Firebase Admin SDK is not configured
    const projectId = process.env.FIREBASE_PROJECT_ID || 'codespectra-f60cf'
    const JWKS = createRemoteJWKSet(
      new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
    )
    let payload: { sub?: string; email?: string; name?: string; [key: string]: unknown }
    try {
      const result = await jwtVerify(idToken, JWKS, {
        issuer: `https://securetoken.google.com/${projectId}`,
        audience: projectId,
      })
      payload = result.payload as typeof payload
    } catch (jwtErr) {
      console.error('[Session] jwtVerify failed:', jwtErr)
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }
    if (!payload?.sub) {
      return NextResponse.json({ error: 'Invalid token payload' }, { status: 401 })
    }
    await setSessionCookie({
      uid: payload.sub,
      email: (payload.email as string) || '',
      role: 'user',
    })
    await ensureUserProfile(
      payload.sub,
      (payload.email as string) || '',
      payload.name as string | undefined,
      loginMethod,
    )
    await recordOAuthSession(request, payload.sub, (payload.email as string) || '', typeof visitorId === 'string' ? visitorId : undefined)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[Session] Error creating session:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true })
  response.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  return response
}

export async function GET() {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value

  if (!sessionCookie) {
    return NextResponse.json({ user: null })
  }

  // Try Firebase session cookie
  const auth = await getAdminAuthInstance()
  if (auth) {
    try {
      const decoded = await auth.verifySessionCookie(sessionCookie, true)
      if (decoded) {
        const profile = await getUserById(decoded.uid)
        updateUserById(decoded.uid, { updatedAt: new Date() } as any).catch(() => {})
        return NextResponse.json({
          user: {
            uid: decoded.uid,
            email: decoded.email || null,
            role: profile?.role || 'user',
            plan: profile?.plan || 'free',
            fullName: profile?.fullName || profile?.name || decoded.name || null,
            lastLoginMethod: profile?.lastLoginMethod || null,
            lastLoginAt: profile?.lastLoginAt || null,
            createdAt: profile?.createdAt || null,
            has_enrolled_face: !!(profile as any)?.facial_biometric_template,
            onboardingGoal: (profile as any)?.onboardingGoal || null,
          },
        })
      }
    } catch {
      /* invalid Firebase cookie — try JWT fallback */
    }
  }

  // Fallback: verify as JWT (DB auth session)
  const payload = await verifySessionToken(sessionCookie)
  if (payload) {
    const profile = await getUserById(payload.uid)
    updateUserById(payload.uid, { updatedAt: new Date() } as any).catch(() => {})
    return NextResponse.json({
      user: {
        uid: payload.uid,
        email: payload.email,
        role: profile?.role || payload.role,
        plan: profile?.plan || 'free',
        fullName: profile?.fullName || profile?.name || null,
        lastLoginMethod: profile?.lastLoginMethod || null,
        lastLoginAt: profile?.lastLoginAt || null,
        createdAt: profile?.createdAt || null,
        has_enrolled_face: !!(profile as any)?.facial_biometric_template,
        onboardingGoal: (profile as any)?.onboardingGoal || null,
      },
    })
  }

  return NextResponse.json({ user: null })
}

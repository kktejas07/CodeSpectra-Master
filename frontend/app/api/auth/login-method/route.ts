import { NextRequest, NextResponse } from 'next/server'
import { getAdminAuthInstance } from '@/lib/firebase-admin'
import { verifySessionToken } from '@/lib/session'
import { cookies } from 'next/headers'
import { updateUserLastLogin } from '@/lib/db/admin'

const SESSION_COOKIE_NAME = 'codespectra_session'

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value
    const { uid, method } = await request.json()

    if (!uid || !method) {
      return NextResponse.json({ error: 'uid and method required' }, { status: 400 })
    }

    if (!['google', 'github', 'email', 'sso'].includes(method)) {
      return NextResponse.json({ error: 'Invalid method' }, { status: 400 })
    }

    let authorized = false

    if (sessionCookie) {
      const auth = await getAdminAuthInstance()
      if (auth) {
        try {
          const decoded = await auth.verifySessionCookie(sessionCookie, true)
          if (decoded?.uid === uid) authorized = true
        } catch { /* invalid cookie */ }
      }
      if (!authorized) {
        const payload = await verifySessionToken(sessionCookie)
        if (payload?.uid === uid) authorized = true
      }
    }

    if (!authorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await updateUserLastLogin(uid, method)

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[login-method] Error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
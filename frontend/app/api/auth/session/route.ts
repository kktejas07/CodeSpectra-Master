import { NextRequest, NextResponse } from 'next/server'
import { getAdminAuthInstance } from '@/lib/firebase-admin'
import { cookies } from 'next/headers'

const SESSION_COOKIE_NAME = 'codespectra_session'
const SESSION_EXPIRES_IN = 60 * 60 * 24 * 7 * 1000

export async function POST(request: NextRequest) {
  try {
    const { idToken } = await request.json()
    if (!idToken) {
      return NextResponse.json({ error: 'idToken required' }, { status: 400 })
    }

    const auth = await getAdminAuthInstance()
    if (!auth) {
      return NextResponse.json({ error: 'Firebase not configured' }, { status: 500 })
    }

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

    return response
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

  try {
    const auth = await getAdminAuthInstance()
    if (!auth) {
      return NextResponse.json({ user: null })
    }

    const decoded = await auth.verifySessionCookie(sessionCookie, true)
    if (!decoded) {
      return NextResponse.json({ user: null })
    }

    return NextResponse.json({
      user: {
        uid: decoded.uid,
        email: decoded.email || null,
        role: (decoded as Record<string, unknown>).role || 'user',
      },
    })
  } catch {
    return NextResponse.json({ user: null })
  }
}

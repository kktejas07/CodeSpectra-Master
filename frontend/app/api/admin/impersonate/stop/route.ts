import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const SESSION_COOKIE = 'codespectra_session'
const IMPERSONATOR_COOKIE = 'codespectra_impersonator'
const IMPERSONATING_COOKIE = 'codespectra_impersonating'
const MAX_AGE = 60 * 60 * 24 * 7

const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  secure: process.env.NODE_ENV === 'production',
  maxAge: MAX_AGE,
}

const clearCookieOptions = {
  httpOnly: false,
  sameSite: 'lax' as const,
  path: '/',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 0,
}

/**
 * POST /api/admin/impersonate/stop — restore the admin's original session.
 * No auth gate: only a session that was created by impersonation carries the
 * `codespectra_impersonator` cookie, so this can't escalate anything.
 */
export async function POST() {
  const cookieStore = await cookies()
  const saved = cookieStore.get(IMPERSONATOR_COOKIE)?.value

  if (saved) {
    cookieStore.set(SESSION_COOKIE, saved, sessionCookieOptions)
  }

  cookieStore.set(IMPERSONATOR_COOKIE, '', clearCookieOptions)
  cookieStore.set(IMPERSONATING_COOKIE, '', clearCookieOptions)

  return NextResponse.json({ ok: true, restored: Boolean(saved) })
}

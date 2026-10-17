import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { clearSessionCookie, revokeSessionToken } from '@/lib/session'

export const runtime = 'nodejs'

/** POST /api/auth/logout — signs this session out server-side and clears the cookie. */
export async function POST() {
  const cookieStore = await cookies()
  await revokeSessionToken(cookieStore.get('codespectra_session')?.value)
  await clearSessionCookie()
  return NextResponse.json({ success: true })
}

/** GET /api/auth/logout — same as POST, for plain-link logouts. */
export async function GET() {
  return POST()
}

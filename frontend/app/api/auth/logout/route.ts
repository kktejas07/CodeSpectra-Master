import { NextResponse } from 'next/server'
import { clearSessionCookie } from '@/lib/session'

export const runtime = 'nodejs'

/** POST /api/auth/logout — clears the session cookie. */
export async function POST() {
  await clearSessionCookie()
  return NextResponse.json({ success: true })
}

/** GET /api/auth/logout — same as POST, for plain-link logouts. */
export async function GET() {
  await clearSessionCookie()
  return NextResponse.json({ success: true })
}

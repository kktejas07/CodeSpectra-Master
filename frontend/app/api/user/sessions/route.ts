import { NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { revokeAllUserSessions, clearSessionCookie } from '@/lib/session'

export const runtime = 'nodejs'

export async function DELETE() {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await revokeAllUserSessions(user.id)
  await clearSessionCookie()

  return NextResponse.json({ success: true })
}

/**
 * GET /api/subscriptions/me — the signed-in user's subscription (masked) or null.
 */
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getForUser, publicView } from '@/lib/subscriptions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireAuth()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const sub = await getForUser(auth.user.id)
  return NextResponse.json({ subscriber: sub ? publicView(sub) : null })
}

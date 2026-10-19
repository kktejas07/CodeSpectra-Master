/**
 * POST /api/events-feed/save — signed-in users save / unsave an event for a
 * deadline reminder (48 h before registration closes). Body: { event_id, save }.
 * GET returns the user's saved ids.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getForUser, setSavedEvent } from '@/lib/subscriptions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireAuth()
  if ('error' in auth) return NextResponse.json({ saved_events: [] })
  const sub = await getForUser(auth.user.id)
  return NextResponse.json({ saved_events: sub?.saved_events || [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if ('error' in auth) return NextResponse.json({ error: 'Sign in to get reminders' }, { status: auth.status })
  const b = (await req.json().catch(() => ({}))) as { event_id?: unknown; save?: unknown }
  const id = typeof b.event_id === 'string' && /^ef_[a-f0-9]{16}$/.test(b.event_id) ? b.event_id : null
  if (!id) return NextResponse.json({ error: 'Invalid event' }, { status: 400 })
  const r = await setSavedEvent({ id: auth.user.id, email: auth.user.email }, id, b.save !== false)
  return r.ok ? NextResponse.json(r) : NextResponse.json({ error: 'Couldn’t save this event' }, { status: 400 })
}

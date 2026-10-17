import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/api-auth'
import { getMongoDb } from '@/lib/mongodb'
import { isValidTimeZone } from '@/lib/notifications-delivery'

const DEFAULTS = { quietStart: '22:00', quietEnd: '08:00' }
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

// Keyed by { user_id, type: 'quiet_hours' }. (A fixed `_id` would collide
// across users, since `_id` is unique for the whole collection.)
// Quiet hours only apply once saved: `saved` tells the page whether they do.
export async function GET() {
  const user = await getAPIUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const db = await getMongoDb()
    const doc = await db.collection('notification_preferences').findOne({ user_id: user.id, type: 'quiet_hours' })
    return NextResponse.json({
      quietStart: typeof doc?.quietStart === 'string' ? doc.quietStart : DEFAULTS.quietStart,
      quietEnd: typeof doc?.quietEnd === 'string' ? doc.quietEnd : DEFAULTS.quietEnd,
      enabled: !!doc && doc.enabled !== false,
      timeZone: isValidTimeZone(doc?.timeZone) ? doc!.timeZone : null,
    })
  } catch (e) {
    console.error('[CodeSpectra] quiet-hours GET:', e)
    return NextResponse.json({ error: 'Failed to load quiet hours' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const user = await getAPIUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const { quietStart, quietEnd, enabled, timeZone } = body as {
    quietStart?: unknown; quietEnd?: unknown; enabled?: unknown; timeZone?: unknown
  }

  if (typeof quietStart !== 'string' || typeof quietEnd !== 'string' || !HHMM.test(quietStart) || !HHMM.test(quietEnd)) {
    return NextResponse.json({ error: 'quietStart and quietEnd must be HH:MM' }, { status: 400 })
  }
  if (enabled !== undefined && typeof enabled !== 'boolean') {
    return NextResponse.json({ error: 'enabled must be true or false' }, { status: 400 })
  }
  if (timeZone !== undefined && timeZone !== null && !isValidTimeZone(timeZone)) {
    return NextResponse.json({ error: 'Unknown time zone' }, { status: 400 })
  }

  try {
    const now = new Date().toISOString()
    const set: Record<string, unknown> = { quietStart, quietEnd, enabled: enabled ?? true, updated_at: now }
    if (typeof timeZone === 'string') set.timeZone = timeZone
    const db = await getMongoDb()
    await db.collection('notification_preferences').updateOne(
      { user_id: user.id, type: 'quiet_hours' },
      {
        $set: set,
        $setOnInsert: { user_id: user.id, type: 'quiet_hours', created_at: now },
      },
      { upsert: true },
    )
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[CodeSpectra] quiet-hours PUT:', e)
    return NextResponse.json({ error: 'Failed to save quiet hours' }, { status: 500 })
  }
}

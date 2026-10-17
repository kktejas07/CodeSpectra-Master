import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/api-auth'
import { getMongoDb } from '@/lib/mongodb'

const DEFAULTS = { quietStart: '22:00', quietEnd: '08:00' }
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

// Keyed by { user_id, type: 'quiet_hours' }. (A fixed `_id` would collide
// across users, since `_id` is unique for the whole collection.)
export async function GET() {
  const user = await getAPIUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const db = await getMongoDb()
  const doc = await db.collection('notification_preferences').findOne({ user_id: user.id, type: 'quiet_hours' })
  return NextResponse.json({
    quietStart: typeof doc?.quietStart === 'string' ? doc.quietStart : DEFAULTS.quietStart,
    quietEnd: typeof doc?.quietEnd === 'string' ? doc.quietEnd : DEFAULTS.quietEnd,
  })
}

export async function PUT(req: NextRequest) {
  const user = await getAPIUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const { quietStart, quietEnd } = body as { quietStart?: unknown; quietEnd?: unknown }

  if (typeof quietStart !== 'string' || typeof quietEnd !== 'string' || !HHMM.test(quietStart) || !HHMM.test(quietEnd)) {
    return NextResponse.json({ error: 'quietStart and quietEnd must be HH:MM' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const db = await getMongoDb()
  await db.collection('notification_preferences').updateOne(
    { user_id: user.id, type: 'quiet_hours' },
    {
      $set: { quietStart, quietEnd, updated_at: now },
      $setOnInsert: { user_id: user.id, type: 'quiet_hours', created_at: now },
    },
    { upsert: true },
  )

  return NextResponse.json({ success: true })
}

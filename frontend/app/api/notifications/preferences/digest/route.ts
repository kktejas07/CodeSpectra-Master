import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/api-auth'
import { getMongoDb } from '@/lib/mongodb'
import { DIGEST_DEFAULTS } from '@/lib/notifications-delivery'

/**
 * Email digest preferences, stored as { user_id, type: 'digest', daily, weekly }
 * in `notification_preferences`.
 * - daily  → /api/cron/daily-digest (off by default)
 * - weekly → /api/cron/weekly-digest (on by default)
 */

export async function GET() {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })
  try {
    const db = await getMongoDb()
    const doc = await db.collection('notification_preferences').findOne({ user_id: user.id, type: 'digest' })
    return NextResponse.json({
      daily: typeof doc?.daily === 'boolean' ? doc.daily : DIGEST_DEFAULTS.daily,
      weekly: typeof doc?.weekly === 'boolean' ? doc.weekly : DIGEST_DEFAULTS.weekly,
    })
  } catch (e) {
    console.error('[CodeSpectra] digest prefs GET:', e)
    return NextResponse.json({ error: 'Failed to load digest preferences' }, { status: 500 })
  }
}

/** PATCH body: { daily?: boolean, weekly?: boolean } — nothing else is accepted. */
export async function PATCH(req: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const set: Record<string, boolean> = {}
  if (typeof body.daily === 'boolean') set.daily = body.daily
  if (typeof body.weekly === 'boolean') set.weekly = body.weekly
  if (Object.keys(set).length === 0) return NextResponse.json({ error: 'Nothing to update', code: 'nothing_to_update' }, { status: 400 })

  try {
    const now = new Date().toISOString()
    const db = await getMongoDb()
    await db.collection('notification_preferences').updateOne(
      { user_id: user.id, type: 'digest' },
      { $set: { ...set, updated_at: now }, $setOnInsert: { user_id: user.id, type: 'digest', created_at: now } },
      { upsert: true },
    )
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[CodeSpectra] digest prefs PATCH:', e)
    return NextResponse.json({ error: 'Failed to update digest preferences' }, { status: 500 })
  }
}

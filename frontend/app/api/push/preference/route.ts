/**
 * PUT /api/push/preference { enabled } — the push channel switch for all of
 * the user's devices (notification_preferences { user_id, type: 'push' }).
 * Honoured by lib/push-notifications.ts for app push and FCM alike.
 */
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { limitRequest } from '@/lib/rate-limit'
import { getMongoDb } from '@/lib/mongodb'
import { preferenceSchema } from '@/lib/pwa/push-schemas'
import { nowIso } from '@/lib/db/ids'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PUT(req: Request) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const limited = await limitRequest(req, 'push-preference', gate.user.id, 20, 60_000)
  if (limited) return limited
  const parsed = preferenceSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  try {
    const now = nowIso()
    await (await getMongoDb()).collection('notification_preferences').updateOne(
      { user_id: gate.user.id, type: 'push' },
      { $set: { enabled: parsed.data.enabled, updated_at: now }, $setOnInsert: { user_id: gate.user.id, type: 'push', created_at: now } },
      { upsert: true },
    )
    return NextResponse.json({ ok: true, enabled: parsed.data.enabled }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) {
    console.error('[push/preference] PUT failed:', (e as Error)?.message)
    return NextResponse.json({ error: 'Could not save' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/api-auth'
import { notificationPreferences } from '@/lib/db/admin'
import type { IdRouteContext } from '@/lib/app-route-context'

const CHANNELS = new Set(['email', 'in_app', 'slack'])
const CATEGORIES = new Set(['support', 'billing', 'integrations', 'security', 'updates'])

/**
 * PATCH /api/notifications/preferences/:channel
 * Body: { enabled?: boolean, "categories.<name>"?: boolean }
 * Only those fields are accepted (no mass assignment of user_id etc.).
 * Keyed by { user_id, type } so each user gets their own row.
 */
export async function PATCH(req: NextRequest, { params }: IdRouteContext) {
  const { id } = await params
  try {
    const user = await getAPIUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!CHANNELS.has(id)) {
      return NextResponse.json({ error: 'Unknown channel' }, { status: 400 })
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const set: Record<string, boolean> = {}
    for (const [key, value] of Object.entries(body)) {
      if (typeof value !== 'boolean') continue
      if (key === 'enabled') set.enabled = value
      else if (key.startsWith('categories.') && CATEGORIES.has(key.slice('categories.'.length))) set[key] = value
    }
    if (Object.keys(set).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    const now = new Date().toISOString()
    const col = await notificationPreferences()
    await col.updateOne(
      { user_id: user.id, type: id },
      {
        $set: { ...set, updated_at: now },
        $setOnInsert: { id, user_id: user.id, type: id, created_at: now },
      },
      { upsert: true },
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[CodeSpectra] Preferences update error:', error)
    return NextResponse.json({ error: 'Failed to update preferences' }, { status: 500 })
  }
}

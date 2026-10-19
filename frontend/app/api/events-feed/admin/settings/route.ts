/**
 * POST /api/events-feed/admin/settings — superadmin. Body: { feed?: {...}, subscription?: {...} }
 * feed: pull interval, digest day/hour/timezone, toggles, WhatsApp template names, message templates.
 * subscription: WhatsApp opt-in template, template language, display number, quiet hours.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { auditAdmin } from '@/lib/admin-audit'
import { saveEventsFeedSettings } from '@/lib/events-feed/settings'
import { saveSubscriptionSettings } from '@/lib/subscriptions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const b = (await req.json().catch(() => ({}))) as { feed?: unknown; subscription?: unknown }
  const out: Record<string, unknown> = {}
  if (b.feed && typeof b.feed === 'object') out.settings = await saveEventsFeedSettings(b.feed as Record<string, unknown>)
  if (b.subscription && typeof b.subscription === 'object') out.subscription = await saveSubscriptionSettings(b.subscription as Record<string, unknown>)
  await auditAdmin(auth.user, 'events_feed.settings', 'events_feed', 'settings', Object.keys(out).join(','))
  return NextResponse.json({ ok: true, ...out })
}

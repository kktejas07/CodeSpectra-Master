/** GET /api/events-feed/admin/overview — superadmin: sources, counts, settings, subscriber + delivery stats. */
import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { feedCounts, listSourcesForAdmin } from '@/lib/events-feed/admin'
import { getEventsFeedSettings } from '@/lib/events-feed/settings'
import { deliveryStats, getSubscriptionSettings, subscriberStats } from '@/lib/subscriptions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireSuperAdmin()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const since = new Date(Date.now() - 30 * 24 * 3600_000).toISOString()
  const [sources, counts, settings, subscription, subscribers, deliveries] = await Promise.all([
    listSourcesForAdmin(), feedCounts(), getEventsFeedSettings(), getSubscriptionSettings(), subscriberStats(), deliveryStats(since),
  ])
  return NextResponse.json({ sources, counts, settings, subscription, subscribers, deliveries })
}

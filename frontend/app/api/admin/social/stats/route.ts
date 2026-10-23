/**
 * Admin → Social studio → stats (superadmin).
 *  GET → posts per platform per week (last 8 weeks, from "Mark as posted"),
 *        and visits from social links in the last 28 days (page views that
 *        arrived with utm_medium=social, by utm_source and utm_campaign) —
 *        `visits` is null when analytics can't be read.
 */
import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { apiErrorFor } from '@/lib/api-errors'
import { getMongoDb } from '@/lib/mongodb'
import { weeklyPostCounts } from '@/lib/social/queue'
import { queueCol } from '@/lib/social/store'
import { SOCIAL_PLATFORMS } from '@/lib/social/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const WEEKS = 8

export async function GET() {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    const now = new Date()
    const since = new Date(now.getTime() - WEEKS * 7 * 86_400_000).toISOString()
    const docs = await (await queueCol()).find({ last_posted_at: { $gte: since } }, { projection: { _id: 0, posts: 1 } }).limit(5000).toArray()
    let visits: { source: string; campaign: string; visits: number }[] | null = null
    try {
      const day = new Date(now.getTime() - 28 * 86_400_000).toISOString().slice(0, 10)
      const rows = await (await getMongoDb()).collection('analytics_events').aggregate<{ _id: { s: string; c: string }; n: number }>([
        { $match: { day: { $gte: day }, kind: 'page', utm_medium: 'social', utm_source: { $in: [...SOCIAL_PLATFORMS] } } },
        { $group: { _id: { s: '$utm_source', c: '$utm_campaign' }, n: { $sum: 1 } } },
        { $sort: { n: -1 } },
        { $limit: 100 },
      ], { maxTimeMS: 5000 }).toArray()
      visits = rows.map((r) => ({ source: r._id.s, campaign: r._id.c || '', visits: r.n }))
    } catch (e) {
      console.warn('[social] stats visits:', (e as Error)?.message)
    }
    return NextResponse.json({ weeks: weeklyPostCounts(docs, WEEKS, now), visits })
  } catch (e) {
    console.error('[social] stats:', (e as Error)?.message)
    return NextResponse.json(apiErrorFor('server_error'), { status: 500 })
  }
}

/**
 * GET /api/admin/analytics/overview — Aggregated analytics for admin dashboard.
 *
 * Returns: visitors, sessions, pageviews, top pages, traffic sources, device breakdown, hourly activity.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { analyticsEvents, analyticsSessions, analyticsPageviews } from '@/lib/db/analytics'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const { searchParams } = new URL(req.url)
  const range = searchParams.get('range') || '24h'
  const now = new Date()
  let since: Date
  if (range === '7d') since = new Date(now.getTime() - 7 * 86400_000)
  else if (range === '30d') since = new Date(now.getTime() - 30 * 86400_000)
  else since = new Date(now.getTime() - 24 * 3600_000)
  const sinceIso = since.toISOString()

  try {
    const [eventsCol, sessionsCol, pageviewsCol] = await Promise.all([
      analyticsEvents(),
      analyticsSessions(),
      analyticsPageviews(),
    ])

    // Unique visitors (anonymous_id or user_id)
    const uniqueVisitors = await eventsCol.aggregate([
      { $match: { timestamp: { $gte: sinceIso } } },
      { $group: { _id: { $ifNull: ['$user_id', '$anonymous_id'] } } },
      { $count: 'total' },
    ]).toArray()

    // Total sessions
    const totalSessions = await sessionsCol.countDocuments({ started_at: { $gte: sinceIso } })

    // Active now (last 5 minutes)
    const fiveMinAgo = new Date(now.getTime() - 5 * 60_000).toISOString()
    const activeNow = await sessionsCol.countDocuments({ last_activity_at: { $gte: fiveMinAgo } })

    // Total pageviews
    const totalPageviews = await pageviewsCol.countDocuments({ timestamp: { $gte: sinceIso } })

    // Top pages
    const topPages = await pageviewsCol.aggregate([
      { $match: { timestamp: { $gte: sinceIso } } },
      { $group: { _id: '$path', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]).toArray()

    // Traffic sources (referrer)
    const trafficSources = await eventsCol.aggregate([
      { $match: { timestamp: { $gte: sinceIso }, referrer: { $ne: '', $exists: true } } },
      { $group: { _id: '$referrer', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]).toArray()

    // Device breakdown
    const deviceBreakdown = await eventsCol.aggregate([
      { $match: { timestamp: { $gte: sinceIso } } },
      { $group: { _id: '$device_type', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]).toArray()

    // Browser breakdown
    const browserBreakdown = await eventsCol.aggregate([
      { $match: { timestamp: { $gte: sinceIso } } },
      { $group: { _id: '$browser', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]).toArray()

    // Hourly activity (last 24h for chart)
    const hourlyActivity = await eventsCol.aggregate([
      { $match: { timestamp: { $gte: new Date(now.getTime() - 24 * 3600_000).toISOString() } } },
      { $group: { _id: { $substr: ['$timestamp', 0, 13] }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]).toArray()

    // Event breakdown (top event types)
    const eventBreakdown = await eventsCol.aggregate([
      { $match: { timestamp: { $gte: sinceIso } } },
      { $group: { _id: '$event', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]).toArray()

    // Live sessions (last 5 min)
    const liveSessions = await sessionsCol
      .find({ last_activity_at: { $gte: fiveMinAgo } })
      .sort({ last_activity_at: -1 })
      .limit(50)
      .toArray()

    return NextResponse.json({
      uniqueVisitors: uniqueVisitors[0]?.total ?? 0,
      totalSessions,
      activeNow,
      totalPageviews,
      topPages: topPages.map(p => ({ path: p._id, views: p.count })),
      trafficSources: trafficSources.map(s => ({ source: s._id, count: s.count })),
      deviceBreakdown: deviceBreakdown.map(d => ({ device: d._id, count: d.count })),
      browserBreakdown: browserBreakdown.map(b => ({ browser: b._id, count: b.count })),
      hourlyActivity: hourlyActivity.map(h => ({ hour: h._id, events: h.count })),
      eventBreakdown: eventBreakdown.map(e => ({ event: e._id, count: e.count })),
      liveSessions,
      range,
    })
  } catch (e) {
    console.error('[analytics overview] error:', e)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

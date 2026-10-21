import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { getActiveSessions, getSessionStats } from '@/lib/db/sessions'

export async function GET() {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    const db = await getMongoDb()
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayIso = todayStart.toISOString()
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    const [settings, activeSessions, sessionStats, loginEvents, recentAlerts, geoStats, securityEvents, fingerprints, blockedIps] = await Promise.all([
      db.collection('security_settings').find({}).toArray(),
      getActiveSessions(50),
      getSessionStats(),
      db.collection('admin_audit_logs').find({
        action: { $regex: /^auth\./ },
        ts: { $gte: todayIso },
      }).sort({ ts: -1 }).limit(50).toArray(),
      db.collection('admin_audit_logs').find({
        severity: { $in: ['warning', 'critical'] },
        ts: { $gte: sevenDaysAgo },
      }).sort({ ts: -1 }).limit(20).toArray(),
      db.collection('admin_audit_logs').aggregate<{ _id: string; count: number }>([
        { $match: { action: 'auth.login', ts: { $gte: todayIso } } },
        { $group: { _id: '$actorIp', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]).toArray(),
      db.collection('security_events').find({}).sort({ ts: -1 }).limit(20).toArray(),
      db.collection('device_fingerprints').aggregate([
        { $addFields: { account_count: { $size: { $ifNull: ['$accounts', []] } } } },
        { $sort: { last_seen: -1 } },
        { $limit: 20 },
      ]).toArray(),
      db.collection('security_blocklist').find({ active: { $ne: false } }).sort({ blocked_at: -1 }).limit(20).toArray(),
    ])

    const successCount = loginEvents.filter(e => e.outcome === 'success').length
    const failedCount = loginEvents.filter(e => e.outcome === 'denied').length

    return NextResponse.json({
      settings,
      activeSessions,
      sessionStats: {
        totalToday: sessionStats.totalToday,
        uniqueUsersToday: sessionStats.uniqueUsersToday,
        activeNow: sessionStats.activeNow,
        successCount,
        failedCount,
      },
      loginEvents,
      recentAlerts,
      geoStats,
      securityEvents,
      fingerprints,
      blockedIps,
    })
  } catch (e) {
    console.error('[security dashboard] Error:', e)
    return NextResponse.json({ error: 'Failed', code: 'failed' }, { status: 500 })
  }
}

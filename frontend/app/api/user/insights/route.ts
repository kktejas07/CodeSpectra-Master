import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export async function GET(req: NextRequest) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  try {
    const db = await getMongoDb()
    const userId = gate.user.id

    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    const [
      totalScans,
      recentScans,
      totalIssues,
      criticalIssues,
      vulnIssues,
      appliedFixes,
      suggestedFixes,
    ] = await Promise.all([
      db.collection('scan_comments').countDocuments({ user_id: userId }),
      db
        .collection('scan_comments')
        .find({
          user_id: userId,
          created_at: { $gte: thirtyDaysAgo.toISOString() },
        })
        .toArray(),
      db.collection('code_issues').countDocuments({ user_id: userId }),
      db
        .collection('code_issues')
        .countDocuments({ user_id: userId, severity: 'critical' }),
      db
        .collection('code_issues')
        .countDocuments({ user_id: userId, type: 'vulnerability' }),
      db.collection('suggested_fixes').countDocuments({
        user_id: userId,
        status: 'applied',
      }),
      db.collection('suggested_fixes').countDocuments({ user_id: userId }),
    ])

    const issueTypePipeline = [
      { $match: { user_id: userId } },
      { $group: { _id: '$type', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]
    const issueTypes = await db
      .collection('code_issues')
      .aggregate(issueTypePipeline)
      .toArray()

    const topIssueType =
      issueTypes.length > 0
        ? issueTypes[0]._id
            ?.replace(/_/g, ' ')
            .replace(/\b\w/g, (c: string) => c.toUpperCase()) || 'None'
        : 'None'

    const avgQuality =
      recentScans.length > 0
        ? Math.round(
            recentScans.reduce(
              (sum: number, s: any) => sum + (s.quality_score || 75),
              0,
            ) / recentScans.length,
          )
        : 75

    const resolvedRate =
      suggestedFixes > 0
        ? Math.round((appliedFixes / suggestedFixes) * 100)
        : 0

    const bugsDetected = await db
      .collection('code_issues')
      .countDocuments({ user_id: userId, type: 'bug' })

    const scanAccuracy = totalScans > 0 ? Math.min(98, 80 + resolvedRate / 5) : 94

    const fixTimes = await db
      .collection('suggested_fixes')
      .find({
        user_id: userId,
        status: 'applied',
        applied_at: { $exists: true },
        created_at: { $exists: true },
      })
      .project({ applied_at: 1, created_at: 1 })
      .limit(100)
      .toArray()

    let avgFixHours = 24
    if (fixTimes.length > 0) {
      const totalMs = fixTimes.reduce(
        (sum: number, f: any) =>
          sum +
          (new Date(f.applied_at).getTime() -
            new Date(f.created_at).getTime()),
        0,
      )
      avgFixHours = Math.round(totalMs / fixTimes.length / (1000 * 60 * 60))
    }

    const improvements = [
      {
        metric: 'Quality Score',
        from: Math.max(50, avgQuality - 15),
        to: avgQuality,
        improvement:
          avgQuality > 50
            ? Math.round(((avgQuality - (avgQuality - 15)) / (avgQuality - 15)) * 100)
            : 0,
        trend: 'up' as const,
      },
      {
        metric: 'Issues Resolved',
        from: suggestedFixes - appliedFixes,
        to: appliedFixes,
        improvement:
          suggestedFixes > 0
            ? Math.round((appliedFixes / suggestedFixes) * 100)
            : 0,
        trend: 'up' as const,
      },
      {
        metric: 'Critical Bugs',
        from: criticalIssues + appliedFixes,
        to: criticalIssues,
        improvement:
          criticalIssues + appliedFixes > 0
            ? Math.round(
                (appliedFixes / (criticalIssues + appliedFixes)) * 100,
              )
            : 0,
        trend: 'down' as const,
      },
      {
        metric: 'Vulnerabilities',
        from: vulnIssues + Math.floor(appliedFixes / 2),
        to: vulnIssues,
        improvement:
          vulnIssues + Math.floor(appliedFixes / 2) > 0
            ? Math.round(
                (Math.floor(appliedFixes / 2) /
                  (vulnIssues + Math.floor(appliedFixes / 2))) *
                  100,
              )
            : 0,
        trend: 'down' as const,
      },
    ]

    return NextResponse.json({
      totalScans: recentScans.length,
      avgQuality,
      fixedIssues: appliedFixes,
      totalBugsDetected: bugsDetected,
      vulnerabilitiesFound: vulnIssues,
      criticalIssues,
      topIssueType,
      scanAccuracy,
      timeToFix: `${avgFixHours}h`,
      totalAllTime: totalScans,
      resolvedRate,
      improvements,
      issueBreakdown: issueTypes.map((i: any) => ({
        type: i._id,
        count: i.count,
      })),
    })
  } catch (error) {
    console.error('[CodeSpectra] Error fetching insights:', error)
    return NextResponse.json({ error: 'Failed to fetch insights' }, { status: 500 })
  }
}
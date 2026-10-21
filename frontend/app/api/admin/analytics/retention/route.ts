/**
 * GET /api/admin/analytics/retention — Compute cohort retention curves.
 *
 * Groups users by signup week, then checks activity on Day 1/7/14/30.
 * Returns a retention table: cohorts × days.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { analyticsSessions } from '@/lib/db/analytics'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const { searchParams } = new URL(req.url)
  const weeks = Math.min(parseInt(searchParams.get('weeks') || '8'), 12)

  try {
    const col = await analyticsSessions()
    const now = new Date()

    // Get all sessions with user_id (anonymous users can't be tracked for retention)
    const allSessions = await col
      .find({ user_id: { $exists: true, $ne: '' } as any })
      .project({ user_id: 1, started_at: 1 })
      .sort({ started_at: 1 })
      .limit(50000)
      .toArray()

    // Group users by their first session week (cohort)
    const userFirstSeen = new Map<string, Date>()
    for (const s of allSessions) {
      const uid = s.user_id as string
      if (!uid) continue
      const ts = new Date(s.started_at)
      if (!userFirstSeen.has(uid) || ts < userFirstSeen.get(uid)!) {
        userFirstSeen.set(uid, ts)
      }
    }

    // Build cohorts by week
    const cohorts: { week_start: Date; users: string[] }[] = []
    for (let w = 0; w < weeks; w++) {
      const weekStart = new Date(now.getTime() - (w + 1) * 7 * 86400_000)
      const weekEnd = new Date(weekStart.getTime() + 7 * 86400_000)
      const users: string[] = []
      for (const [uid, firstSeen] of userFirstSeen) {
        if (firstSeen >= weekStart && firstSeen < weekEnd) {
          users.push(uid)
        }
      }
      cohorts.push({ week_start: weekStart, users })
    }

    // Build active users by day
    const userActiveDays = new Map<string, Set<string>>()
    for (const s of allSessions) {
      const uid = s.user_id as string
      if (!uid) continue
      const day = new Date(s.started_at).toISOString().slice(0, 10)
      if (!userActiveDays.has(uid)) userActiveDays.set(uid, new Set())
      userActiveDays.get(uid)!.add(day)
    }

    // Compute retention for each cohort
    const retentionDays = [0, 1, 7, 14, 30]
    const result = cohorts.map(cohort => {
      const cohortSize = cohort.users.length
      if (cohortSize === 0) {
        return {
          cohort_week: cohort.week_start.toISOString().slice(0, 10),
          cohort_size: 0,
          retention: retentionDays.map(() => 0),
        }
      }

      const retention = retentionDays.map(dayOffset => {
        let activeCount = 0
        for (const uid of cohort.users) {
          const activeDays = userActiveDays.get(uid)
          if (!activeDays) continue
          // Check if user was active on any day after cohort_start + dayOffset
          const checkDate = new Date(cohort.week_start.getTime() + dayOffset * 86400_000)
          for (let d = 0; d <= Math.min(dayOffset + 7, 30); d++) {
            const dStr = new Date(checkDate.getTime() + d * 86400_000).toISOString().slice(0, 10)
            if (activeDays.has(dStr)) {
              activeCount++
              break
            }
          }
        }
        return Math.round((activeCount / cohortSize) * 10000) / 100
      })

      return {
        cohort_week: cohort.week_start.toISOString().slice(0, 10),
        cohort_size: cohortSize,
        retention,
      }
    }).reverse() // oldest first

    return NextResponse.json({
      cohorts: result,
      retention_days: retentionDays,
      total_users: userFirstSeen.size,
    })
  } catch (e) {
    console.error('[retention] error:', e)
    return NextResponse.json({ error: 'Failed', code: 'failed' }, { status: 500 })
  }
}

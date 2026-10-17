import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export async function GET(req: NextRequest) {
  const gate = await requireAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  try {
    const db = await getMongoDb()
    const { searchParams } = new URL(req.url)
    const weeks = Math.min(parseInt(searchParams.get('weeks') || '8'), 26)
    const now = new Date()

    const allMembers = await db.collection('team_members').find({}).toArray()
    let teamMembers = allMembers
    // tenant_admin: only members whose user record belongs to the caller's
    // tenant (team_members carries no tenant_id). No tenantId → nobody.
    if (gate.user.role !== 'superadmin') {
      const tenantId = gate.user.tenantId
      const ids = allMembers.map((m: any) => m.user_id || m.userId || m.id).filter(Boolean)
      const inTenant = tenantId && ids.length
        ? await db.collection('user').find(
            { id: { $in: ids }, $or: [{ tenantId }, { organizationId: tenantId }, { tenant_id: tenantId }] },
            { projection: { id: 1 } },
          ).toArray()
        : []
      const allowed = new Set(inTenant.map((u) => String(u.id)))
      teamMembers = allMembers.filter((m: any) => allowed.has(String(m.user_id || m.userId || m.id)))
    }
    const userIds = teamMembers.map((m: any) => m.user_id || m.userId || m.id).filter(Boolean)

    if (userIds.length === 0) {
      return NextResponse.json({
        cells: Array.from({ length: weeks }, () => Array(7).fill(0)),
        dayLabels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        monthLabels: [],
        tooltipData: {},
        totalContributions: 0,
        totalActiveDays: 0,
        userStats: [],
        recentActivity: [],
      })
    }

    const startDate = new Date(now)
    startDate.setDate(startDate.getDate() - (weeks * 7) + (6 - now.getDay()))
    const endDate = new Date(now)
    endDate.setDate(endDate.getDate() + (6 - endDate.getDay()))

    const startStr = startDate.toISOString().slice(0, 10)
    const endStr = endDate.toISOString().slice(0, 10)

    const matchStage = {
      user_id: { $in: userIds },
      created_at: { $gte: `${startStr}T00:00:00.000Z`, $lt: `${endStr}T23:59:59.999Z` }
    }

    const dateKey = (d: Date) => d.toISOString().slice(0, 10)

    const buildDateMap = async (collection: string, dateField = 'created_at') => {
      const pipeline = [
        { $match: { ...matchStage, [dateField]: { $exists: true } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: `$${dateField}` } },
            count: { $sum: 1 },
            users: { $addToSet: '$user_id' },
          }
        }
      ]
      const results = await db.collection(collection).aggregate(pipeline).toArray()
      const map: Record<string, { count: number; users: string[] }> = {}
      for (const r of results) map[r._id] = { count: r.count, users: r.users }
      return map
    }

    const [scanMap, reviewMap, fixMap, submissionMap] = await Promise.all([
      buildDateMap('scan_comments'),
      buildDateMap('code_review_comments'),
      buildDateMap('suggested_fixes'),
      buildDateMap('submissions', 'submittedAt'),
    ])

    const allDates = new Set<string>()
    const cursor = new Date(startDate)
    while (cursor <= endDate) {
      allDates.add(dateKey(cursor))
      cursor.setDate(cursor.getDate() + 1)
    }

    const dayDataMap: Record<string, { count: number; users: string[] }> = {}
    for (const d of allDates) {
      dayDataMap[d] = { count: 0, users: [] }
    }
    for (const [d, data] of Object.entries(scanMap)) {
      if (dayDataMap[d]) { dayDataMap[d].count += data.count; dayDataMap[d].users.push(...data.users) }
    }
    for (const [d, data] of Object.entries(reviewMap)) {
      if (dayDataMap[d]) { dayDataMap[d].count += data.count; dayDataMap[d].users.push(...data.users) }
    }
    for (const [d, data] of Object.entries(fixMap)) {
      if (dayDataMap[d]) { dayDataMap[d].count += data.count; dayDataMap[d].users.push(...data.users) }
    }
    for (const [d, data] of Object.entries(submissionMap)) {
      if (dayDataMap[d]) { dayDataMap[d].count += data.count; dayDataMap[d].users.push(...data.users) }
    }

    const endOfWeek = new Date(now)
    endOfWeek.setDate(endOfWeek.getDate() + (6 - endOfWeek.getDay()))

    const cells: number[][] = []
    const tooltipData: Record<string, { date: string; count: number; activeUsers: number }> = {}
    const totalActiveDays = Object.values(dayDataMap).filter(d => d.count > 0).length

    for (let w = 0; w < weeks; w++) {
      const row: number[] = []
      for (let d = 0; d < 7; d++) {
        const date = new Date(endOfWeek)
        date.setDate(date.getDate() - ((weeks - 1 - w) * 7 + (6 - d)))
        const dateStr = dateKey(date)
        const data = dayDataMap[dateStr]
        const count = data?.count ?? 0
        const level = count === 0 ? 0 : count <= 5 ? 1 : count <= 15 ? 2 : count <= 30 ? 3 : 4
        row.push(level)
        if (data && count > 0) {
          tooltipData[dateStr] = { date: dateStr, count, activeUsers: new Set(data.users).size }
        }
      }
      cells.push(row)
    }

    const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

    const monthLabels: Array<{ label: string; colIndex: number }> = []
    let lastMonth = -1
    for (let w = 0; w < weeks; w++) {
      const date = new Date(endOfWeek)
      date.setDate(date.getDate() - ((weeks - 1 - w) * 7))
      const month = date.getMonth()
      if (month !== lastMonth) {
        monthLabels.push({ label: date.toLocaleString('en-US', { month: 'short' }), colIndex: w })
        lastMonth = month
      }
    }

    const userStatsPipeline = async () => {
      const targetIds = userIds.slice(0, 20)
      const [scanStats, reviewStats, fixStats, submissionStats, userDocs] = await Promise.all([
        db.collection('scan_comments').aggregate([
          { $match: { user_id: { $in: targetIds } } },
          { $group: { _id: '$user_id', count: { $sum: 1 } } },
        ]).toArray(),
        db.collection('code_review_comments').aggregate([
          { $match: { user_id: { $in: targetIds } } },
          { $group: { _id: '$user_id', count: { $sum: 1 } } },
        ]).toArray(),
        db.collection('suggested_fixes').aggregate([
          { $match: { user_id: { $in: targetIds } } },
          { $group: { _id: '$user_id', count: { $sum: 1 } } },
        ]).toArray(),
        db.collection('submissions').aggregate([
          { $match: { user_id: { $in: targetIds } } },
          { $group: { _id: '$user_id', count: { $sum: 1 } } },
        ]).toArray(),
        db.collection('user').find(
          { id: { $in: targetIds } },
          { projection: { id: 1, name: 1, email: 1 } },
        ).toArray(),
      ])

      const counts: Record<string, { scans: number; reviews: number; fixes: number; submissions: number }> = {}
      for (const uid of targetIds) counts[uid] = { scans: 0, reviews: 0, fixes: 0, submissions: 0 }
      for (const s of scanStats) counts[s._id] = { ...counts[s._id], scans: s.count }
      for (const s of reviewStats) counts[s._id] = { ...counts[s._id], reviews: s.count }
      for (const s of fixStats) counts[s._id] = { ...counts[s._id], fixes: s.count }
      for (const s of submissionStats) counts[s._id] = { ...counts[s._id], submissions: s.count }

      const userById: Record<string, { name: string; email: string }> = {}
      for (const u of userDocs) userById[u.id as string] = { name: (u as any).name || String(u.id).slice(0, 8), email: (u as any).email || '' }

      return targetIds
        .map((uid) => ({ userId: uid, name: userById[uid]?.name || uid.slice(0, 8), email: userById[uid]?.email || '', ...counts[uid], total: counts[uid].scans + counts[uid].reviews + counts[uid].fixes + counts[uid].submissions }))
        .filter((x) => x.total > 0)
        .sort((a, b) => b.total - a.total)
    }

    const recentActivityPipeline = async () => {
      const events: Array<{ ts: string; type: string; title: string; meta: string; detail: string; userId: string }> = []

      const scans = await db.collection('scan_comments')
        .find({ user_id: { $in: userIds } })
        .sort({ created_at: -1 })
        .limit(5)
        .toArray()

      for (const s of scans) {
        const user = teamMembers.find((m: any) => (m.user_id || m.userId || m.id) === s.user_id)
        events.push({
          ts: s.created_at as string,
          type: 'scan',
          title: 'Code scan completed',
          meta: `${(user as any)?.name || 'Member'} · ${timeAgo(s.created_at as string)}`,
          detail: (s.file_path as string) || 'Repository scan',
          userId: s.user_id as string,
        })
      }

      const reviews = await db.collection('code_review_comments')
        .find({ user_id: { $in: userIds } })
        .sort({ created_at: -1 })
        .limit(3)
        .toArray()

      for (const r of reviews) {
        const user = teamMembers.find((m: any) => (m.user_id || m.userId || m.id) === r.user_id)
        events.push({
          ts: r.created_at as string,
          type: 'review',
          title: 'Code review submitted',
          meta: `${(user as any)?.name || 'Member'} · ${timeAgo(r.created_at as string)}`,
          detail: (r.file_path as string) || 'Code review',
          userId: r.user_id as string,
        })
      }

      return events.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime()).slice(0, 10)
    }

    const [userStats, recentActivity] = await Promise.all([userStatsPipeline(), recentActivityPipeline()])

    return NextResponse.json({
      cells,
      dayLabels,
      monthLabels,
      tooltipData,
      totalContributions: Object.values(dayDataMap).reduce((s, d) => s + d.count, 0),
      totalActiveDays,
      totalMembers: userIds.length,
      userStats,
      recentActivity,
    })
  } catch (error) {
    console.error('[CodeSpectra] Error fetching team activity:', error)
    return NextResponse.json({ error: 'Failed to fetch team activity' }, { status: 500 })
  }
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return iso.slice(0, 10)
}
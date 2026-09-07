import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

interface DayData {
  date: string
  count: number
  types: {
    scan: number
    review: number
    fix: number
    challenge: number
  }
}

export async function GET(req: NextRequest) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  let weeks = 52
  try {
    const db = await getMongoDb()
    const { searchParams } = new URL(req.url)
    // Optional ?userId for other users' public heatmaps (same aggregation shape,
    // counts only — no PII beyond what the public profile page already shows).
    const requestedUserId = (searchParams.get('userId') || '').trim()
    const userId = requestedUserId || gate.user.id
    weeks = Math.min(parseInt(searchParams.get('weeks') || '52'), 52)
    const now = new Date()

    const startDate = new Date(now)
    startDate.setDate(startDate.getDate() - (weeks * 7) + (6 - now.getDay()))

    const endDate = new Date(now)
    endDate.setDate(endDate.getDate() + (6 - endDate.getDay()))

    const startStr = startDate.toISOString().slice(0, 10)
    const endStr = endDate.toISOString().slice(0, 10)

    const matchStage = {
      user_id: userId,
      created_at: { $gte: `${startStr}T00:00:00.000Z`, $lt: `${endStr}T23:59:59.999Z` }
    }

    const dateKey = (d: Date) => d.toISOString().slice(0, 10)

    const buildDateMap = async (collection: string, type: 'scan' | 'review' | 'fix' | 'challenge', dateField = 'created_at') => {
      try {
        const pipeline = [
          { $match: matchStage },
          {
            $group: {
              _id: {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: { $toDate: `$${dateField}` }
                }
              },
              count: { $sum: 1 }
            }
          }
        ]
        const results = await db.collection(collection).aggregate(pipeline).toArray()
        const map: Record<string, number> = {}
        for (const r of results) {
          if (r._id && r._id !== 'Invalid Date') map[r._id] = r.count
        }
        return map
      } catch {
        return {}
      }
    }

    const [scanMap, reviewMap, fixMap, challengeMap] = await Promise.all([
      buildDateMap('scan_comments', 'scan'),
      buildDateMap('code_review_comments', 'review'),
      buildDateMap('suggested_fixes', 'fix'),
      buildDateMap('submissions', 'challenge'),
    ])

    const allDates = new Set<string>()
    const cursor = new Date(startDate)
    while (cursor <= endDate) {
      allDates.add(dateKey(cursor))
      cursor.setDate(cursor.getDate() + 1)
    }

    const dayDataMap: Record<string, DayData> = {}
    for (const d of allDates) {
      dayDataMap[d] = { date: d, count: 0, types: { scan: 0, review: 0, fix: 0, challenge: 0 } }
    }
    for (const [d, c] of Object.entries(scanMap)) { if (dayDataMap[d]) { dayDataMap[d].types.scan += c; dayDataMap[d].count += c } }
    for (const [d, c] of Object.entries(reviewMap)) { if (dayDataMap[d]) { dayDataMap[d].types.review += c; dayDataMap[d].count += c } }
    for (const [d, c] of Object.entries(fixMap)) { if (dayDataMap[d]) { dayDataMap[d].types.fix += c; dayDataMap[d].count += c } }
    for (const [d, c] of Object.entries(challengeMap)) { if (dayDataMap[d]) { dayDataMap[d].types.challenge += c; dayDataMap[d].count += c } }

    const endOfWeek = new Date(now)
    endOfWeek.setDate(endOfWeek.getDate() + (6 - endOfWeek.getDay()))

    const cells: number[][] = []
    const tooltipData: Record<string, DayData> = {}
    const totalActiveDays = Object.values(dayDataMap).filter(d => d.count > 0).length

    for (let w = 0; w < weeks; w++) {
      const row: number[] = []
      for (let d = 0; d < 7; d++) {
        const date = new Date(endOfWeek)
        date.setDate(date.getDate() - ((weeks - 1 - w) * 7 + (6 - d)))
        const dateStr = dateKey(date)
        const data = dayDataMap[dateStr]
        const count = data?.count ?? 0
        const level = count === 0 ? 0 : count <= 2 ? 1 : count <= 5 ? 2 : count <= 10 ? 3 : 4
        row.push(level)
        if (data) tooltipData[dateStr] = data
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

    return NextResponse.json({
      cells,
      dayLabels,
      monthLabels,
      tooltipData,
      totalActiveDays,
      totalContributions: Object.values(dayDataMap).reduce((s, d) => s + d.count, 0),
    })
  } catch (error) {
    console.error('[CodeSpectra] Error fetching contribution heatmap:', error)
    return NextResponse.json({
      cells: Array.from({ length: weeks }, () => [0, 0, 0, 0, 0, 0, 0]),
      dayLabels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      monthLabels: [],
      tooltipData: {},
      totalActiveDays: 0,
      totalContributions: 0,
      _error: 'unavailable',
    })
  }
}
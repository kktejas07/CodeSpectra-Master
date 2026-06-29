import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export async function GET() {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  try {
    const db = await getMongoDb()
    const userId = gate.user.id
    const weeks = 14
    const days = 7
    const cells: number[][] = []

    const now = new Date()
    const endOfWeek = new Date(now)
    endOfWeek.setDate(endOfWeek.getDate() + (6 - endOfWeek.getDay()))

    for (let w = 0; w < weeks; w++) {
      const row: number[] = []
      for (let d = 0; d < days; d++) {
        const date = new Date(endOfWeek)
        date.setDate(date.getDate() - ((weeks - 1 - w) * 7 + (6 - d)))

        const count = await db.collection('scan_comments').countDocuments({
          user_id: userId,
          created_at: {
            $gte: date.toISOString().slice(0, 10) + 'T00:00:00.000Z',
            $lt: new Date(date.getTime() + 86400000).toISOString().slice(0, 10) + 'T00:00:00.000Z',
          },
        })

        row.push(Math.min(count, 4))
      }
      cells.push(row)
    }

    return NextResponse.json({ cells, labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] })
  } catch (error) {
    console.error('[CodeSpectra] Error fetching heatmap:', error)
    return NextResponse.json({ error: 'Failed to fetch heatmap' }, { status: 500 })
  }
}

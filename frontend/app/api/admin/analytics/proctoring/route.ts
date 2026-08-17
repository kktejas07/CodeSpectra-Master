import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  try {
    const db = await getMongoDb()

    // Aggregate proctor events by exam_id and event_type
    const raw = await db.collection('proctor_events').aggregate([
      { $match: { session_kind: 'exam' } },
      {
        $group: {
          _id: { exam_id: '$session_id', event_type: '$event_type' },
          count: { $sum: 1 },
        },
      },
    ]).toArray()

    // Map session_id → exam_id via submissions
    const sessionIds = [...new Set(raw.map((r: any) => r._id?.exam_id).filter(Boolean))]
    const submissions = sessionIds.length > 0
      ? await db.collection('exam_submissions')
          .find({ id: { $in: sessionIds } })
          .project({ id: 1, exam_id: 1 })
          .toArray()
      : []
    const subToExam = new Map(submissions.map((s: any) => [s.id, s.exam_id]))
    const examIds = [...new Set(submissions.map((s: any) => s.exam_id).filter(Boolean))]
    const exams = examIds.length > 0
      ? await db.collection('exams').find({ id: { $in: examIds } }).toArray()
      : []
    const examMap = new Map(exams.map((e: any) => [e.id, e.title || 'Unknown']))

    // Build heatmap
    const heatmapMap: Record<string, { exam: string; examTitle: string; eventTypes: Record<string, number> }> = {}
    for (const r of raw) {
      const examId = subToExam.get(r._id?.exam_id) || r._id?.exam_id || 'unknown'
      if (!heatmapMap[examId]) {
        heatmapMap[examId] = { exam: examId, examTitle: examMap.get(examId) || 'Unknown', eventTypes: {} }
      }
      heatmapMap[examId].eventTypes[r._id?.event_type || 'unknown'] = r.count
    }

    // Totals across all exams
    const eventsByType: Record<string, number> = {}
    let totalFlags = 0

    const eventsMap: Record<string, { event_type: string; count: number; exams: { exam_id: string; exam_title: string; count: number }[] }> = {}

    for (const r of raw) {
      const examId = subToExam.get(r._id?.exam_id) || r._id?.exam_id || 'unknown'
      const eventType = r._id?.event_type || 'unknown'
      const count = r.count

      eventsByType[eventType] = (eventsByType[eventType] || 0) + count
      totalFlags += count

      if (!eventsMap[eventType]) {
        eventsMap[eventType] = { event_type: eventType, count: 0, exams: [] }
      }
      eventsMap[eventType].count += count
      
      const examTitle = examMap.get(examId) || 'Unknown'
      eventsMap[eventType].exams.push({ exam_id: examId, exam_title: examTitle, count })
    }

    const events = Object.values(eventsMap).sort((a, b) => b.count - a.count)

    return NextResponse.json({ 
      events, 
      total_flags: totalFlags, 
      events_by_type: eventsByType 
    })
  } catch (e) {
    console.error('[analytics proctoring] error:', e)
    return NextResponse.json({ error: 'Failed to compute proctoring analytics' }, { status: 500 })
  }
}

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
    const totals: Record<string, number> = {}
    for (const entry of Object.values(heatmapMap)) {
      for (const [type, count] of Object.entries(entry.eventTypes)) {
        totals[type] = (totals[type] || 0) + count
      }
    }

    return NextResponse.json({ heatmap: Object.values(heatmapMap), totals })
  } catch (e) {
    console.error('[analytics proctoring] error:', e)
    return NextResponse.json({ error: 'Failed to compute proctoring analytics' }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  try {
    const db = await getMongoDb()
    const submissions = await db.collection('exam_submissions')
      .find({ user_id: gate.user.id })
      .sort({ created_at: -1 })
      .toArray()

    // Fetch associated exam titles
    const examIds = [...new Set(submissions.map((s: any) => s.exam_id).filter(Boolean))]
    const exams = examIds.length > 0
      ? await db.collection('exams').find({ id: { $in: examIds } }).toArray()
      : []
    const examMap = new Map(exams.map((e: any) => [e.id, e]))

    const attempts = submissions.map((s: any) => {
      const exam = examMap.get(s.exam_id)
      return {
        id: s.id,
        exam_id: s.exam_id,
        exam_title: exam?.title || 'Unknown Assessment',
        level: exam?.level || null,
        duration: exam?.duration || null,
        score: s.score,
        max_score: s.max_score,
        has_pending_review: s.has_pending_review || false,
        score_released: s.score_released || false,
        created_at: s.created_at,
      }
    })

    const total = attempts.length
    const passed = attempts.filter((a: any) => a.max_score > 0 && a.score >= a.max_score * 0.6).length
    const avgScore = total > 0
      ? Math.round(attempts.reduce((sum: number, a: any) => sum + (a.max_score > 0 ? (a.score / a.max_score) * 100 : 0), 0) / total)
      : 0

    return NextResponse.json({ attempts, stats: { total, passed, avgScore } })
  } catch (e) {
    console.error('[user assessments] error:', e)
    return NextResponse.json({ error: 'Failed to fetch assessments' }, { status: 500 })
  }
}

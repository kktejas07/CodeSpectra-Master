import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { getMongoDb } from '@/lib/mongodb'
import { nowIso } from '@/lib/db/ai'

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const gate = await requireAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  const { id: examId, userId } = await params

  try {
    const db = await getMongoDb()
    const result = await db.collection('exam_submissions').updateOne(
      { exam_id: examId, user_id: userId },
      { $set: { released_at: nowIso(), score_released: true } },
    )

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, released_at: nowIso() })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to release score'
    console.error('[CodeSpectra] release score PATCH:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

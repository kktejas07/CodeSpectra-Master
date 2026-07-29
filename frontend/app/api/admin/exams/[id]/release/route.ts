import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { getMongoDb } from '@/lib/mongodb'
import { nowIso } from '@/lib/db/ai'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  const { id: examId } = await params

  try {
    const db = await getMongoDb()
    const result = await db.collection('exam_submissions').updateMany(
      { exam_id: examId, released_at: { $exists: false } },
      { $set: { released_at: nowIso(), score_released: true } },
    )

    return NextResponse.json({
      success: true,
      released: result.modifiedCount,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to bulk release'
    console.error('[CodeSpectra] bulk release POST:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

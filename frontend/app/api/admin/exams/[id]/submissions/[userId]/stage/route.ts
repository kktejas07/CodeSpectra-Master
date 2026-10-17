import { NextResponse } from 'next/server'
import { requireAdmin, requireTenantEntity } from '@/lib/api-auth'
import { getMongoDb } from '@/lib/mongodb'
import { nowIso } from '@/lib/db/ai'
import { isPipelineStage, PIPELINE_STAGE_IDS } from '@/lib/pipeline-stages'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * PATCH — set a candidate's recruitment stage (pipeline drag-and-drop board).
 * Body: { stage: PipelineStage, note?: string }
 * Independent of grading/release — purely the hiring funnel position.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const gate = await requireAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { id: examId, userId } = await params

  const body = await request.json().catch(() => ({})) as { stage?: string; note?: string }
  const stage = String(body.stage || '')
  if (!isPipelineStage(stage)) {
    return NextResponse.json({ error: `stage must be one of: ${PIPELINE_STAGE_IDS.join(', ')}` }, { status: 400 })
  }

  try {
    const db = await getMongoDb()
    const owned = await requireTenantEntity(db, 'exams', examId, gate.user)
    if ('error' in owned) return NextResponse.json({ error: owned.error }, { status: owned.status })

    const set: Record<string, unknown> = {
      pipeline_stage: stage,
      pipeline_stage_updated_at: nowIso(),
      pipeline_stage_by: gate.user.id,
    }
    if (typeof body.note === 'string') set.pipeline_stage_note = body.note.slice(0, 500)

    const res = await db.collection('exam_submissions').updateOne(
      { exam_id: examId, user_id: userId },
      { $set: set }
    )
    if (res.matchedCount === 0) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
    }
    return NextResponse.json({ ok: true, stage })
  } catch (e: unknown) {
    const msg = 'Failed to set stage'
    console.error('[CodeSpectra] pipeline stage PATCH:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

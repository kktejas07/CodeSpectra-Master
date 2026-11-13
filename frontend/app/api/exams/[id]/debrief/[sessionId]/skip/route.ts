/**
 * POST /api/exams/[id]/debrief/[sessionId]/skip
 * Marks the debrief session as skipped so the candidate isn't asked again.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { apiErrorFor } from '@/lib/api-errors'
import { getMongoDb } from '@/lib/mongodb'
import { nowIso } from '@/lib/db/ids'
import type { DebriefSessionDoc } from '@/lib/db/content'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 10

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; sessionId: string }> },
) {
  const { id: examId, sessionId } = await ctx.params
  const gate = await requireAuth().catch(() => null)
  if (!gate || 'error' in gate) return NextResponse.json(apiErrorFor('sign_in_to_continue'), { status: 401 })

  const db = await getMongoDb()
  await db.collection<DebriefSessionDoc>('exam_debrief_sessions').updateOne(
    { id: sessionId, exam_id: examId, user_id: gate.user.id, status: 'active' },
    { $set: { status: 'skipped', completed_at: nowIso() } },
  )
  return NextResponse.json({ ok: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { nowIso } from '@/lib/db/ai'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const { id: examId } = await ctx.params
  const body = await req.json().catch(() => ({})) as { answers?: Record<string, string> }

  if (!body.answers || typeof body.answers !== 'object') {
    return NextResponse.json({ error: 'answers object required' }, { status: 400 })
  }

  try {
    const db = await getMongoDb()
    const now = nowIso()

    await db.collection('exam_drafts').updateOne(
      { exam_id: examId, user_id: gate.user.id },
      { $set: { answers: body.answers, updated_at: now }, $setOnInsert: { created_at: now } },
      { upsert: true }
    )

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[save-draft] error:', e)
    return NextResponse.json({ error: 'Failed to save draft' }, { status: 500 })
  }
}

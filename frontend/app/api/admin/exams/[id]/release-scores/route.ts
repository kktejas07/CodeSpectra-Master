import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { nowIso } from '@/lib/db/ai'
import { sendWhatsAppText } from '@/lib/whatsapp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const { id: examId } = await ctx.params

  try {
    const db = await getMongoDb()

    const submissions = await db.collection('exam_submissions')
      .find({ exam_id: examId, score_released: { $ne: true } })
      .toArray()

    if (submissions.length === 0) {
      return NextResponse.json({ released: 0 })
    }

    const now = nowIso()
    await db.collection('exam_submissions').updateMany(
      { exam_id: examId, score_released: { $ne: true } },
      { $set: { score_released: true, released_at: now } }
    )

    // Send WhatsApp notifications if configured
    const exam = await db.collection('exams').findOne({ id: examId })
    const examTitle = exam?.title || 'Assessment'

    for (const sub of submissions) {
      if (!sub.user_id || sub.user_id.startsWith('candidate_')) continue
      try {
        const user = await db.collection('users').findOne({ id: sub.user_id })
        if (user?.phone) {
          const scoreText = sub.max_score > 0
            ? `${Math.round((sub.score / sub.max_score) * 100)}%`
            : `${sub.score}`
          await sendWhatsAppText(
            user.phone,
            `Your results for "${examTitle}" have been released! Score: ${scoreText}. Check your dashboard for details.`
          )
        }
      } catch {
        // Best-effort notification — don't fail the release
      }
    }

    return NextResponse.json({ released: submissions.length })
  } catch (e) {
    console.error('[release-scores] error:', e)
    return NextResponse.json({ error: 'Failed to release scores' }, { status: 500 })
  }
}

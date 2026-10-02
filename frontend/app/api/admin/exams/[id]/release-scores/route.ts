import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, requireTenantEntity } from '@/lib/api-auth'
import { getMongoDb } from '@/lib/mongodb'
import { nowIso } from '@/lib/db/ai'
import { notify } from '@/lib/notifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const clampCutoff = (v: unknown, fallback: number): number => {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.max(0, Math.min(100, Math.round(n)))
}

const pctOf = (sub: Record<string, any>): number | null => {
  const s = Number(sub.score)
  const m = Number(sub.max_score)
  if (!Number.isFinite(s) || !Number.isFinite(m) || m <= 0) return null
  return Math.max(0, Math.min(100, Math.round((s / m) * 100)))
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const { id: examId } = await ctx.params
  const body = await req.json().catch(() => ({})) as { cutoff?: number }

  try {
    const db = await getMongoDb()
    const owned = await requireTenantEntity(db, 'exams', examId, gate.user)
    if ('error' in owned) return NextResponse.json({ error: owned.error }, { status: owned.status })
    const exam = owned.doc as Record<string, any>

    // Cutoff remembers per exam: explicit body > stored passing_score > 40%.
    const stored = Number(exam.passing_score)
    const cutoff = clampCutoff(
      body.cutoff,
      Number.isFinite(stored) && stored >= 0 ? stored : 40
    )
    if (exam.passing_score !== cutoff) {
      await db.collection('exams').updateOne({ id: examId }, { $set: { passing_score: cutoff } })
    }

    const submissions = await db.collection('exam_submissions')
      .find({ exam_id: examId, score_released: { $ne: true } })
      .toArray()

    if (submissions.length === 0) {
      return NextResponse.json({ released: 0, passed: 0, failed: 0, skipped_pending: 0, cutoff })
    }

    // Only graded work releases — pending_review stays locked (same as before).
    const releasable = submissions.filter((s) => s.has_pending_review !== true)
    const skippedPending = submissions.length - releasable.length

    const now = nowIso()
    let passed = 0
    let failed = 0
    for (const sub of releasable) {
      const pct = pctOf(sub)
      const isPass = pct !== null && pct >= cutoff
      if (isPass) passed++
      else failed++
      await db.collection('exam_submissions').updateOne(
        { _id: sub._id },
        { $set: { score_released: true, released_at: now, passed: isPass, cutoff } }
      )
    }

    // Notify candidates (in-app + WhatsApp via the shared notify helper)
    const examTitle = exam?.title || 'Assessment'

    for (const sub of releasable) {
      if (!sub.user_id || sub.user_id.startsWith('candidate_')) continue
      const scoreText = sub.max_score > 0
        ? `${Math.round((sub.score / sub.max_score) * 100)}%`
        : `${sub.score}`
      try {
        await notify({
          user_id: sub.user_id,
          type: 'assessment.results_released',
          title: `Your results for "${examTitle}" are ready`,
          message: `Score: ${scoreText}. Check your dashboard for details.`,
          link: `/dashboard/assessments/${examId}`,
          send_whatsapp: true,
        })
      } catch {
        // Best-effort notification — don't fail the release
      }
    }

    return NextResponse.json({ released: releasable.length, passed, failed, skipped_pending: skippedPending, cutoff })
  } catch (e: unknown) {
    console.error('[release-scores] error:', e)
    return NextResponse.json({ error: 'Failed to release scores' }, { status: 500 })
  }
}

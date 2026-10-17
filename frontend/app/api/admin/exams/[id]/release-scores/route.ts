import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, requireTenantEntity } from '@/lib/api-auth'
import { getMongoDb } from '@/lib/mongodb'
import { nowIso } from '@/lib/db/ai'
import { notifyResultsReleased } from '@/lib/exam-release-notify'
import { deliverExamCertificate, issueExamCertificate } from '@/lib/db/certifications'
import { examPassPercent } from '@/lib/exam-access'

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

    // Cutoff remembers per exam: explicit body > stored passing_score > 40% (examPassPercent).
    const cutoff = clampCutoff(body.cutoff, examPassPercent(exam))
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


    // Verifiable certificates for every released attempt at or above the pass mark
    // (one per candidate per exam; re-releases and retakes never duplicate).
    let certificatesIssued = 0
    if (exam.issue_certificates !== false) {
      for (const sub of releasable) {
        const fresh = { ...sub, score_released: true, released_at: now }
        try {
          const cert = await issueExamCertificate(db, exam, fresh, cutoff)
          if (!cert?.created) continue
          certificatesIssued++
          // In-app for account holders; email with the verify link for invite-only candidates.
          await deliverExamCertificate(exam, String(sub.user_id), cert)
        } catch (e) {
          // Never fail the release over one certificate; it can be re-issued by releasing again.
          console.error('[release-scores] certificate issue failed:', sub.user_id, e)
        }
      }
    }

    // Same channels as the single release (in-app + WhatsApp + email).
    for (const sub of releasable) {
      await notifyResultsReleased(db, exam as Record<string, unknown>, sub as Record<string, unknown>)
    }

    return NextResponse.json({ released: releasable.length, passed, failed, skipped_pending: skippedPending, cutoff, certificates_issued: certificatesIssued })
  } catch (e: unknown) {
    console.error('[release-scores] error:', e)
    return NextResponse.json({ error: 'Failed to release scores' }, { status: 500 })
  }
}

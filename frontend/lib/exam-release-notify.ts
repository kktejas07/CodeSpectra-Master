/**
 * One "results released" notifier for both release routes (single candidate
 * and bulk), so candidates get the same channels whichever button was used:
 * in-app (+ WhatsApp via notify) for account holders, and an email with the
 * score as a percentage.
 */
import type { Db } from 'mongodb'
import { notify } from '@/lib/notifications'
import { sendEmail } from '@/lib/send-email'
import { emailTemplates } from '@/lib/email-templates'

type Doc = Record<string, unknown>

export async function notifyResultsReleased(db: Db, exam: Doc, sub: Doc): Promise<void> {
  const examId = String(exam.id || sub.exam_id || '')
  const examTitle = String(exam.title || 'Assessment')
  const score = Number(sub.score) || 0
  const max = Number(sub.max_score) || 0
  const pct = max > 0 ? Math.round((score / max) * 100) : null
  const userId = String(sub.user_id || '')
  void import('@/lib/automation/events').then(({ emit }) => emit('score.released', {
    submission_id: sub.id ?? null, exam_id: examId, exam_title: examTitle, user_id: userId || null, email: sub.email ?? null,
    score, max_score: max, percent: pct, results_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard/assessments/${examId}`,
  }, { tenantId: typeof exam.tenant_id === 'string' ? exam.tenant_id : null, idempotencyKey: `score.released:${String(sub.id || `${examId}:${userId}`)}:${String(sub.attempt_no ?? 1)}` })).catch((e) => console.error('[automation] emit failed:', e))

  if (userId && !userId.startsWith('candidate_')) {
    try {
      await notify({
        user_id: userId,
        type: 'assessment.results_released',
        title: `Your results for "${examTitle}" are ready`,
        message: `Score: ${pct !== null ? `${pct}%` : score}. Check your dashboard for details.`,
        link: `/dashboard/assessments/${examId}`,
        send_whatsapp: true,
      })
    } catch (e) {
      console.error('[results-released] in-app notify failed:', e)
    }
  }

  const email = String(sub.email || '')
  if (!email) return
  let candidateName = email.split('@')[0]
  try {
    const u = userId ? await db.collection('user').findOne({ id: userId }, { projection: { fullName: 1, name: 1 } }) : null
    if (u) candidateName = String(u.fullName || u.name || candidateName)
    else {
      const invite = await db.collection('candidate_invites').findOne({ email }, { projection: { full_name: 1 } })
      if (invite?.full_name) candidateName = String(invite.full_name)
    }
  } catch { /* name is cosmetic */ }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const template = emailTemplates.assessmentScoreReleased({
    candidateName,
    examTitle,
    // Same unit as the dashboard: percent of 100.
    score: pct ?? Math.round(score),
    maxScore: pct !== null ? 100 : Math.round(max || 100),
    resultsUrl: `${appUrl}/dashboard/assessments/${examId}`,
  })
  await sendEmail(email, template).catch((err) => console.error('[results-released] email failed:', err))
}

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { newId, nowIso } from '@/lib/db/ai'
import { parseUserAgent } from '@/lib/db/sessions'
import { isIpInCidr } from '@/lib/db/security'
import { answersEqual, multisetEqual, canonicalObjectiveType } from '@/lib/grading'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id: examId } = await ctx.params
  const body = await req.json().catch(() => ({})) as {
    answers?: Record<string, string>
    auto_submitted?: boolean
    idPhoto?: string
    facePhoto?: string
    inviteToken?: string
    question_timings?: Record<string, number>
    total_time_ms?: number
    started_at?: string | null
  }

  const gate = await requireAuth().catch(() => null)
  if (!gate || 'error' in gate) {
    return NextResponse.json({ error: 'You must be signed in to take this assessment.' }, { status: 401 })
  }
  const userId = gate.user.id
  const email = gate.user.email

  try {
    const db = await getMongoDb()

    const inviteToken = body.inviteToken || req.headers.get('x-invite-token')

    // If an invite token is provided, validate it, ensure the signed-in account
    // owns it, and mark it used on submission.
    if (inviteToken) {
      const invite = await db.collection('candidate_invites').findOne({ token: inviteToken })
      if (!invite) {
        return NextResponse.json({ error: 'Invalid invitation token' }, { status: 403 })
      }
      if (invite.status === 'used') {
        return NextResponse.json({ error: 'This invitation has already been used' }, { status: 403 })
      }
      if ((invite.email || '').toLowerCase() !== (email || '').toLowerCase()) {
        return NextResponse.json({ error: 'Email mismatch — this invitation belongs to a different account.' }, { status: 403 })
      }
      await db.collection('candidate_invites').updateOne(
        { token: inviteToken },
        { $set: { status: 'used', updatedAt: nowIso() } }
      )
    }

    // IP blocking check (supports CIDR notation) — reuse shared matcher from
    // lib/db/security.ts instead of duplicating the bit-math inline.
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || ''
    if (clientIp) {
      const blockedEntries = await db.collection('ip_blocklist').find({
        active: { $ne: false },
      }).toArray()
      for (const entry of blockedEntries) {
        if (isIpInCidr(clientIp, String(entry.ip))) {
          return NextResponse.json({ error: 'This IP address has been blocked.' }, { status: 403 })
        }
      }
    }

    // Rate limiting: max 3 submissions per user per exam per hour
    const submissions = db.collection('exam_submissions')
    const recentSubmissions = await submissions.countDocuments({
      exam_id: examId,
      user_id: userId,
      created_at: { $gte: new Date(Date.now() - 3600000).toISOString() }
    })
    if (recentSubmissions >= 3) {
      return NextResponse.json({ error: 'Too many submission attempts. Please try again later.' }, { status: 429 })
    }

    const exams = db.collection('exams')
    const exam = await exams.findOne({ id: examId })
    if (!exam) return NextResponse.json({ error: 'Exam not found' }, { status: 404 })

    // Extension enforcement: every candidate must have a hardware_port_audit
    // event recorded for this exam (the Device Audit extension posts it on page
    // load). Without it, the submit is rejected — no extension, no assessment.
    const auditEvents = await db.collection('proctor_events').countDocuments({
      user_id: userId,
      session_id: examId,
      event_type: 'hardware_port_audit',
      created_at: { $gte: new Date(Date.now() - 24 * 3600 * 1000).toISOString() },
    })
    if (auditEvents === 0) {
      return NextResponse.json({
        error: 'Device Audit extension not detected. Install the CodeSpectra Device Audit Chrome extension, reload this page, and try again.',
      }, { status: 403 })
    }

    const questions = Array.isArray(exam.questionList) ? exam.questionList : (Array.isArray(exam.questions) ? exam.questions : [])
    const answers = body.answers || {}
    let totalScore = 0
    let maxScore = 0
    const details: Array<{ qId: string; correct: boolean; points: number; answer: string; pending_review: boolean }> = []

    let hasPendingReview = false

    for (const q of questions) {
      const points = q.points || q.score || 10
      maxScore += points
      const userAnswer = String(answers[q.id] || '').trim()
      const correctAns = String(q.answer || q.correct_answer || '').trim()

      let correct = false
      let pendingReview = false

      const qType = (q.type || '').toLowerCase().replace(/[-_]/g, '')
      const objective = canonicalObjectiveType(qType)

      if (['mcq', 'true_false'].includes(objective)) {
        correct = answersEqual(userAnswer, correctAns, q.options)
      } else if (objective === 'multiple_response') {
        correct = multisetEqual(userAnswer, correctAns, q.options)
      } else if (objective === 'fill_blanks') {
        correct = multisetEqual(userAnswer, correctAns)
      } else {
        // coding / descriptive — manual (or AI) grading, unless blank.
        if (userAnswer) {
          pendingReview = true
          hasPendingReview = true
        }
      }

      if (correct) totalScore += points
      details.push({ qId: q.id, correct, points, answer: userAnswer, pending_review: pendingReview })
    }

    // Save submission
    const submission = {
      id: newId(),
      exam_id: examId,
      user_id: userId,
      email: email,
      source: inviteToken ? 'invite' : 'public_link',
      answers,
      score: totalScore,
      max_score: maxScore,
      has_pending_review: hasPendingReview,
      auto_submitted: body.auto_submitted || false,
      id_photo: body.idPhoto || null,
      face_photo: body.facePhoto || null,
      details,
      device_info: { 
        ua: req.headers.get('user-agent') || '', 
        ...parseUserAgent(req.headers.get('user-agent') || ''), 
        ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || '',
        geo: req.headers.get('cf-ipcountry') || req.headers.get('x-vercel-ip-country') || null
      },
      // Timing data
      question_timings: body.question_timings || {},
      total_time_ms: body.total_time_ms || 0,
      started_at: body.started_at || null,
      created_at: nowIso(),
    }
    await submissions.insertOne(submission)

    // Award XP + real-time notification (invite-only candidates are real
    // accounts now that login is mandatory). Idempotent per submission.
    if (maxScore > 0 && totalScore > 0) {
      try {
        const { awardXpWithLevelUp } = await import('@/lib/xp-service')
        const { getXpRewards } = await import('@/lib/db/leaderboard')
        const rewards = await getXpRewards()
        const amount = Math.max(5, Math.round((totalScore / maxScore) * rewards.exam_pass))
        await awardXpWithLevelUp({
          userId,
          amount,
          reason: 'exam_passed',
          submissionId: submission.id,
          metadata: { exam_id: examId, score: String(totalScore), max_score: String(maxScore) },
        })
      } catch (e) {
        console.error('[CodeSpectra] exam XP award failed:', e)
      }
    }

    return NextResponse.json({
      score: totalScore,
      total: maxScore,
      has_pending_review: hasPendingReview,
      details,
      submission_id: submission.id,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Submit failed'
    console.error('[CodeSpectra] exam-submit:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

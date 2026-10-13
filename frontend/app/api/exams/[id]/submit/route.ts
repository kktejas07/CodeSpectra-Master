import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { newId, nowIso } from '@/lib/db/ai'
import { parseUserAgent } from '@/lib/db/sessions'
import { isIpInCidr } from '@/lib/db/security'
import { compareObjectiveAnswer } from '@/lib/grading'
import { isScoredType, isDeterministicType } from '@/lib/question-types'

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

    // If an invite token is provided, validate it and ensure the signed-in
    // account owns it. The invite is marked used only AFTER the submission
    // is saved (see below) — marking it before the save permanently locks
    // the candidate out if anything later in this handler fails.
    let inviteDoc: Record<string, unknown> | null = null
    if (inviteToken) {
      inviteDoc = (await db.collection('candidate_invites').findOne({ token: inviteToken })) as Record<string, unknown> | null
      if (!inviteDoc) {
        return NextResponse.json({ error: 'Invalid invitation token' }, { status: 403 })
      }
      if ((String(inviteDoc.email || '')).toLowerCase() !== (email || '').toLowerCase()) {
        return NextResponse.json({ error: 'Email mismatch — this invitation belongs to a different account.' }, { status: 403 })
      }
      if (inviteDoc.status === 'used') {
        // Recovery: a previous attempt may have marked the invite used but
        // failed before saving. If no submission exists for this exam+email,
        // allow the submit through instead of locking the candidate out.
        const prior = await db.collection('exam_submissions').countDocuments({
          exam_id: examId,
          $or: [{ user_id: userId }, { email: String(inviteDoc.email || '') }],
        })
        if (!prior) {
          console.warn(`[CodeSpectra] submit exam=${examId} user=${userId}: invite already used but no submission found — allowing recovery submit`)
        } else {
          return NextResponse.json({ error: 'This invitation has already been used' }, { status: 403 })
        }
      }
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

    // Availability-window enforcement: must SUBMIT by ends_at (UTC ISO).
    const endsAt = (exam as { ends_at?: string | null }).ends_at
    if (endsAt && new Date(endsAt).getTime() < Date.now()) {
      return NextResponse.json({ error: 'Assessment window has closed' }, { status: 403 })
    }

    // Extension check: log if no hardware_port_audit event exists, but
    // don't block submission — the extension is a proctoring aid, not a
    // hard requirement for candidates who can't install it (mobile, etc.).
    const auditEvents = await db.collection('proctor_events').countDocuments({
      user_id: userId,
      session_id: examId,
      event_type: 'hardware_port_audit',
      created_at: { $gte: new Date(Date.now() - 24 * 3600 * 1000).toISOString() },
    })
    const extensionDetected = auditEvents > 0
    if (!extensionDetected) {
      console.warn(`[CodeSpectra] submit exam=${examId} user=${userId}: no hardware_port_audit event — extension not detected`)
    }

    const questions = Array.isArray(exam.questionList) ? exam.questionList : (Array.isArray(exam.questions) ? exam.questions : [])
    const rawAnswers = body.answers || {}
    // Injection/DoS guard: answers are stored verbatim in MongoDB, so cap
    // per-answer and total size (16MB doc limit). Content stays untouched —
    // it is inert text, never eval'd; code runs only in the Piston sandbox.
    const MAX_ANSWER_CHARS = 100000
    const MAX_TOTAL_ANSWER_CHARS = 1000000
    let totalChars = 0
    const answers: Record<string, string> = {}
    for (const [k, v] of Object.entries(rawAnswers)) {
      const s = String(v ?? '')
      if (s.length > MAX_ANSWER_CHARS) {
        return NextResponse.json({ error: `Answer too large (max ${MAX_ANSWER_CHARS} characters per question)` }, { status: 400 })
      }
      totalChars += s.length
      answers[k.slice(0, 128)] = s
    }
    if (totalChars > MAX_TOTAL_ANSWER_CHARS) {
      return NextResponse.json({ error: 'Submission too large' }, { status: 400 })
    }
    let totalScore = 0
    let maxScore = 0
    const details: Array<{ qId: string; correct: boolean; points: number; answer: string; pending_review: boolean }> = []

    let hasPendingReview = false

    for (const q of questions) {
      const points = q.points || q.score || 10
      const scored = isScoredType(q.type)
      if (scored) maxScore += points
      const userAnswer = String(answers[q.id] || '').trim()

      let correct = false
      let pendingReview = false

      if (!scored) {
        // Attitudinal scales (Likert/rating) are recorded but never graded and
        // never counted toward the max score.
        correct = false
      } else if (isDeterministicType(q.type)) {
        // All objective kinds (choice/multi/blanks/numeric/text/sequence/
        // pairs/matrix/table) go through one grader so submit and AI-grade
        // can never diverge.
        correct = compareObjectiveAnswer({
          type: q.type,
          options: q.options,
          answer: String(q.answer ?? q.correct_answer ?? ''),
          tolerance: q.tolerance,
          pairs: q.pairs,
          matrix: q.matrix,
          table: q.table,
        }, userAnswer).correct
      } else if (userAnswer) {
        // coding variants / descriptive — manual (or AI) grading, unless blank.
        pendingReview = true
        hasPendingReview = true
      }

      if (correct && scored) totalScore += points
      details.push({ qId: q.id, correct, points, answer: userAnswer, pending_review: pendingReview })
    }

    // Save submission
    const submission = {
      id: newId(),
      exam_id: examId,
      user_id: userId,
      email: email,
      source: inviteToken ? 'invite' : 'public_link',
      extension_detected: extensionDetected,
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
      submitted_at: nowIso(),
      created_at: nowIso(),
    }
    await submissions.insertOne(submission)

    // Mark the invite used only now that the submission is safely stored,
    // and link it to the submitting account so the results page can join
    // submissions to invites even when the invite was created with an
    // empty user_id (invited-link flow).
    if (inviteToken) {
      await db.collection('candidate_invites').updateOne(
        { token: inviteToken },
        { $set: { status: 'used', updatedAt: nowIso(), user_id: userId, email } }
      ).catch(() => {})
    }

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

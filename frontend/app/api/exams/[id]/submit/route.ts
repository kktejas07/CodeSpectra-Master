import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { newId, nowIso } from '@/lib/db/ai'
import { parseUserAgent } from '@/lib/db/sessions'
import { isIpInCidr } from '@/lib/db/security'
import { compareObjectiveAnswer } from '@/lib/grading'
import { isScoredType, isDeterministicType } from '@/lib/question-types'
import { checkExamEntry, recordExamAttempt } from '@/lib/exam-access'

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
    /** ?link= token from a DB-backed share link (assessment_links). */
    linkToken?: string
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
    const linkToken = body.linkToken || req.headers.get('x-link-token')

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

    // Server-side entry gate (the page's checks are UX only): published,
    // starts_at/ends_at window, invite-only (valid invite for this exam + account,
    // or a valid ?link= token), and no retake. See lib/exam-access.ts.
    const access = await checkExamEntry(db, exam as Record<string, unknown>, { id: userId, email }, { inviteToken, linkToken })
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
    const inviteDoc = access.invite

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
      source: access.source === 'invite' ? 'invite' : 'public_link',
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
    // Atomic: a double submit (or two tabs) can't create two attempts — the
    // second write hits the unique key / conditional replace and gets a 409.
    const stored = await recordExamAttempt(db, access.current, submission, access.attemptNo)
    if (!stored.ok) {
      return NextResponse.json({ error: 'This attempt was already submitted.' }, { status: 409 })
    }

    // Mark the invite used only now that the submission is safely stored,
    // and link it to the submitting account so the results page can join
    // submissions to invites even when the invite was created with an
    // empty user_id (invited-link flow).
    if (inviteDoc && inviteToken) {
      await db.collection('candidate_invites').updateOne(
        { token: inviteToken },
        { $set: { status: 'used', updatedAt: nowIso(), user_id: userId, email } }
      ).catch(() => {})
    }

    // Award XP + real-time notification (invite-only candidates are real
    // accounts now that login is mandatory). Idempotent per submission.
    // XP only for the first attempt, so retakes can't farm it.
    if (access.attemptNo === 1 && maxScore > 0 && totalScore > 0) {
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

    // Score and per-question correctness stay server-side until the organiser
    // releases them (GET /api/exams/[id] returns them once score_released).
    return NextResponse.json({
      ok: true,
      submission_id: submission.id,
      has_pending_review: hasPendingReview,
      released: false,
      attempt_no: access.attemptNo,
      max_attempts: access.maxAttempts,
    })
  } catch (e: unknown) {
    const msg = 'Submit failed'
    console.error('[CodeSpectra] exam-submit:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

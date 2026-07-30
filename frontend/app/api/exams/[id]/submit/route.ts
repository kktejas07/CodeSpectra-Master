import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { newId, nowIso } from '@/lib/db/ai'

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
  }

  const gate = await requireAuth().catch(() => null)
  let userId = ''
  let email = ''

  try {
    const db = await getMongoDb()

    if (gate && !('error' in gate)) {
      userId = gate.user.id
      email = gate.user.email
    } else {
      const token = body.inviteToken || req.headers.get('x-invite-token')
      if (!token) {
        return NextResponse.json({ error: 'Authentication or invitation token required' }, { status: 401 })
      }
      const invite = await db.collection('candidate_invites').findOne({ token })
      if (!invite) {
        return NextResponse.json({ error: 'Invalid invitation token' }, { status: 403 })
      }
      if (invite.status === 'used') {
        return NextResponse.json({ error: 'This invitation has already been used' }, { status: 403 })
      }
      userId = `candidate_${invite.email}`
      email = invite.email

      // Mark the invitation as used
      await db.collection('candidate_invites').updateOne(
        { token },
        { $set: { status: 'used', updatedAt: nowIso() } }
      )
    }

    const exams = db.collection('exams')
    const exam = await exams.findOne({ id: examId })
    if (!exam) return NextResponse.json({ error: 'Exam not found' }, { status: 404 })

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

      if (['mcq', 'multiplechoice', 'truefalse'].includes(qType)) {
        // Exact match (case-insensitive)
        if (correctAns) {
          correct = userAnswer.toLowerCase() === correctAns.toLowerCase()
        }
      } else if (qType === 'multipleresponse') {
        // Compare sets of comma-separated answers
        if (correctAns) {
          const expected = new Set(correctAns.toLowerCase().split(',').map((s: string) => s.trim()).filter(Boolean))
          const given = new Set(userAnswer.toLowerCase().split(',').map((s: string) => s.trim()).filter(Boolean))
          correct = expected.size === given.size && [...expected].every(v => given.has(v))
        }
      } else if (qType === 'fillblanks' || qType === 'fillinthe blanks' || qType === 'fillintheblanks') {
        // Case-insensitive match against answer key
        if (correctAns) {
          correct = userAnswer.toLowerCase() === correctAns.toLowerCase()
        }
      } else if (['coding', 'descriptive'].includes(qType)) {
        // These require manual grading by admin
        pendingReview = true
        hasPendingReview = true
      }

      if (correct) totalScore += points
      details.push({ qId: q.id, correct, points, answer: userAnswer, pending_review: pendingReview })
    }

    // Save submission
    const submissions = db.collection('exam_submissions')
    const submission = {
      id: newId(),
      exam_id: examId,
      user_id: userId,
      email: email,
      answers,
      score: totalScore,
      max_score: maxScore,
      has_pending_review: hasPendingReview,
      auto_submitted: body.auto_submitted || false,
      id_photo: body.idPhoto || null,
      face_photo: body.facePhoto || null,
      details,
      created_at: nowIso(),
    }
    await submissions.insertOne(submission)

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

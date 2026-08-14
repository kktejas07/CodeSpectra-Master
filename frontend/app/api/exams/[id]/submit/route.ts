import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { newId, nowIso } from '@/lib/db/ai'
import { parseUserAgent } from '@/lib/db/sessions'

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

    const inviteToken = body.inviteToken || req.headers.get('x-invite-token')

    if (gate && !('error' in gate)) {
      userId = gate.user.id
      email = gate.user.email
    }

    // If an invite token is provided, validate it and mark as used on submission
    if (inviteToken) {
      const invite = await db.collection('candidate_invites').findOne({ token: inviteToken })
      if (!invite) {
        return NextResponse.json({ error: 'Invalid invitation token' }, { status: 403 })
      }
      if (invite.status === 'used') {
        return NextResponse.json({ error: 'This invitation has already been used' }, { status: 403 })
      }
      if (!userId) userId = `candidate_${invite.email}`
      if (!email) email = invite.email
      await db.collection('candidate_invites').updateOne(
        { token: inviteToken },
        { $set: { status: 'used', updatedAt: nowIso() } }
      )
    } else if (!gate || 'error' in gate) {
      return NextResponse.json({ error: 'Authentication or invitation token required' }, { status: 401 })
    }

    // IP blocking check (supports CIDR notation)
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || ''
    if (clientIp) {
      const blockedEntries = await db.collection('ip_blocklist').find({
        active: { $ne: false },
      }).toArray()
      for (const entry of blockedEntries) {
        const blockedIp = String(entry.ip)
        if (blockedIp === clientIp || blockedIp.includes('/')) {
          // Check CIDR match
          const [network, prefixStr] = blockedIp.split('/')
          const prefix = parseInt(prefixStr, 10)
          if (!isNaN(prefix) && prefix >= 0 && prefix <= 32) {
            const ipParts = clientIp.split('.').map(Number)
            const netParts = network.split('.').map(Number)
            if (ipParts.length === 4 && netParts.length === 4 && ipParts.every(p => !isNaN(p)) && netParts.every(p => !isNaN(p))) {
              const ipNum = (ipParts[0] << 24 | ipParts[1] << 16 | ipParts[2] << 8 | ipParts[3]) >>> 0
              const netNum = (netParts[0] << 24 | netParts[1] << 16 | netParts[2] << 8 | netParts[3]) >>> 0
              const mask = prefix === 0 ? 0 : (~((1 << (32 - prefix)) - 1)) >>> 0
              if ((ipNum & mask) === (netNum & mask)) {
                return NextResponse.json({ error: 'This IP address has been blocked.' }, { status: 403 })
              }
            }
          }
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
        // These require manual grading by admin — but only when the candidate
        // actually submitted something. A blank answer is an automatic 0.
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
      created_at: nowIso(),
    }
    await submissions.insertOne(submission)

    // Award XP + real-time notification for real platform users (invite-only
    // candidates are not platform accounts). Idempotent per submission.
    if (userId && !userId.startsWith('candidate_') && maxScore > 0 && totalScore > 0) {
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

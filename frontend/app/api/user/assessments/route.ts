import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  try {
    const db = await getMongoDb()
    const userId = gate.user.id
    const submissions = await db.collection('exam_submissions')
      .find({ user_id: gate.user.id })
      .sort({ created_at: -1 })
      .toArray()

    // Fetch associated exam titles
    const examIds = [...new Set(submissions.map((s: any) => s.exam_id).filter(Boolean))]
    const exams = examIds.length > 0
      ? await db.collection('exams').find({ id: { $in: examIds } }).toArray()
      : []
    const examMap = new Map(exams.map((e: any) => [e.id, e]))

    const attempts = submissions.map((s: any) => {
      const exam = examMap.get(s.exam_id)
      const scorePercentage = s.max_score > 0 ? Math.round((s.score / s.max_score) * 100) : 0
      const passed = s.max_score > 0 && s.score >= s.max_score * 0.6

      return {
        id: s.id,
        exam_id: s.exam_id,
        title: exam?.title || 'Unknown Assessment',
        level: exam?.level || null,
        duration: exam?.duration || null,
        score: scorePercentage,
        max_score: s.max_score,
        passed,
        has_pending_review: s.has_pending_review || false,
        score_released: s.score_released || false,
        submitted_at: s.submitted_at || s.created_at,
      }
    })

    const total = attempts.length
    const passed = attempts.filter((a: any) => a.passed).length
    const avgScore = total > 0
      ? Math.round(attempts.reduce((sum: number, a: any) => sum + (a.score || 0), 0) / total)
      : 0

    // ---- Available: assigned (pending/active invites) + open published exams ----
    const attemptedIds = new Set(examIds.filter(Boolean))
    const tokenRe = /\/assessment\/([^/?]+)/
    const inviteEmail = (gate.user.email || '').toLowerCase()

    const inviteDocs = await db.collection('candidate_invites').find({
      $or: [{ user_id: userId }, { email: inviteEmail }],
      status: { $in: ['pending', 'active'] },
    }).toArray()

    const inviteExamIds = new Set<string>()
    const inviteByExam = new Map<string, any>()
    inviteDocs.forEach((inv: any) => {
      const fromUrl = inv.target_url?.match(tokenRe)?.[1]
      if (fromUrl && !attemptedIds.has(fromUrl)) {
        inviteExamIds.add(fromUrl)
        if (!inviteByExam.has(fromUrl)) inviteByExam.set(fromUrl, inv)
      }
    })

    const baseProjection = { id: 1, title: 1, level: 1, subject: 1, duration: 1, questions: 1, access_type: 1, published: 1 }

    const [invitedExams, openExams] = await Promise.all([
      inviteExamIds.size > 0
        ? db.collection('exams').find({ id: { $in: [...inviteExamIds] }, published: true }).project(baseProjection).toArray()
        : Promise.resolve([]),
      db.collection('exams').find({
        access_type: 'open',
        published: true,
        id: { $nin: [...attemptedIds] },
      }).project(baseProjection).toArray(),
    ])

    const available = [
      ...invitedExams.map((e: any) => {
        const inv = inviteByExam.get(e.id)
        const token = (inv && (inv as any).token) || ''
        const query = `?inviteEmail=${encodeURIComponent(inviteEmail)}${token ? `&inviteToken=${encodeURIComponent(token)}` : ''}`
        return {
          id: e.id, title: e.title, level: e.level, subject: e.subject,
          duration: e.duration, questions: e.questions,
          access_type: e.access_type, source: 'invite',
          invite_status: (inv && (inv as any).status) || 'pending',
          target_url: `/assessment/${e.id}${query}`,
        }
      }),
      ...openExams
        .filter((e: any) => !attemptedIds.has(e.id))
        .map((e: any) => ({
          id: e.id, title: e.title, level: e.level, subject: e.subject,
          duration: e.duration, questions: e.questions,
          access_type: e.access_type, source: 'open',
          target_url: `/assessment/${e.id}`,
        })),
    ]

    const seen = new Set<string>()
    const dedupAvailable = available.filter((i: any) => {
      if (seen.has(i.id)) return false
      seen.add(i.id)
      return true
    })

    return NextResponse.json({ attempts, available: dedupAvailable, stats: { total, passed, avgScore } })
  } catch (e) {
    console.error('[user assessments] error:', e)
    return NextResponse.json({ error: 'Failed to fetch assessments' }, { status: 500 })
  }
}

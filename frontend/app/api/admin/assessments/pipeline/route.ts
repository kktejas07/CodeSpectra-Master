import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { candidateInvites } from '@/lib/db/admin'
import { exams, examSubmissions } from '@/lib/db/content'

export const runtime = 'nodejs'

interface PipelineCandidate {
  id: string
  email: string
  name: string
  company?: string | null
  role?: string | null
  status: 'invited' | 'inProgress' | 'completed' | 'passed' | 'failed'
  invitedAt: string
  startedAt?: string
  completedAt?: string
  score?: number
  passed?: boolean
}

interface PipelineResponse {
  stages: {
    invited: PipelineCandidate[]
    inProgress: PipelineCandidate[]
    completed: PipelineCandidate[]
    passed: PipelineCandidate[]
    failed: PipelineCandidate[]
  }
  stats: {
    total: number
    invited: number
    inProgress: number
    completed: number
    passed: number
    failed: number
    passRate: number
    avgScore: number
  }
  examTitle: string
}

export async function GET(request: Request) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  try {
    const { searchParams } = new URL(request.url)
    const examId = searchParams.get('examId')

    if (!examId) {
      return NextResponse.json({ error: 'examId is required' }, { status: 400 })
    }

    const examCol = await exams()
    const exam = await examCol.findOne({ id: examId })
    if (!exam) {
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 })
    }

    const inviteCol = await candidateInvites()
    const subCol = await examSubmissions()

    // Get all invites for this exam
    const invites = await inviteCol.find({ exam_id: examId }).sort({ created_at: -1 }).toArray()

    // Get all submissions for this exam to cross-reference
    const submissions = await subCol.find({ exam_id: examId }).toArray()
    const subByEmail = new Map<string, typeof submissions[0]>()
    const subByUserId = new Map<string, typeof submissions[0]>()
    for (const s of submissions) {
      if (s.user_id) subByUserId.set(s.user_id, s)
    }

    // Also look up submissions by email via user lookup
    const userIds = invites.filter(i => i.user_id).map(i => i.user_id)
    if (userIds.length > 0) {
      const userCol = (await (await import('@/lib/mongodb')).getMongoDb()).collection('user')
      const users = await userCol.find({ id: { $in: userIds } }).project({ id: 1, email: 1 }).toArray()
      const emailByUserId = new Map(users.map((u: any) => [u.id, u.email]))
      for (const s of submissions) {
        const email = emailByUserId.get(s.user_id)
        if (email) subByEmail.set(email.toLowerCase(), s)
        subByUserId.set(s.user_id, s)
      }
    }

    // Also index invites by email for submission matching
    const inviteByEmail = new Map<string, typeof invites[0]>()
    for (const inv of invites) {
      inviteByEmail.set(inv.email.toLowerCase(), inv)
    }

    // Also check submissions where email is in the invites
    const allSubs = await subCol.find({ exam_id: examId }).toArray()
    for (const s of allSubs) {
      // Try to find matching invite by user_id
      const matchingInvite = invites.find(i => i.user_id === s.user_id)
      if (matchingInvite) {
        subByEmail.set(matchingInvite.email.toLowerCase(), s)
      }
    }

    const stages: PipelineResponse['stages'] = {
      invited: [],
      inProgress: [],
      completed: [],
      passed: [],
      failed: [],
    }

    for (const inv of invites) {
      const email = inv.email.toLowerCase()
      const sub = subByEmail.get(email) || subByUserId.get(inv.user_id)

      let status: PipelineCandidate['status'] = 'invited'
      let startedAt: string | undefined
      let completedAt: string | undefined
      let score: number | undefined
      let passed: boolean | undefined

      if (sub) {
        completedAt = sub.submitted_at
        score = sub.score
        passed = sub.passed
        if (sub.passed) {
          status = 'passed'
        } else {
          status = 'failed'
        }
      } else if (inv.status === 'active') {
        status = 'inProgress'
        startedAt = inv.updated_at || inv.created_at
      }

      const candidate: PipelineCandidate = {
        id: inv.id,
        email: inv.email,
        name: inv.full_name || inv.email.split('@')[0],
        company: (inv as any).company || null,
        role: (inv as any).role_title || null,
        status,
        invitedAt: inv.created_at,
        startedAt,
        completedAt,
        score,
        passed,
      }

      stages[status].push(candidate)
    }

    const total = invites.length
    const invited = stages.invited.length
    const inProgress = stages.inProgress.length
    const completed = stages.completed.length + stages.passed.length + stages.failed.length
    const passed = stages.passed.length
    const failed = stages.failed.length
    const passRate = completed > 0 ? Math.round((passed / completed) * 100) : 0
    const allScored = [...stages.completed, ...stages.passed, ...stages.failed].filter(c => c.score != null)
    const avgScore = allScored.length > 0
      ? Math.round(allScored.reduce((sum, c) => sum + (c.score || 0), 0) / allScored.length)
      : 0

    const response: PipelineResponse = {
      stages,
      stats: { total, invited, inProgress, completed, passed, failed, passRate, avgScore },
      examTitle: exam.title,
    }

    return NextResponse.json(response)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to fetch pipeline'
    console.error('[Pipeline] GET error:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

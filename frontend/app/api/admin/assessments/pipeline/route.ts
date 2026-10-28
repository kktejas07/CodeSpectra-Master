import { NextResponse } from 'next/server'
import { requireAdmin, requireTenantEntity } from '@/lib/api-auth'
import { candidateInvites } from '@/lib/db/admin'

export const runtime = 'nodejs'

interface PipelineCandidate {
  id: string
  userId?: string
  email: string
  name: string
  company?: string | null
  role?: string | null
  status: 'invited' | 'inProgress' | 'completed' | 'passed' | 'failed'
  invitedAt: string
  startedAt?: string
  completedAt?: string
  /** Raw points (kept for compat). */
  score?: number
  /** 0-100 percent — the value the UI renders. */
  scorePct?: number
  passed?: boolean
  /** Recruitment stage set by admins via the drag-and-drop board. */
  pipeline_stage?: string
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

const pct = (score: unknown, max: unknown): number | undefined => {
  const s = Number(score)
  const m = Number(max)
  if (!Number.isFinite(s) || !Number.isFinite(m) || m <= 0) return undefined
  return Math.max(0, Math.min(100, Math.round((s / m) * 100)))
}

export async function GET(request: Request) {
  const gate = await requireAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  try {
    const { searchParams } = new URL(request.url)
    const examId = searchParams.get('examId')

    if (!examId) {
      return NextResponse.json({ error: 'examId is required' }, { status: 400 })
    }

    const db = await (await import('@/lib/mongodb')).getMongoDb()
    const owned = await requireTenantEntity(db, 'exams', examId, gate.user)
    if ('error' in owned) {
      return NextResponse.json({ error: owned.error }, { status: owned.status })
    }
    const exam = owned.doc

    // Pass/fail cutoff for this exam (set when results are released). Null
    // means no verdict yet — those candidates stay in Completed.
    const cutoffRaw = Number((exam as Record<string, unknown>).passing_score)
    const cutoff = Number.isFinite(cutoffRaw) && cutoffRaw >= 0 && cutoffRaw <= 100 ? cutoffRaw : null

    const inviteCol = await candidateInvites()
    const subCol = await db.collection('exam_submissions')

    const invites = await inviteCol.find({ exam_id: examId }).sort({ created_at: -1 }).toArray()
    // Identity photos are loaded on demand (lib/identity-media.ts), never in lists.
    const submissions = await subCol.find({ exam_id: examId }, { projection: { id_photo: 0, face_photo: 0 } }).toArray()

    const subByUserId = new Map<string, (typeof submissions)[0]>()
    for (const s of submissions) {
      if (s.user_id) subByUserId.set(String(s.user_id), s)
    }
    const inviteByUserId = new Map<string, (typeof invites)[0]>()
    const inviteByEmail = new Map<string, (typeof invites)[0]>()
    for (const inv of invites) {
      if (inv.user_id) inviteByUserId.set(String(inv.user_id), inv)
      if (inv.email) inviteByEmail.set(String(inv.email).toLowerCase(), inv)
    }

    // People = union of invites + submissions. Public-link / open-access
    // candidates have submissions but no invite — previously invisible here.
    const seen = new Set<string>()
    const people: Array<{ key: string; invite?: (typeof invites)[0]; sub?: (typeof submissions)[0] }> = []
    for (const inv of invites) {
      const key = `inv:${inv.id}`
      seen.add(key)
      let sub: (typeof submissions)[0] | undefined
      if (inv.user_id) sub = subByUserId.get(String(inv.user_id))
      if (!sub && inv.email) {
        sub = submissions.find((s) => (s.email || '').toLowerCase() === String(inv.email).toLowerCase())
      }
      people.push({ key, invite: inv, sub })
    }
    for (const s of submissions) {
      let inv: (typeof invites)[0] | undefined
      if (s.user_id) inv = inviteByUserId.get(String(s.user_id))
      if (!inv && s.email) inv = inviteByEmail.get(String(s.email).toLowerCase())
      if (inv) continue // already covered via the invite loop
      const key = `sub:${s.id}`
      if (seen.has(key)) continue
      seen.add(key)
      people.push({ key, sub: s })
    }

    const stages: PipelineResponse['stages'] = {
      invited: [],
      inProgress: [],
      completed: [],
      passed: [],
      failed: [],
    }

    for (const { invite, sub } of people) {
      const email = String(invite?.email || sub?.email || '')
      let status: PipelineCandidate['status'] = 'invited'
      let startedAt: string | undefined
      let completedAt: string | undefined
      let score: number | undefined
      let scorePct: number | undefined
      let passed: boolean | undefined

      if (sub) {
        completedAt = sub.submitted_at
        score = typeof sub.score === 'number' ? sub.score : undefined
        scorePct = pct(sub.score, sub.max_score)

        // A verdict requires a cutoff. Prefer the explicit flag written at
        // release; otherwise derive it from the exam's cutoff (passing_score)
        // so the pass/fail lanes populate as soon as a cutoff is set — admins
        // use this page to shortlist BEFORE releasing results to candidates.
        const released = Boolean(sub.released_at || sub.score_released)
        let verdict: boolean | null = typeof sub.passed === 'boolean' ? sub.passed : null
        if (verdict === null && cutoff !== null && scorePct !== undefined) {
          verdict = scorePct >= cutoff
        }

        if (verdict === true) {
          status = 'passed'
          passed = true
        } else if (verdict === false) {
          status = 'failed'
          passed = false
        } else {
          // Graded but no cutoff configured and not released → no verdict yet.
          status = 'completed'
        }
      } else if (invite && invite.status === 'active') {
        status = 'inProgress'
        startedAt = invite.updated_at || invite.created_at
      }

      stages[status].push({
        id: String(invite?.id || sub?.id || email),
        userId: String(sub?.user_id || invite?.user_id || ''),
        email,
        name: invite?.full_name || email.split('@')[0] || 'Candidate',
        company: (invite as any)?.company || null,
        role: (invite as any)?.role_title || null,
        status,
        invitedAt: invite?.created_at || sub?.submitted_at || '',
        startedAt,
        completedAt,
        score,
        scorePct,
        passed,
        // Admin-set recruitment stage (drag-and-drop board). 'none' = not yet moved.
        pipeline_stage: String((sub as any)?.pipeline_stage || 'none'),
      })
    }

    const total = people.length
    const invited = stages.invited.length
    const inProgress = stages.inProgress.length
    const completed = stages.completed.length + stages.passed.length + stages.failed.length
    const passed = stages.passed.length
    const failed = stages.failed.length
    const passRate = completed > 0 ? Math.round((passed / completed) * 100) : 0
    const scored = [...stages.completed, ...stages.passed, ...stages.failed].filter(
      (c) => c.scorePct !== undefined
    )
    const avgScore =
      scored.length > 0
        ? Math.round(scored.reduce((sum, c) => sum + (c.scorePct || 0), 0) / scored.length)
        : 0

    const response: PipelineResponse = {
      stages,
      stats: { total, invited, inProgress, completed, passed, failed, passRate, avgScore },
      examTitle: exam.title,
    }

    return NextResponse.json(response)
  } catch (e: unknown) {
    const msg = 'Failed to fetch pipeline'
    console.error('[Pipeline] GET error:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

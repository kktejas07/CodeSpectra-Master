import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { interviewSessions } from '@/lib/db/interviews'
import { proctorEvents } from '@/lib/db/ai'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const gate = await requireAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  try {
    const sessions = await interviewSessions()
    const proctorCol = await proctorEvents()

    // All interviews
    const allInterviews = await sessions.find({}).sort({ created_at: -1 }).limit(200).toArray()

    // Stats
    const totalInterviews = allInterviews.length
    const completedInterviews = allInterviews.filter(i => i.status === 'completed')
    const inProgressInterviews = allInterviews.filter(i => i.status === 'in_progress')

    // Average score across completed interviews
    const scoredInterviews = completedInterviews.filter(i => typeof i.overall_score === 'number')
    const avgScore = scoredInterviews.length
      ? Math.round(scoredInterviews.reduce((s, i) => s + (i.overall_score || 0), 0) / scoredInterviews.length)
      : 0

    // Role breakdown
    const roleBreakdown = allInterviews.reduce<Record<string, number>>((acc, i) => {
      acc[i.role] = (acc[i.role] || 0) + 1
      return acc
    }, {})

    // Type breakdown
    const typeBreakdown = allInterviews.reduce<Record<string, number>>((acc, i) => {
      acc[i.type] = (acc[i.type] || 0) + 1
      return acc
    }, {})

    // Candidate performance (group by candidate_id)
    const candidateMap = new Map<string, {
      candidate_id: string
      interviews: number
      avgScore: number
      roles: string[]
      statuses: string[]
      latestInterview: string
    }>()

    for (const interview of allInterviews) {
      const existing = candidateMap.get(interview.candidate_id)
      const score = interview.overall_score ?? 0
      if (existing) {
        existing.interviews++
        existing.avgScore = (existing.avgScore * (existing.interviews - 1) + score) / existing.interviews
        if (!existing.roles.includes(interview.role)) existing.roles.push(interview.role)
        existing.statuses.push(interview.status)
        if (interview.created_at > existing.latestInterview) existing.latestInterview = interview.created_at
      } else {
        candidateMap.set(interview.candidate_id, {
          candidate_id: interview.candidate_id,
          interviews: 1,
          avgScore: score,
          roles: [interview.role],
          statuses: [interview.status],
          latestInterview: interview.created_at,
        })
      }
    }

    const candidates = [...candidateMap.values()].sort((a, b) => b.avgScore - a.avgScore)

    // Proctor violation summary
    const recentProctorEvents = await proctorCol
      .find({ session_kind: 'interview' })
      .sort({ created_at: -1 })
      .limit(500)
      .toArray()

    const violationTypes = recentProctorEvents.reduce<Record<string, number>>((acc, e) => {
      acc[e.event_type] = (acc[e.event_type] || 0) + 1
      return acc
    }, {})

    const flaggedSessions = [...new Set(
      recentProctorEvents
        .filter(e => ['tab_blur', 'session_kickout', 'fullscreen_exit'].includes(e.event_type))
        .map(e => e.session_id)
    )]

    // Score distribution
    const scoreDistribution = [
      { range: '0-20', count: scoredInterviews.filter(i => (i.overall_score || 0) <= 20).length },
      { range: '21-40', count: scoredInterviews.filter(i => (i.overall_score || 0) > 20 && (i.overall_score || 0) <= 40).length },
      { range: '41-60', count: scoredInterviews.filter(i => (i.overall_score || 0) > 40 && (i.overall_score || 0) <= 60).length },
      { range: '61-80', count: scoredInterviews.filter(i => (i.overall_score || 0) > 60 && (i.overall_score || 0) <= 80).length },
      { range: '81-100', count: scoredInterviews.filter(i => (i.overall_score || 0) > 80).length },
    ]

    return NextResponse.json({
      totalInterviews,
      completedInterviews: completedInterviews.length,
      inProgressInterviews: inProgressInterviews.length,
      avgScore,
      candidates,
      roleBreakdown,
      typeBreakdown,
      violationTypes,
      flaggedSessions: flaggedSessions.length,
      scoreDistribution,
      recentInterviews: allInterviews.slice(0, 20).map(i => ({
        id: i.id,
        title: i.title,
        role: i.role,
        type: i.type,
        status: i.status,
        overall_score: i.overall_score,
        candidate_id: i.candidate_id,
        created_at: i.created_at,
        completed_at: i.completed_at,
        proctorFlags: recentProctorEvents.filter(e => e.session_id === i.id && ['tab_blur', 'session_kickout'].includes(e.event_type)).length,
      })),
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Recruiter analytics failed'
    console.error('[CodeSpectra] recruiter/analytics:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

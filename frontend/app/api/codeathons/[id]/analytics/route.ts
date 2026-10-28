import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { isTenantStaff } from '@/lib/exam-access'

export const runtime = 'nodejs'

// GET: Get analytics for a codeathon
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })

  const { id: codeathonId } = await params

  try {
    const db = await getMongoDb()

    // Get codeathon
    const codeathon = await db.collection('codeathons').findOne({ id: codeathonId })
    if (!codeathon) return NextResponse.json({ error: 'Codeathon not found' }, { status: 404 })
    // Staff only: superadmin, or an admin of the codeathon's own tenant.
    if (!isTenantStaff(user, codeathon as unknown as Record<string, unknown>)) {
      return NextResponse.json({ error: 'Forbidden', code: 'forbidden' }, { status: 403 })
    }

    // Get submissions
    const submissions = await db.collection('codeathon_submissions')
      .find({ codeathon_id: codeathonId })
      .toArray()

    // Get registrations
    const registrations = await db.collection('codeathon_registrations')
      .countDocuments({ codeathon_id: codeathonId })

    // Get teams
    const teams = await db.collection('codeathon_teams')
      .countDocuments({ codeathon_id: codeathonId })

    // Calculate stats
    const totalSubmissions = submissions.length
    const acceptedSubmissions = submissions.filter(s => s.status === 'accepted').length
    const avgScore = submissions.length > 0
      ? Math.round(submissions.reduce((sum, s) => sum + (s.score || 0), 0) / submissions.length)
      : 0

    // Problem stats
    const problems = (codeathon.problems as any[]) || []
    const problemStats = problems.map(p => {
      const problemSubmissions = submissions.filter(s => s.problem_id === p.id)
      return {
        id: p.id,
        title: p.title,
        difficulty: p.difficulty,
        submissions: problemSubmissions.length,
        accepted: problemSubmissions.filter(s => s.status === 'accepted').length,
        avg_score: problemSubmissions.length > 0
          ? Math.round(problemSubmissions.reduce((sum, s) => sum + (s.score || 0), 0) / problemSubmissions.length)
          : 0,
      }
    })

    // Language stats
    const languageStats = submissions.reduce((acc, s) => {
      acc[s.language] = (acc[s.language] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    return NextResponse.json({
      total_participants: registrations,
      total_teams: teams,
      total_submissions: totalSubmissions,
      accepted_submissions: acceptedSubmissions,
      acceptance_rate: totalSubmissions > 0 ? Math.round((acceptedSubmissions / totalSubmissions) * 100) : 0,
      avg_score: avgScore,
      problem_stats: problemStats,
      language_stats: languageStats,
    })
  } catch (e) {
    console.error('[Analytics]', e)
    return NextResponse.json({ error: 'Failed to load analytics' }, { status: 500 })
  }
}

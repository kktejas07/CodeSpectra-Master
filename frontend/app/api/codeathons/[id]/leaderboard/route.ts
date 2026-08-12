import { NextRequest, NextResponse } from 'next/server'
import { getMongoDb } from '@/lib/mongodb'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params

  try {
    const db = await getMongoDb()
    const codeathon = await db.collection('codeathons').findOne({ id })
    const isTeamMode = (codeathon as any)?.event_type === 'team'

    // Get leaderboard entries
    const leaderboard = await db.collection('codeathon_leaderboard')
      .find({ codeathon_id: id })
      .sort({ total_score: -1, last_submission_at: 1 })
      .limit(100)
      .toArray()

    // For team mode, only show team entries (not individual)
    const filtered = isTeamMode
      ? leaderboard.filter(e => e.team_id)
      : leaderboard

    return NextResponse.json({
      leaderboard: filtered,
      event_type: isTeamMode ? 'team' : 'individual',
    })
  } catch (e) {
    console.error('[Leaderboard]', e)
    return NextResponse.json({ error: 'Failed to load leaderboard' }, { status: 500 })
  }
}

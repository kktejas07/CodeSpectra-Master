import { NextRequest, NextResponse } from 'next/server'
import { getMongoDb } from '@/lib/mongodb'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params

  try {
    const db = await getMongoDb()
    const leaderboard = await db.collection('codeathon_leaderboard')
      .find({ codeathon_id: id })
      .sort({ total_score: -1, last_submission_at: 1 })
      .limit(100)
      .toArray()

    return NextResponse.json({ leaderboard })
  } catch (e) {
    console.error('[Leaderboard]', e)
    return NextResponse.json({ error: 'Failed to load leaderboard' }, { status: 500 })
  }
}

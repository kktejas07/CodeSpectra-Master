import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser, requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const { id: codeathonId } = await params

  try {
    const db = await getMongoDb()
    
    // Fetch codeathon to get problem metadata
    const codeathon = await db.collection('codeathons').findOne({ id: codeathonId })
    if (!codeathon) return NextResponse.json({ error: 'Codeathon not found' }, { status: 404 })

    const submissions = await db
      .collection('codeathon_submissions')
      .find({ codeathon_id: codeathonId })
      .sort({ created_at: -1 })
      .toArray()

    // Fetch user details for each submission
    const userIds = [...new Set(submissions.map((s: any) => s.user_id).filter(Boolean))]
    const users = await db
      .collection('users')
      .find({ id: { $in: userIds } }, { projection: { id: 1, fullName: 1, email: 1, username: 1, avatarUrl: 1 } })
      .toArray()
    const userMap = new Map(users.map((u: any) => [u.id, u]))

    const problemMap = new Map<string, any>((codeathon.problems || []).map((p: any) => [p.id, p]))

    const enriched = submissions.map((s: any) => {
      const user = userMap.get(s.user_id)
      const problem = problemMap.get(s.problem_id)
      return {
        ...s,
        userName: user?.fullName || user?.username || user?.email || 'Anonymous',
        userEmail: user?.email || '',
        userAvatar: user?.avatarUrl || null,
        problemTitle: problem?.title || s.problem_id || 'Problem',
        problemPoints: problem?.points || 100,
        problemDifficulty: problem?.difficulty || 'Medium',
      }
    })

    return NextResponse.json({ data: enriched, count: enriched.length })
  } catch (error) {
    console.error('[CodeSpectra] GET codeathon submissions error:', error)
    return NextResponse.json({ error: 'Failed to load submissions' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { users as usersCol } from '@/lib/db/admin'
import { isTenantStaff } from '@/lib/exam-access'

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

    // Staff (superadmin / own tenant admin) see everyone's submissions;
    // a participant sees only their own — never other people's code.
    const staff = isTenantStaff(gate.user, codeathon as unknown as Record<string, unknown>)
    const filter: Record<string, unknown> = { codeathon_id: codeathonId }
    if (!staff) filter.user_id = gate.user.id

    const submissions = await db
      .collection('codeathon_submissions')
      .find(filter, { projection: { _id: 0 } })
      .sort({ created_at: -1 })
      .limit(1000)
      .toArray()

    // Fetch user details for each submission (canonical `user` collection).
    const userIds = [...new Set(submissions.map((s: any) => s.user_id).filter(Boolean))] as string[]
    const users = await (await usersCol())
      .find({ $or: [{ id: { $in: userIds } }, { _id: { $in: userIds } }] } as Record<string, unknown>, { projection: { id: 1, fullName: 1, name: 1, email: 1, image: 1 } })
      .toArray()
    const userMap = new Map(users.map((u: any) => [String(u.id || u._id), u]))

    const problemMap = new Map<string, any>((codeathon.problems || []).map((p: any) => [p.id, p]))

    const enriched = submissions.map((s: any) => {
      const user = userMap.get(s.user_id)
      const problem = problemMap.get(s.problem_id)
      return {
        ...s,
        userName: user?.fullName || user?.name || (staff ? user?.email : '') || 'Anonymous',
        userEmail: staff ? user?.email || '' : '',
        userAvatar: user?.image || null,
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

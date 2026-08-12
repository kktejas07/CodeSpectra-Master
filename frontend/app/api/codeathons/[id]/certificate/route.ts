import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'

// GET: Generate certificate for a user
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: codeathonId } = await params

  try {
    const db = await getMongoDb()

    // Get codeathon
    const codeathon = await db.collection('codeathons').findOne({ id: codeathonId })
    if (!codeathon) return NextResponse.json({ error: 'Codeathon not found' }, { status: 404 })

    // Check if user is registered
    const registration = await db.collection('codeathon_registrations').findOne({
      codeathon_id: codeathonId,
      user_id: user.id,
    })
    if (!registration) {
      return NextResponse.json({ error: 'You are not registered for this codeathon' }, { status: 400 })
    }

    // Get user's score
    const leaderboard = await db.collection('codeathon_leaderboard').findOne({
      codeathon_id: codeathonId,
      user_id: user.id,
    })

    // Generate certificate data
    const certData = {
      id: crypto.randomUUID(),
      codeathon_id: codeathonId,
      user_id: user.id,
      user_name: user.fullName || user.email || 'Participant',
      codeathon_title: codeathon.title,
      score: leaderboard?.total_score || 0,
      problems_solved: leaderboard?.problems_solved || 0,
      template: (codeathon as any).cert_template || 'classic',
      issued_at: new Date().toISOString(),
    }

    return NextResponse.json({ certificate: certData })
  } catch (e) {
    console.error('[Certificate]', e)
    return NextResponse.json({ error: 'Failed to generate certificate' }, { status: 500 })
  }
}

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

    if (!codeathon) {
      return NextResponse.json({ error: 'Codeathon not found' }, { status: 404 })
    }

    const problems = (codeathon.problems as any[]) || []
    const now = new Date()
    const startDate = codeathon.startDate ? new Date(codeathon.startDate as string) : null

    // Check problem visibility
    const visibility = (codeathon as any).problem_visibility || 'during_contest'
    const isActive = codeathon.status === 'active' || (startDate && now >= startDate)

    // If problems are hidden until contest starts, return empty
    if (visibility === 'during_contest' && !isActive) {
      return NextResponse.json({ problems: [], message: 'Problems will be visible when the contest starts' })
    }

    // If problems are visible immediately or after start, return them
    return NextResponse.json({ problems })
  } catch (e) {
    console.error('[Codeathon problems]', e)
    return NextResponse.json({ error: 'Failed to load problems' }, { status: 500 })
  }
}

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
    return NextResponse.json({ problems })
  } catch (e) {
    console.error('[Codeathon problems]', e)
    return NextResponse.json({ error: 'Failed to load problems' }, { status: 500 })
  }
}

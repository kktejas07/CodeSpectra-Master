import { NextRequest, NextResponse } from 'next/server'
import { getMongoDb } from '@/lib/mongodb'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params

  try {
    const db = await getMongoDb()
    const sponsors = await db.collection('codeathon_sponsors')
      .find({ codeathon_id: id })
      .sort({ tier: 1, name: 1 })
      .toArray()

    return NextResponse.json({ sponsors })
  } catch (e) {
    console.error('[Sponsors]', e)
    return NextResponse.json({ error: 'Failed to load sponsors' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export async function GET(request: NextRequest) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const { searchParams } = new URL(request.url)
  const interviewType = searchParams.get('type')

  try {
    const db = await getMongoDb()
    const filter: Record<string, unknown> = {}
    if (interviewType) filter.type = interviewType
    const types = await db.collection('interview_types').find(filter).toArray()
    const questions = types.flatMap((t: any) => t.questions || [])
    return NextResponse.json({ data: questions })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch questions' }, { status: 500 })
  }
}

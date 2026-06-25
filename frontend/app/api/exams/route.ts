import { NextResponse, NextRequest } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { exams, newId, nowIso, type ExamDoc } from '@/lib/db/content'
import type { Filter } from 'mongodb'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const level = searchParams.get('level')
    const subject = searchParams.get('subject')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '10')

    const filter: Filter<ExamDoc> = { status: 'available' }
    if (level) filter.difficulty_level = level
    if (subject) filter.subject = subject

    const col = await exams()
    const total = await col.countDocuments(filter)
    const data = await col
      .find(filter)
      .sort({ created_at: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray()

    return NextResponse.json({ data, pagination: { page, limit, total } })
  } catch (error) {
    console.error('[CodeSpectra] Exams API error:', error)
    return NextResponse.json({ data: [], error: 'Failed to fetch exams' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  try {
    const body = (await request.json()) as Partial<ExamDoc>
    const doc: ExamDoc = {
      id: newId(),
      title: String(body.title || 'Untitled exam'),
      subject: body.subject ?? null,
      difficulty_level: body.difficulty_level ?? null,
      duration: body.duration ?? null,
      passing_score: body.passing_score ?? null,
      description: body.description ?? null,
      status: 'available',
      questions: Array.isArray(body.questions) ? body.questions : [],
      created_by: gate.user.id,
      created_at: nowIso(),
    }
    const col = await exams()
    await col.insertOne(doc)
    return NextResponse.json(doc, { status: 201 })
  } catch (error) {
    console.error('[CodeSpectra] Create exam error:', error)
    return NextResponse.json({ error: 'Failed to create exam' }, { status: 400 })
  }
}

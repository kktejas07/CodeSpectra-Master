import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export async function GET() {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    const db = await getMongoDb()
    const data = await db.collection('exams').find({}).toArray()
    return NextResponse.json({ data })
  } catch { return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}

export async function POST(request: Request) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    const body = await request.json()
    const db = await getMongoDb()
    const now = new Date().toISOString()
    const doc = {
      id: crypto.randomUUID(),
      title: body.title,
      subject: body.subject || '',
      level: body.level || 'Beginner',
      techStack: body.techStack || [],
      duration: body.duration || 60,
      questions: body.questions || 0,
      questionList: body.questionList || [],
      published: body.published ?? false,
      attempts: 0,
      avgScore: 0,
      createdAt: now,
      updatedAt: now,
    }
    await db.collection('exams').insertOne(doc)
    return NextResponse.json(doc, { status: 201 })
  } catch { return NextResponse.json({ error: 'Failed to create' }, { status: 500 }) }
}

export async function PATCH(request: Request) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    const body = await request.json()
    const { id, ...updates } = body
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const db = await getMongoDb()
    await db.collection('exams').updateOne({ id }, { $set: { ...updates, updatedAt: new Date().toISOString() } })
    return NextResponse.json({ ok: true })
  } catch { return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}

export async function DELETE(request: Request) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const db = await getMongoDb()
    await db.collection('exams').deleteOne({ id })
    return NextResponse.json({ ok: true })
  } catch { return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}

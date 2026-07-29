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
    // AI Mock Generation
    const numQuestions = body.questions || 5
    const questionList = []
    
    if (body.techStack && body.techStack.length > 0) {
      for (let i = 0; i < numQuestions; i++) {
        const stack = body.techStack[i % body.techStack.length]
        questionList.push({
          id: crypto.randomUUID(),
          type: i % 3 === 0 ? 'coding' : 'mcq',
          title: `${stack} ${body.level} Challenge: Question ${i + 1}`,
          prompt: `As a Senior Technical Interviewer, I'd like you to demonstrate your proficiency with ${stack} at a ${body.level} level. Please read the requirements carefully and provide your best solution.`,
          options: i % 3 === 0 ? undefined : [
            `Implement the standard ${stack} best practices`, 
            `Use the legacy pattern`, 
            `Ignore the architecture completely`, 
            `Write arbitrary logic`
          ],
          answer: i % 3 === 0 ? undefined : `Implement the standard ${stack} best practices`,
          score: 10
        })
      }
    }

    const doc = {
      id: crypto.randomUUID(),
      title: body.title,
      subject: body.subject || '',
      level: body.level || 'Beginner',
      techStack: body.techStack || [],
      duration: body.duration || 60,
      questions: numQuestions,
      questionList: questionList,
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

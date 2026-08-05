import { NextResponse, type NextRequest } from 'next/server'
import { requireAuth, requireSuperAdmin } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { normalizeBankQuestion, questionBank, type BankQuestionDoc } from '@/lib/question-bank'
import type { Filter } from 'mongodb'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1)
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '25') || 25))
    const q = searchParams.get('q')?.trim().toLowerCase() || ''
    const branch = searchParams.get('branch')?.trim() || ''
    const degree_type = searchParams.get('degree_type')?.trim() || ''
    const difficulty = searchParams.get('difficulty')?.trim() || ''
    const type = searchParams.get('type')?.trim() || ''
    const subject = searchParams.get('subject')?.trim() || ''

    const filter: Filter<BankQuestionDoc> = {}
    if (branch) filter.branch = branch.toLowerCase()
    if (degree_type) filter.degree_type = degree_type.toLowerCase()
    if (difficulty) filter.difficulty = difficulty as BankQuestionDoc['difficulty']
    if (type) filter.type = type.toLowerCase() as BankQuestionDoc['type']
    if (subject) filter.subject = { $regex: subject, $options: 'i' } as unknown as string
    if (q) {
      filter.$or = [
        { title: { $regex: q, $options: 'i' } } as never,
        { question: { $regex: q, $options: 'i' } } as never,
        { subject: { $regex: q, $options: 'i' } } as never,
        { tags: { $regex: q, $options: 'i' } } as never,
      ]
    }

    const col = await questionBank()
    const [total, data] = await Promise.all([
      col.countDocuments(filter),
      col.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).toArray(),
    ])
    return NextResponse.json({ data, total, page, limit })
  } catch (e) {
    console.error('[question-bank] GET error:', e)
    return NextResponse.json({ error: 'Failed to fetch questions' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    const body = await request.json()
    const doc = normalizeBankQuestion(body || {})
    if (!doc) return NextResponse.json({ error: 'Question prompt is required' }, { status: 400 })
    doc.source = 'manual'
    const col = await questionBank()
    await col.insertOne(doc)
    return NextResponse.json(doc, { status: 201 })
  } catch (e) {
    console.error('[question-bank] POST error:', e)
    return NextResponse.json({ error: 'Failed to create question' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const body = await request.json()
    const normalized = normalizeBankQuestion(body || {})
    if (!normalized) return NextResponse.json({ error: 'Question prompt is required' }, { status: 400 })
    const db = await getMongoDb()
    await db.collection('question_bank').updateOne(
      { id },
      { $set: { ...normalized, id, updatedAt: new Date().toISOString() } },
    )
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[question-bank] PATCH error:', e)
    return NextResponse.json({ error: 'Failed to update question' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const db = await getMongoDb()
    await db.collection('question_bank').deleteOne({ id })
    return NextResponse.json({ ok: true })
  } catch { return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}

import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin, requireSuperAdmin } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { normalizeBankQuestion, questionBank, withBankKeys, type BankQuestionDoc } from '@/lib/question-bank'
import { sanitizeRegex } from '@/lib/sanitize'
import type { Filter } from 'mongodb'
import { knowledgeOnLibraryChange } from '@/lib/rag/hooks'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  // Bank docs carry answer keys and test cases — staff only (exams sample from here).
  const gate = await requireAdmin()
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
    const industry = searchParams.get('industry')?.trim() || ''
    const level = searchParams.get('level')?.trim() || ''
    const category = searchParams.get('category')?.trim() || ''

    const filter: Filter<BankQuestionDoc> = {}
    if (branch) filter.branch = branch.toLowerCase()
    if (degree_type) filter.degree_type = degree_type.toLowerCase()
    if (difficulty) filter.difficulty = difficulty as BankQuestionDoc['difficulty']
    if (type) filter.type = type.toLowerCase() as BankQuestionDoc['type']
    if (subject) filter.subject = { $regex: sanitizeRegex(subject), $options: 'i' } as unknown as string
    if (industry) filter.industry = industry.toLowerCase()
    if (level) filter.level = level.toLowerCase()
    if (category) filter.assessment_category = category.toLowerCase()
    if (q) {
      const safeQ = sanitizeRegex(q)
      filter.$or = [
        { title: { $regex: safeQ, $options: 'i' } } as never,
        { question: { $regex: safeQ, $options: 'i' } } as never,
        { subject: { $regex: safeQ, $options: 'i' } } as never,
        { tags: { $regex: safeQ, $options: 'i' } } as never,
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
    doc.review_status = 'approved' // written by a superadmin
    const col = await questionBank()
    await col.insertOne(withBankKeys(doc))
    knowledgeOnLibraryChange('question', doc.id)
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
    if (!id) return NextResponse.json({ error: 'id required', code: 'id_required' }, { status: 400 })
    const body = await request.json()
    const normalized = normalizeBankQuestion(body || {})
    if (!normalized) return NextResponse.json({ error: 'Question prompt is required' }, { status: 400 })
    const db = await getMongoDb()
    // Never rewrite where the question came from; saving an edit (or Approve) marks it reviewed.
    const { source: _source, createdAt: _created, ...fields } = normalized
    const res = await db.collection('question_bank').updateOne(
      { id },
      // Edited content gets fresh dedupe keys (CORE-031).
      { $set: { ...withBankKeys({ ...fields }), id, updatedAt: new Date().toISOString(), reviewed_by: gate.user.id, reviewed_at: new Date().toISOString() } },
    )
    if (res.matchedCount === 0) return NextResponse.json({ error: 'Question not found' }, { status: 404 })
    knowledgeOnLibraryChange('question', id)
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
    if (!id) return NextResponse.json({ error: 'id required', code: 'id_required' }, { status: 400 })
    const db = await getMongoDb()
    await db.collection('question_bank').deleteOne({ id })
    knowledgeOnLibraryChange('question', id)
    return NextResponse.json({ ok: true })
  } catch { return NextResponse.json({ error: 'Failed', code: 'failed' }, { status: 500 }) }
}

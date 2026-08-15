import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { exams } from '@/lib/db/content'
import type { IdRouteContext } from '@/lib/app-route-context'
import { getMongoDb } from '@/lib/mongodb'

export async function GET(_request: Request, { params }: IdRouteContext) {
  const gate = await requireAuth().catch(() => ({ error: 'Unauthorized' }))
  const { id } = await params
  try {
    const col = await exams()
    const doc = await col.findOne({ id })
    if (!doc) return NextResponse.json({ error: 'Exam not found' }, { status: 404 })

    // No loophole: anonymous callers must not receive answer keys. The exam
    // content (questionList.answer / .correct_answer) is only released to an
    // authenticated user; pre-login we return a sanitized copy (title/duration
    // metadata) so the assessment page can render the login prompt.
    if (!gate || 'error' in gate) {
      const safe = {
        ...doc,
        questionList: [],
        questions: [],
        submission: null,
      }
      return NextResponse.json(safe)
    }

    const db = await getMongoDb()
    const submission = await db.collection('exam_submissions').findOne({
      exam_id: id,
      user_id: gate.user.id
    })
    if (submission) {
      return NextResponse.json({
        ...doc,
        submission: {
          score: submission.score,
          total: submission.max_score,
          details: submission.details,
          released: !!submission.score_released
        }
      })
    }

    return NextResponse.json(doc)
  } catch (error) {
    console.error('[CodeSpectra] exams GET[id]:', error)
    return NextResponse.json({ error: 'Failed to load exam' }, { status: 500 })
  }
}

export async function PUT(request: Request, { params }: IdRouteContext) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  const user = gate.user
  if (user.role !== 'superadmin' && user.role !== 'tenant_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id } = await params
  try {
    const col = await exams()
    if (user.role === 'tenant_admin' && user.tenantId) {
      const exam = await col.findOne({ id })
      if (!exam) return NextResponse.json({ error: 'Exam not found' }, { status: 404 })
      if (exam.tenant_id !== user.tenantId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const data = (await request.json()) as Record<string, unknown>
    await col.updateOne({ id }, { $set: data })
    const updated = await col.findOne({ id })
    return NextResponse.json(updated)
  } catch (error) {
    console.error('[CodeSpectra] exams PUT[id]:', error)
    return NextResponse.json({ error: 'Failed to update exam' }, { status: 400 })
  }
}

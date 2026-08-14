import { NextResponse } from 'next/server'
import { requireAdmin, requireTenantEntity } from '@/lib/api-auth'
import { getMongoDb } from '@/lib/mongodb'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const gate = await requireAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  const { id: examId, userId } = await params

  try {
    const db = await getMongoDb()

    const owned = await requireTenantEntity(db, 'exams', examId, gate.user)
    if ('error' in owned) {
      return NextResponse.json({ error: owned.error }, { status: owned.status })
    }
    const exam = owned.doc

    const submission = await db.collection('exam_submissions').findOne({ exam_id: examId, user_id: userId })
    if (!submission) {
      // Exam exists but no submission — candidate may not have completed
      return NextResponse.json({
        examTitle: exam.title,
        questions: Array.isArray(exam.questionList) ? exam.questionList : (Array.isArray(exam.questions) ? exam.questions : []),
        submission: null,
        proctorEvents: [],
        candidate: { name: 'Unknown', email: '' },
      })
    }

    const events = await db.collection('proctor_events').find({
      user_id: userId,
      session_kind: 'exam',
      session_id: examId,
    }).sort({ created_at: 1 }).toArray()

    const user = await db.collection('user').findOne(
      { $or: [{ _id: userId as any }, { id: userId }] },
      { projection: { name: 1, fullName: 1, email: 1 } },
    )

    return NextResponse.json({
      examTitle: exam.title,
      questions: Array.isArray(exam.questionList) ? exam.questionList : (Array.isArray(exam.questions) ? exam.questions : []),
      submission: {
        answers: submission.answers || {},
        details: submission.details || [],
        score: submission.score ?? 0,
        max_score: submission.max_score ?? 0,
        has_pending_review: submission.has_pending_review ?? false,
        submitted_at: submission.submitted_at || submission.created_at || '',
        released_at: submission.released_at || null,
        id_photo: submission.id_photo || null,
        face_photo: submission.face_photo || null,
      },
      proctorEvents: events.map((e: Record<string, unknown>) => ({
        event_type: e.event_type,
        meta: e.meta || {},
        created_at: e.created_at,
      })),
      candidate: {
        name: user?.fullName || user?.name || 'Unknown',
        email: user?.email || '',
      },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to load submission'
    console.error('[CodeSpectra] submission review GET:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/** PATCH — Admin manual grading for coding/descriptive questions */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const gate = await requireAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  const { id: examId, userId } = await params
  const body = await request.json().catch(() => ({})) as {
    grades?: Record<string, number> // qId -> awarded points
    remarks?: Record<string, string> // qId -> feedback shown to candidate
  }

  if (!body.grades || typeof body.grades !== 'object') {
    return NextResponse.json({ error: 'grades object is required' }, { status: 400 })
  }

  try {
    const db = await getMongoDb()

    const owned = await requireTenantEntity(db, 'exams', examId, gate.user)
    if ('error' in owned) {
      return NextResponse.json({ error: owned.error }, { status: owned.status })
    }

    const submission = await db.collection('exam_submissions').findOne({ exam_id: examId, user_id: userId })
    if (!submission) return NextResponse.json({ error: 'No submission found' }, { status: 404 })

    const details = (submission.details || []) as Array<{ qId: string; correct: boolean; points: number; answer: string; pending_review?: boolean; awarded?: number }>

    let newScore = 0
    let stillPending = false
    const updatedDetails = details.map(d => {
      if (body.grades![d.qId] !== undefined) {
        const awarded = Math.max(0, Math.min(d.points, Number(body.grades![d.qId]) || 0))
        const remark = body.remarks?.[d.qId]
        const base = {
          ...d,
          awarded,
          correct: awarded > 0,
          pending_review: false,
        }
        // Persist AI/admin feedback so it is shown to the candidate on release
        if (remark != null && String(remark).trim() !== '') {
          return { ...base, remarks: String(remark).trim() }
        }
        return base
      }
      if (d.pending_review) stillPending = true
      return d
    })

    for (const d of updatedDetails) {
      if (d.awarded !== undefined) {
        newScore += d.awarded
      } else if (d.correct) {
        newScore += d.points
      }
    }

    await db.collection('exam_submissions').updateOne(
      { exam_id: examId, user_id: userId },
      { $set: { details: updatedDetails, score: newScore, has_pending_review: stillPending } }
    )

    return NextResponse.json({ score: newScore, has_pending_review: stillPending })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to save grades'
    console.error('[CodeSpectra] submission grade PATCH:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

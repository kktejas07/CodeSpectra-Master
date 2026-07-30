import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
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

    const exam = await db.collection('exams').findOne({ id: examId }, { projection: { questionList: 1, questions: 1, title: 1 } })
    if (!exam) return NextResponse.json({ error: 'Exam not found' }, { status: 404 })

    const submission = await db.collection('exam_submissions').findOne({ exam_id: examId, user_id: userId })
    if (!submission) return NextResponse.json({ error: 'No submission found' }, { status: 404 })

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

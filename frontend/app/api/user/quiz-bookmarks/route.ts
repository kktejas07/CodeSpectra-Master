import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COL = 'quiz_bookmarks'

export async function GET() {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getMongoDb()
  const rows = await db
    .collection(COL)
    .find({ userId: user.id })
    .sort({ createdAt: -1 })
    .limit(200)
    .toArray()
  return NextResponse.json({
    items: rows.map((r) => ({
      id: String(r._id),
      courseId: r.courseId,
      courseTitle: r.courseTitle || '',
      lessonId: r.lessonId,
      questionId: r.questionId,
      question: r.question,
      options: r.options || [],
      correct: typeof r.correct === 'number' ? r.correct : 0,
      explanation: r.explanation || '',
      href: r.href || `/dashboard/courses/${r.courseId}/lesson/${r.lessonId}`,
      createdAt: r.createdAt,
    })),
  })
}

/**
 * POST — toggle bookmark for a module-quiz question.
 * Body: { courseId, courseTitle?, lessonId, questionId, question, options, correct, explanation, href? }
 */
export async function POST(req: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const courseId = String(body.courseId || '').trim()
  const lessonId = String(body.lessonId || '').trim()
  const questionId = String(body.questionId || '').trim()
  const question = String(body.question || '').trim()
  if (!courseId || !lessonId || !questionId || !question) {
    return NextResponse.json(
      { error: 'courseId, lessonId, questionId, question required' },
      { status: 400 },
    )
  }

  const db = await getMongoDb()
  const col = db.collection(COL)
  const existing = await col.findOne({ userId: user.id, courseId, lessonId, questionId })
  if (existing) {
    await col.deleteOne({ _id: existing._id })
    return NextResponse.json({ saved: false })
  }

  await col.insertOne({
    userId: user.id,
    courseId,
    courseTitle: String(body.courseTitle || ''),
    lessonId,
    questionId,
    question,
    options: Array.isArray(body.options) ? body.options.map(String) : [],
    correct: typeof body.correct === 'number' ? body.correct : 0,
    explanation: String(body.explanation || ''),
    href:
      String(body.href || '').trim() ||
      `/dashboard/courses/${encodeURIComponent(courseId)}/lesson/${encodeURIComponent(lessonId)}`,
    createdAt: new Date().toISOString(),
  })
  return NextResponse.json({ saved: true })
}

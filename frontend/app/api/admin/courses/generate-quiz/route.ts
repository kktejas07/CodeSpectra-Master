import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { generateModuleQuiz } from '@/lib/courses/module-quiz-generate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const user = await getAPIUser()
  if (!user || user.role !== 'superadmin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { courseId, sectionIndex, techStack } = await request.json()
    if (!courseId || sectionIndex == null) {
      return NextResponse.json({ error: 'courseId and sectionIndex required' }, { status: 400 })
    }

    const db = await getMongoDb()
    const course = await db.collection('courses').findOne({ id: courseId })
    if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 })

    const sections = course.sections || []
    if (!sections[sectionIndex]) return NextResponse.json({ error: 'Section not found' }, { status: 404 })

    const section = sections[sectionIndex]
    if (section.quiz && section.quiz.length > 0) {
      return NextResponse.json({ success: true, skipped: true, quiz: section.quiz })
    }

    const quiz = await generateModuleQuiz({
      moduleTitle: section.title || `Module ${sectionIndex + 1}`,
      lessons: (section.lessons || []).map((l: any) => ({
        title: l.title,
        content: l.content,
        textContent: l.textContent,
      })),
      techStack: techStack || course.tags?.[0] || 'programming',
    })

    const sectionsUpdate = [...sections]
    sectionsUpdate[sectionIndex] = { ...sectionsUpdate[sectionIndex], quiz }

    await db.collection('courses').updateOne(
      { id: courseId },
      { $set: { sections: sectionsUpdate, updated_at: new Date().toISOString() } },
    )

    return NextResponse.json({
      success: true,
      quiz,
      message: `Generated ${quiz.length} questions for "${section.title}"`,
    })
  } catch (e) {
    console.error('[generate-quiz] error:', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}

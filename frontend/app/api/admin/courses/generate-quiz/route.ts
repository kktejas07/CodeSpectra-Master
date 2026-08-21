import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { backendComplete } from '@/lib/ai/backend'
import { platformModelOverrides } from '@/lib/ai/platform-model-overrides'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const QUIZ_PROMPT = (moduleTitle: string, lessons: Array<{ title: string; content?: string }>, techStack: string) => {
  const lessonDescriptions = lessons
    .map((l, i) => `${i + 1}. ${l.title}${l.content ? ` — ${l.content.slice(0, 200)}` : ''}`)
    .join('\n')

  return `You are an expert technical instructor creating a quiz for a ${techStack} course module.

Module: "${moduleTitle}"
Lessons covered:
${lessonDescriptions}

Generate a quiz with exactly 8 questions. Output valid JSON ONLY:
{
  "questions": [
    {
      "id": "q1",
      "type": "mcq",
      "question": "Question text here",
      "options": ["A) option1", "B) option2", "C) option3", "D) option4"],
      "correct": 0,
      "explanation": "WHY this is correct — explain the concept, not just the answer. Like a teacher would."
    },
    {
      "id": "q2",
      "type": "mcq",
      "question": "Which of the following is true about...",
      "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
      "correct": 2,
      "explanation": "..."
    }
  ]
}

Requirements:
- Mix difficulty: 3 easy, 3 medium, 2 hard
- Test understanding, not memorization
- Explanations must teach WHY — "This works because..." not just "The answer is C"
- Include at least 2 code-reading questions (given this code, what happens?)
- Include at least 1 edge case question
- Options must be plausible (good distractors)
- Do NOT include markdown or code blocks, just raw JSON`
}

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
    const lessons = section.lessons || []

    // Skip if quiz already exists
    if (section.quiz && section.quiz.length > 0) {
      return NextResponse.json({ success: true, skipped: true, quiz: section.quiz })
    }

    const aiRes = await backendComplete({
      systemMessage: 'You are an expert technical instructor. Return ONLY valid JSON, no markdown, no code blocks.',
      userMessage: QUIZ_PROMPT(
        section.title,
        lessons.map((l: any) => ({ title: l.title, content: l.content })),
        techStack || 'programming'
      ),
      responseFormat: 'json',
      ...(await platformModelOverrides()),
    })

    if (!aiRes.ok) {
      return NextResponse.json({ error: aiRes.text || 'AI generation failed' }, { status: 500 })
    }

    let quiz
    try {
      const raw = typeof aiRes.json === 'string' ? JSON.parse(aiRes.json) : aiRes.json
      if (typeof raw === 'string') {
        const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
        quiz = JSON.parse(cleaned)
      } else {
        quiz = raw
      }
    } catch {
      return NextResponse.json({ error: 'Failed to parse quiz JSON' }, { status: 500 })
    }

    // Save quiz to the section
    const sectionsUpdate = [...sections]
    sectionsUpdate[sectionIndex] = {
      ...sectionsUpdate[sectionIndex],
      quiz: quiz.questions || [],
    }

    await db.collection('courses').updateOne(
      { id: courseId },
      { $set: { sections: sectionsUpdate, updated_at: new Date().toISOString() } }
    )

    return NextResponse.json({
      success: true,
      quiz: quiz.questions || [],
      message: `Generated ${quiz.questions?.length || 0} questions for "${section.title}"`,
    })

  } catch (e) {
    console.error('[generate-quiz] error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { backendComplete } from '@/lib/ai/backend'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CURRICULUM_PROMPT = (techStack: string) => `You are an expert course curriculum designer. Generate a complete curriculum for a "${techStack} Data Structures & Algorithms" course.

Output valid JSON ONLY with this exact schema:
{
  "title": "Course Title",
  "description": "2-3 sentence course description",
  "level": "beginner|intermediate|advanced",
  "category": "Coding",
  "tags": ["tag1", "tag2"],
  "whatYoullLearn": ["skill 1", "skill 2", "skill 3", "skill 4", "skill 5", "skill 6"],
  "sections": [
    {
      "title": "Section Title",
      "slug": "section-slug",
      "lessons": [
        {
          "title": "Lesson Title",
          "slug": "lesson-slug",
          "description": "Brief description",
          "content": "Detailed topic/prompt for AI to generate a 3-minute video lesson. Be specific about what to cover.",
          "duration": 300,
          "free": false,
          "videoType": "ai"
        }
      ]
    }
  ]
}

Requirements:
- 12-16 modules (sections), each with 3-6 lessons
- Each lesson content field should be a detailed prompt for generating a 3-minute video
- Include practical coding examples and real-world applications
- Start from fundamentals and progress to advanced topics
- Each lesson content must be specific enough that an AI can generate a video script from it
- Do NOT include any markdown, just raw JSON
- Duration should be in seconds (300 = 5 min, 600 = 10 min, etc.)

Tech stack: ${techStack}`

export async function POST(request: NextRequest) {
  const user = await getAPIUser()
  if (!user || user.role !== 'superadmin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { techStack, slug } = await request.json()

    if (!techStack) {
      return NextResponse.json({ error: 'techStack is required' }, { status: 400 })
    }

    const db = await getMongoDb()

    // Check if course already exists
    const existing = await db.collection('courses').findOne({ id: slug || techStack.toLowerCase().replace(/\s+/g, '-') })
    if (existing) {
      return NextResponse.json({ error: `Course "${techStack}" already exists (id: ${existing.id})` }, { status: 409 })
    }

    // Generate curriculum via AI
    const aiRes = await backendComplete({
      systemMessage: 'You are an expert course curriculum designer. Return ONLY valid JSON, no markdown, no code blocks.',
      userMessage: CURRICULUM_PROMPT(techStack),
      responseFormat: 'json',
    })

    if (!aiRes.ok) {
      return NextResponse.json({ error: aiRes.text || 'AI generation failed' }, { status: 500 })
    }

    let curriculum
    try {
      const raw = typeof aiRes.json === 'string' ? JSON.parse(aiRes.json) : aiRes.json
      // Handle case where AI wraps in markdown code block
      if (typeof raw === 'string') {
        const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
        curriculum = JSON.parse(cleaned)
      } else {
        curriculum = raw
      }
    } catch {
      return NextResponse.json({ error: 'Failed to parse AI response as JSON' }, { status: 500 })
    }

    // Build course document
    const courseId = slug || techStack.toLowerCase().replace(/\s+/g, '-')
    const now = new Date().toISOString()

    const course = {
      id: courseId,
      title: curriculum.title || `${techStack} DSA Mastery`,
      description: curriculum.description || `Complete ${techStack} Data Structures & Algorithms course`,
      type: 'video',
      instructor: 'CodeSpectra AI',
      level: curriculum.level || 'beginner',
      rating: 0,
      sessions: curriculum.sections?.length || 0,
      category: curriculum.category || 'Coding',
      tags: curriculum.tags || [techStack, 'DSA'],
      image: `/courses/${techStack.toLowerCase().replace(/\s+/g, '-')}.jpg` || '/courses/cpp.jpg',
      whatYoullLearn: curriculum.whatYoullLearn || [],
      introVideoDescription: `Welcome to ${techStack} course. This course covers ${curriculum.whatYoullLearn?.slice(0, 3).join(', ').toLowerCase() || 'fundamentals and advanced topics'}.`,
      sections: (curriculum.sections || []).map((section: any) => ({
        title: section.title,
        slug: section.slug || section.title.toLowerCase().replace(/\s+/g, '-'),
        lessons: (section.lessons || []).map((lesson: any) => ({
          id: crypto.randomUUID(),
          title: lesson.title,
          slug: lesson.slug || lesson.title.toLowerCase().replace(/\s+/g, '-'),
          description: lesson.description || '',
          content: lesson.content || '',
          duration: lesson.duration || 300,
          free: lesson.free || false,
          type: 'video',
          videoType: 'ai',
          // script and audioUrl will be populated during generation
        })),
      })),
      enrolled: 0,
      created_at: now,
      updated_at: now,
    }

    await db.collection('courses').insertOne(course)

    // Count total lessons
    const totalLessons = course.sections.reduce((sum: number, s: any) => sum + s.lessons.length, 0)

    return NextResponse.json({
      success: true,
      course,
      totalLessons,
      message: `Created "${course.title}" with ${course.sections.length} modules and ${totalLessons} lessons. Ready for video generation.`,
    })

  } catch (e) {
    console.error('[generate-curriculum] error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

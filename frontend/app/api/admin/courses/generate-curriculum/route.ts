import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { backendComplete } from '@/lib/ai/backend'
import { platformModelOverrides } from '@/lib/ai/platform-model-overrides'
import { courseIdFor, padCurriculum, requiredModules } from '@/lib/courses/syllabus'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CURRICULUM_PROMPT = (techStack: string, level: string) => {
  const modules = requiredModules(techStack).map((m, i) => `${i + 1}. ${m}`).join('\n')
  return `You are designing a COMPLETE ${level} course on "${techStack}" for CodeSpectra.

This is NOT a highlights reel and NOT a 3-video intro. Every required module below MUST appear as its own section. One lesson = one atomic topic. Never merge three topics into one short video. Never skip a module. Never say "we assume you already know this" — teach it.

Required modules (use these titles, in this order, plus extra modules if the stack needs them):
${modules}

Output valid JSON ONLY:
{
  "title": "Course Title",
  "description": "2-3 sentence course description",
  "level": "${level}",
  "category": "Coding",
  "tags": ["tag1", "tag2"],
  "whatYoullLearn": ["skill 1", "skill 2", "skill 3", "skill 4", "skill 5", "skill 6"],
  "instructor": "CodeSpectra AI",
  "duration": "estimated hours as a string",
  "sections": [
    {
      "title": "Module title from the required list",
      "slug": "module-slug",
      "description": "What this module covers",
      "lessons": [
        {
          "title": "One specific topic",
          "slug": "topic-slug",
          "description": "One sentence",
          "content": "Detailed teaching brief for an 8–12 minute video: what to explain, which ${techStack} APIs/code, edge cases, complexity. No skipped subtopics."
        }
      ]
    }
  ]
}

Rules:
- At least ${requiredModules(techStack).length} sections (the required modules). 6–10 lessons per section.
- Lesson titles must be specific (e.g. "Hash collisions and open addressing in ${techStack}"), not "Introduction".
- Include working-${techStack} examples in every lesson brief.
- Start from first principles for ${level}; still cover the full module even at beginner (just slower).
- JSON only. No markdown. No external brand names.
`
}

// DELETE - Remove a course
export async function DELETE(request: NextRequest) {
  const user = await getAPIUser()
  if (!user || user.role !== 'superadmin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const courseId = searchParams.get('courseId')

    if (!courseId) {
      return NextResponse.json({ error: 'courseId required' }, { status: 400 })
    }

    const db = await getMongoDb()
    await db.collection('courses').deleteOne({ id: courseId })
    await db.collection('generation_jobs').deleteMany({ courseId })
    await db.collection('course_progress').deleteMany({ courseId })
    await db.collection('course_enrollments').deleteMany({ courseId })

    return NextResponse.json({ success: true, message: 'Course deleted' })
  } catch (e) {
    console.error('[generate-curriculum] DELETE error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const user = await getAPIUser()
  if (!user || user.role !== 'superadmin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { techStack, slug, level: rawLevel } = await request.json()
    const level = String(rawLevel || 'beginner').toLowerCase()

    if (!techStack) {
      return NextResponse.json({ error: 'techStack is required' }, { status: 400 })
    }

    const db = await getMongoDb()
    const courseId = slug || courseIdFor(techStack, level)

    const existing = await db.collection('courses').findOne({ id: courseId })
    if (existing) {
      return NextResponse.json({ error: `Course "${techStack}" (${level}) already exists (id: ${existing.id})` }, { status: 409 })
    }

    const overrides = await platformModelOverrides()
    console.log('[generate-curriculum] Calling backendComplete for:', techStack, level)
    const aiRes = await backendComplete({
      systemMessage: 'You are an expert course curriculum designer. Return ONLY valid JSON, no markdown, no code blocks. Include every required module.',
      userMessage: CURRICULUM_PROMPT(techStack, level),
      responseFormat: 'json',
      ...overrides,
    })

    console.log('[generate-curriculum] AI response ok:', aiRes.ok)
    console.log('[generate-curriculum] AI response type:', typeof aiRes.json)
    console.log('[generate-curriculum] AI response preview:', JSON.stringify(aiRes.json).substring(0, 500))

    if (!aiRes.ok) {
      console.error('[generate-curriculum] AI error, using full syllabus pad:', aiRes.text)
    }

    let curriculum
    try {
      let raw = aiRes.json
      console.log('[generate-curriculum] raw type before parse:', typeof raw)
      
      // Handle array responses (backendComplete may return array)
      if (Array.isArray(raw)) {
        console.log('[generate-curriculum] raw is array, taking first element')
        raw = raw[0]
      }
      
      // Handle string responses
      if (typeof raw === 'string') {
        console.log('[generate-curriculum] raw is string, parsing...')
        raw = JSON.parse(raw)
      }
      
      // Handle case where AI wraps in markdown code block
      if (typeof raw === 'string') {
        const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
        curriculum = JSON.parse(cleaned)
      } else {
        curriculum = raw
      }
      
      console.log('[generate-curriculum] curriculum keys:', curriculum ? Object.keys(curriculum) : 'null')
      console.log('[generate-curriculum] sections count:', curriculum?.sections?.length || 0)
    } catch (e) {
      console.error('[generate-curriculum] parse error:', e)
      curriculum = {}
    }

    if (!curriculum || typeof curriculum !== 'object') curriculum = {}
    curriculum.sections = padCurriculum(techStack, level, curriculum.sections || [])
    curriculum.title = curriculum.title || `${techStack} ${level}`
    curriculum.description = curriculum.description || `Complete ${level} ${techStack} course — every required topic, taught in full.`
    curriculum.level = level
    curriculum.category = curriculum.category || 'Coding'
    curriculum.tags = curriculum.tags || [techStack, level]
    curriculum.whatYoullLearn = curriculum.whatYoullLearn || [
      `Master ${techStack} from first principles`,
      `Cover every required ${techStack} topic in detail`,
      'Worked examples, edge cases, and complexity',
      `Build and debug real ${techStack} code`,
      'Interview-style problems with full solutions',
    ]

    const now = new Date().toISOString()

    // Generate image based on tech stack (matching existing patterns)
    const imageMap: Record<string, string> = {
      'java': '/courses/java.jpg',
      'python': '/courses/python.jpg',
      'javascript': '/courses/javascript.jpg',
      'c++': '/courses/cpp.jpg',
      'react': '/courses/web.jpg',
      'node.js': '/courses/web.jpg',
      'sql': '/courses/sql.jpg',
      'docker': '/courses/devops.jpg',
      'git': '/courses/git.jpg',
      'default': '/courses/web.jpg',
    }
    const imageKey = Object.keys(imageMap).find(k => techStack.toLowerCase().includes(k)) || 'default'

    const course = {
      id: courseId,
      title: curriculum.title || `${techStack} ${level}`,
      description: curriculum.description || `Complete ${level} ${techStack} course`,
      type: 'video',
      instructor: curriculum.instructor || 'CodeSpectra AI',
      level,
      rating: 0,
      sessions: curriculum.sections?.length || 0,
      category: curriculum.category || 'Coding',
      tags: curriculum.tags || [techStack, level],
      image: imageMap[imageKey] || '/courses/web.jpg',
      whatYoullLearn: curriculum.whatYoullLearn,
      duration: curriculum.duration || '40 hours',
      sections: (curriculum.sections || []).map((section: any) => ({
        title: section.title,
        slug: section.slug || section.title.toLowerCase().replace(/\s+/g, '-'),
        lessons: (section.lessons || []).map((lesson: any) => ({
          id: crypto.randomUUID(),
          title: lesson.title,
          slug: lesson.slug || lesson.title.toLowerCase().replace(/\s+/g, '-'),
          description: lesson.description || '',
          content: lesson.content || '',
          duration: lesson.duration || 720,
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
    
    console.log('[generate-curriculum] course sections:', course.sections.length)
    console.log('[generate-curriculum] total lessons:', totalLessons)

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

import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { backendComplete } from '@/lib/ai/backend'
import { platformModelOverrides } from '@/lib/ai/platform-model-overrides'
import { courseIdFor, padCurriculum, requiredModules, syllabusFamily, trackBrief, defaultCourseTitle } from '@/lib/courses/syllabus'
import { SOFTWARE_FAMILIES } from '@/lib/courses/catalog'
import { clearCourseVideos } from '@/lib/courses/process-job'
import { buildCatalogCourse } from '@/lib/courses/build-course'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CURRICULUM_PROMPT = (techStack: string, level: string) => {
  const title = defaultCourseTitle(techStack, level)
  const plan = estimateCourse(techStack, level)
  const modules = requiredModules(techStack, level).map((m, i) => `${i + 1}. ${m}`).join('\n')
  const software = SOFTWARE_FAMILIES.has(syllabusFamily(techStack))
  const examples = software ? `working ${techStack} code examples` : `realistic workplace examples from ${techStack}`
  return `You are designing a COMPLETE ${level} course on "${techStack}" for CodeSpectra.

Track: "${title}". ${trackBrief(techStack, level)}
Title must be "${title}". Do NOT rename it to DSA, Mastery, or a different subject.

This is NOT a highlights reel and NOT a 3-video intro. Every required module below MUST appear as its own section. One lesson = one atomic topic. Never merge three topics into one short video. Never skip a module. Never say "we assume you already know this" — teach it.

Required modules (use these titles, in this order):
${modules}

Output valid JSON ONLY:
{
  "title": "${title}",
  "description": "2-3 sentence course description",
  "level": "${level}",
  "category": "${plan.industry}",
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
          "content": "Detailed teaching brief for an 8–12 minute video: what to explain, ${examples}, edge cases. No skipped subtopics."
        }
      ]
    }
  ]
}

Rules:
- At least ${requiredModules(techStack, level).length} sections (the required modules). 6–10 lessons per section.
- Lesson titles must be specific to this track, not "Introduction".
- Include ${examples} in every lesson brief.
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
    await clearCourseVideos(courseId)
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
    const { course, totalLessons } = buildCatalogCourse(techStack, level, curriculum)

    await db.collection('courses').insertOne(course)

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

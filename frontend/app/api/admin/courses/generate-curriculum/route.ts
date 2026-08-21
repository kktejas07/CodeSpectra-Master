import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { backendComplete } from '@/lib/ai/backend'
import { platformModelOverrides } from '@/lib/ai/platform-model-overrides'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CURRICULUM_PROMPT = (techStack: string) => `You are an expert course curriculum designer for CodeSpectra learning platform. Generate a complete curriculum for a "${techStack} Data Structures & Algorithms" course.

Output valid JSON ONLY with this exact schema:
{
  "title": "Course Title",
  "description": "2-3 sentence course description",
  "level": "beginner|intermediate|advanced",
  "category": "Coding",
  "tags": ["tag1", "tag2"],
  "whatYoullLearn": ["skill 1", "skill 2", "skill 3", "skill 4", "skill 5", "skill 6"],
  "instructor": "CodeSpectra AI",
  "duration": "40 hours",
  "sections": [
    {
      "title": "Section Title",
      "slug": "section-slug",
      "description": "Brief section description",
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
- Do NOT reference any external websites, platforms, or brands (no freecodecamp, no geeksforgeeks, no youtube references)
- Duration should be in seconds (300 = 5 min, 600 = 10 min, etc.)
- All content must be original and self-contained

Tech stack: ${techStack}`

function generateFallbackSections(techStack: string) {
  const topics = [
    { title: 'Fundamentals', slug: 'fundamentals', lessons: [
      { title: `${techStack} Setup & Hello World`, slug: 'setup', description: 'Getting started', content: `Setting up ${techStack} development environment and writing your first program`, duration: 300 },
      { title: 'Variables & Data Types', slug: 'variables', description: 'Core types', content: `Understanding variables, data types, and type system in ${techStack}`, duration: 300 },
      { title: 'Control Flow', slug: 'control-flow', description: 'Conditionals and loops', content: `Mastering if/else, for loops, while loops, and switch statements in ${techStack}`, duration: 300 },
    ]},
    { title: 'Data Structures', slug: 'data-structures', lessons: [
      { title: 'Arrays & Lists', slug: 'arrays', description: 'Linear data structures', content: `Working with arrays, lists, and their operations in ${techStack}`, duration: 300 },
      { title: 'Stacks & Queues', slug: 'stacks-queues', description: 'LIFO and FIFO', content: `Implementing and using stacks and queues for problem solving`, duration: 300 },
      { title: 'Linked Lists', slug: 'linked-lists', description: 'Node-based structures', content: `Singly and doubly linked lists: traversal, insertion, and deletion`, duration: 300 },
    ]},
    { title: 'Trees & Graphs', slug: 'trees-graphs', lessons: [
      { title: 'Binary Trees', slug: 'binary-trees', description: 'Tree fundamentals', content: `Binary trees, traversals (inorder, preorder, postorder), and BST operations`, duration: 300 },
      { title: 'Graph Algorithms', slug: 'graph-algorithms', description: 'Graph traversal', content: `BFS, DFS, shortest path, and topological sort algorithms`, duration: 300 },
    ]},
    { title: 'Sorting & Searching', slug: 'sorting-searching', lessons: [
      { title: 'Sorting Algorithms', slug: 'sorting', description: 'Comparison sorts', content: `Bubble sort, merge sort, quick sort, and their time complexities`, duration: 300 },
      { title: 'Binary Search', slug: 'binary-search', description: 'Efficient searching', content: `Binary search algorithm and its variants for sorted data`, duration: 300 },
    ]},
    { title: 'Dynamic Programming', slug: 'dynamic-programming', lessons: [
      { title: 'DP Fundamentals', slug: 'dp-fundamentals', description: 'Memoization and tabulation', content: `Introduction to dynamic programming with memoization and tabulation approaches`, duration: 300 },
      { title: 'Classic DP Problems', slug: 'dp-classic', description: 'Knapsack, LCS, LIS', content: `Solving knapsack, longest common subsequence, and longest increasing subsequence`, duration: 300 },
    ]},
  ]

  return topics.map(t => ({
    title: t.title,
    slug: t.slug,
    description: `${techStack} ${t.title.toLowerCase()}`,
    lessons: t.lessons.map(l => ({
      ...l,
      free: false,
      videoType: 'ai',
    })),
  }))
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
    const overrides = await platformModelOverrides()
    console.log('[generate-curriculum] Platform overrides:', JSON.stringify(overrides))
    console.log('[generate-curriculum] Calling backendComplete for:', techStack)
    const aiRes = await backendComplete({
      systemMessage: 'You are an expert course curriculum designer. Return ONLY valid JSON, no markdown, no code blocks.',
      userMessage: CURRICULUM_PROMPT(techStack),
      responseFormat: 'json',
      ...overrides,
    })

    console.log('[generate-curriculum] AI response ok:', aiRes.ok)
    console.log('[generate-curriculum] AI response type:', typeof aiRes.json)
    console.log('[generate-curriculum] AI response preview:', JSON.stringify(aiRes.json).substring(0, 500))

    if (!aiRes.ok) {
      console.error('[generate-curriculum] AI error:', aiRes.text)
      return NextResponse.json({ error: aiRes.text || 'AI generation failed' }, { status: 500 })
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
      return NextResponse.json({ error: 'Failed to parse AI response as JSON' }, { status: 500 })
    }

    // If no sections from AI, generate a fallback curriculum
    if (!curriculum.sections || curriculum.sections.length === 0) {
      console.log('[generate-curriculum] No sections from AI, generating fallback')
      curriculum.sections = generateFallbackSections(techStack)
      curriculum.title = curriculum.title || `${techStack} DSA Mastery`
      curriculum.description = curriculum.description || `Complete ${techStack} Data Structures & Algorithms course`
      curriculum.level = curriculum.level || 'beginner'
      curriculum.category = curriculum.category || 'Coding'
      curriculum.tags = curriculum.tags || [techStack, 'DSA']
      curriculum.whatYoullLearn = curriculum.whatYoullLearn || [
        `Master ${techStack} fundamentals`,
        'Solve coding problems efficiently',
        'Understand time and space complexity',
        'Build real-world applications',
        'Pass technical interviews',
        'Earn a verified certificate'
      ]
    }

    // Build course document
    const courseId = slug || techStack.toLowerCase().replace(/\s+/g, '-')
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
      title: curriculum.title || `${techStack} DSA Mastery`,
      description: curriculum.description || `Complete ${techStack} Data Structures & Algorithms course`,
      type: 'video',
      instructor: curriculum.instructor || 'CodeSpectra AI',
      level: curriculum.level || 'beginner',
      rating: 0,
      sessions: curriculum.sections?.length || 0,
      category: curriculum.category || 'Coding',
      tags: curriculum.tags || [techStack, 'DSA'],
      image: imageMap[imageKey] || '/courses/web.jpg',
      whatYoullLearn: curriculum.whatYoullLearn || [
        `Master ${techStack} fundamentals`,
        'Solve coding problems efficiently',
        'Understand time and space complexity',
        'Build real-world applications',
        'Pass technical interviews',
        'Earn a verified certificate'
      ],
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

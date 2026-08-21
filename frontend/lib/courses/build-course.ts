import {
  courseIdFor,
  defaultCourseTitle,
  defaultLessons,
  estimateCourse,
  padCurriculum,
  sanitizeCourseTitle,
  slugify,
} from '@/lib/courses/syllabus'

const IMAGE_MAP: Record<string, string> = {
  java: '/courses/java.jpg',
  python: '/courses/python.jpg',
  javascript: '/courses/javascript.jpg',
  'c++': '/courses/cpp.jpg',
  react: '/courses/web.jpg',
  'node.js': '/courses/web.jpg',
  sql: '/courses/sql.jpg',
  docker: '/courses/devops.jpg',
  git: '/courses/git.jpg',
  default: '/courses/web.jpg',
}

function courseImage(techStack: string): string {
  const key = Object.keys(IMAGE_MAP).find(k => techStack.toLowerCase().includes(k)) || 'default'
  return IMAGE_MAP[key] || IMAGE_MAP.default
}

/** Build a full course document from the catalog (+ optional AI sections). */
export function buildCatalogCourse(
  techStack: string,
  rawLevel: string,
  ai: {
    title?: string
    description?: string
    category?: string
    tags?: string[]
    whatYoullLearn?: string[]
    instructor?: string
    duration?: string
    sections?: Array<{ title?: string; slug?: string; description?: string; lessons?: any[] }>
  } = {},
) {
  const level = String(rawLevel || 'beginner').toLowerCase()
  const plan = estimateCourse(techStack, level)
  const sections = padCurriculum(techStack, level, ai.sections || [])
  const title = sanitizeCourseTitle(ai.title || '', techStack, level)
  const now = new Date().toISOString()
  const courseId = courseIdFor(techStack, level)

  const mapped = sections.map(section => ({
    title: section.title || 'Module',
    slug: section.slug || slugify(section.title || 'module'),
    description: section.description || '',
    lessons: (section.lessons?.length ? section.lessons : defaultLessons(section.title || 'Module', techStack, level)).map((lesson: any) => ({
      id: crypto.randomUUID(),
      title: lesson.title,
      slug: lesson.slug || slugify(lesson.title || 'lesson'),
      description: lesson.description || '',
      content: lesson.content || '',
      duration: lesson.duration || 720,
      free: lesson.free || false,
      type: 'video' as const,
      videoType: 'ai' as const,
    })),
  }))

  const totalLessons = mapped.reduce((n, s) => n + s.lessons.length, 0)

  return {
    course: {
      id: courseId,
      title: title || defaultCourseTitle(techStack, level),
      description: ai.description || `${plan.title}: ${plan.moduleCount} modules, ~${plan.estimatedHours} hours. Syllabus, videos, audio, and captions.`,
      type: 'video',
      instructor: ai.instructor || 'CodeSpectra AI',
      level,
      rating: 0,
      sessions: mapped.length,
      category: ai.category || plan.industry || 'Coding',
      tags: ai.tags || [techStack, level, plan.industry, plan.family],
      image: courseImage(techStack),
      whatYoullLearn: ai.whatYoullLearn || plan.modules.slice(0, 6).map(m => `${techStack}: ${m}`),
      duration: ai.duration || `${plan.estimatedHours} hours`,
      curriculumPlan: {
        title: title || plan.title,
        modules: mapped.map(s => ({ title: s.title, lessonCount: s.lessons.length })),
        totalLessons,
        estimatedHours: plan.estimatedHours,
        artifacts: ['syllabus', 'curriculum', 'video', 'audio', 'captions'],
      },
      sections: mapped,
      enrolled: 0,
      created_at: now,
      updated_at: now,
    },
    totalLessons,
    plan,
  }
}

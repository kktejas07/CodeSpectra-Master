/**
 * Module-end quiz helpers (client-safe).
 * LLM generation lives in module-quiz-generate.ts — do not import that from client pages.
 */

export type ModuleQuizQuestion = {
  id: string
  type: 'mcq' | 'true_false' | 'code'
  question: string
  options: string[]
  correct: number
  explanation: string
}

export function quizLessonId(sectionIndex: number): string {
  return `quiz__${sectionIndex}`
}

export function parseQuizLessonId(lessonId: string): number | null {
  const m = /^quiz__(\d+)$/.exec(lessonId)
  return m ? Number(m[1]) : null
}

export function normalizeQuizQuestions(raw: unknown): ModuleQuizQuestion[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { questions?: unknown }).questions)
      ? (raw as { questions: unknown[] }).questions
      : []
  return list.map((item: any, i: number) => {
    const options = Array.isArray(item?.options)
      ? item.options.map((o: unknown) => String(o ?? '').trim()).filter(Boolean)
      : []
    const correctRaw = item?.correct ?? item?.correctAnswer ?? item?.answer
    const correct = typeof correctRaw === 'number' ? correctRaw : Number(correctRaw)
    const opts = options.length >= 2 ? options.slice(0, 6) : ['True', 'False']
    return {
      id: String(item?.id || `q${i + 1}`),
      type: (['mcq', 'true_false', 'code'].includes(String(item?.type)) ? item.type : 'mcq') as ModuleQuizQuestion['type'],
      question: String(item?.question || '').trim(),
      options: opts,
      correct: Number.isFinite(correct) ? Math.max(0, Math.min(opts.length - 1, correct)) : 0,
      explanation: String(item?.explanation || item?.explain || '').trim() || 'Review this module’s lessons and try again.',
    }
  }).filter(q => q.question && q.options.length >= 2)
}

/** Offline quiz so modules always have something to ask after videos. */
export function fallbackModuleQuiz(
  moduleTitle: string,
  lessons: Array<{ title?: string }>,
  techStack: string,
): ModuleQuizQuestion[] {
  const tech = techStack || 'this technology'
  const titles = lessons.map(l => (l.title || '').trim()).filter(Boolean)
  const t0 = titles[0] || moduleTitle
  const t1 = titles[1] || moduleTitle
  const t2 = titles[2] || t0
  return normalizeQuizQuestions([
    {
      id: 'q1',
      type: 'mcq',
      question: `What is the main goal of the module "${moduleTitle}" in ${tech}?`,
      options: [
        `Build a solid understanding of ${moduleTitle}`,
        'Skip practice and memorize syntax only',
        'Replace the rest of the course',
        'Avoid writing any code',
      ],
      correct: 0,
      explanation: `Each module teaches one slice of ${tech}. "${moduleTitle}" is meant to be learned deeply before moving on.`,
    },
    {
      id: 'q2',
      type: 'mcq',
      question: `Which lesson topic belongs in this module?`,
      options: [t0, 'Unrelated networking trivia', 'Hardware assembly only', 'None of the above'],
      correct: 0,
      explanation: `"${t0}" is part of this module’s syllabus.`,
    },
    {
      id: 'q3',
      type: 'true_false',
      question: `True or false: after watching the videos in "${moduleTitle}", you should be able to explain ${t1} in your own words.`,
      options: ['True', 'False'],
      correct: 0,
      explanation: 'Videos are meant to leave you able to explain the ideas, not just recognize them.',
    },
    {
      id: 'q4',
      type: 'mcq',
      question: `Best next step after finishing the videos on "${t2}"?`,
      options: [
        'Take the module quiz, then continue to the next module',
        'Delete the course and start over',
        'Skip all remaining modules',
        'Ignore mistakes in the quiz',
      ],
      correct: 0,
      explanation: 'Unstop-style flow: finish videos → test understanding → unlock the next module.',
    },
    {
      id: 'q5',
      type: 'mcq',
      question: `In ${tech}, why do we practice concepts from "${moduleTitle}" with a short quiz?`,
      options: [
        'To check understanding before advancing',
        'To replace the need for lessons',
        'Only to inflate completion stats',
        'Quizzes are optional and have no purpose',
      ],
      correct: 0,
      explanation: 'The quiz is a gate: it confirms you understood the module before moving on.',
    },
  ])
}

/**
 * Server-only module quiz generation (uses AI + Mongo-backed secrets).
 * Never import this from client components — use module-quiz.ts helpers instead.
 */
import { backendComplete } from '@/lib/ai/backend'
import { platformModelOverrides } from '@/lib/ai/platform-model-overrides'
import {
  fallbackModuleQuiz,
  normalizeQuizQuestions,
  type ModuleQuizQuestion,
} from '@/lib/courses/module-quiz'

export async function generateModuleQuiz(opts: {
  moduleTitle: string
  lessons: Array<{ title?: string; content?: string; textContent?: string }>
  techStack: string
}): Promise<ModuleQuizQuestion[]> {
  const fallback = fallbackModuleQuiz(opts.moduleTitle, opts.lessons, opts.techStack)
  try {
    const lessonLines = opts.lessons
      .map((l, i) => {
        const body = String(l.textContent || l.content || '').slice(0, 220)
        return `${i + 1}. ${l.title || 'Lesson'}${body ? ` — ${body}` : ''}`
      })
      .join('\n')

    const res = await backendComplete({
      systemMessage: 'You are an expert technical instructor. Return ONLY valid JSON, no markdown.',
      userMessage: `Create a quiz for a ${opts.techStack} course module.

Module: "${opts.moduleTitle}"
Lessons:
${lessonLines}

Return JSON:
{"questions":[{"id":"q1","type":"mcq","question":"...","options":["A","B","C","D"],"correct":0,"explanation":"Teach why..."}]}

Rules:
- Exactly 5–8 questions (interactive UI — not for reading inside a video)
- Mix easy/medium; at least one true_false allowed (options True/False)
- Plausible distractors
- correct is a 0-based index
- explanation MUST reteach the concept in 2–4 sentences (as if the student got it wrong): say why the correct option is right, why a common wrong choice fails, and one practical tip. Do NOT only say "The answer is X."`,
      responseFormat: 'json',
      modelRole: 'fast',
      feature: 'module-quiz',
      ...(await platformModelOverrides()),
    })

    if (!res.ok) return fallback
    const parsed = normalizeQuizQuestions(res.json ?? res.raw ?? res.text)
    return parsed.length >= 4 ? parsed : fallback
  } catch {
    return fallback
  }
}

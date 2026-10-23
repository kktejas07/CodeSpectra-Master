// Client-safe types + constants for AI Fluency Assessment (no MongoDB/server imports)

export type FluencyCategory =
  | 'prompt_engineering'
  | 'ai_output_review'
  | 'debugging_ai_code'
  | 'ai_decision_making'
  | 'prompt_chaining'

export interface FluencyQuestion {
  id: string
  category: FluencyCategory
  scenario: string
  task: string
  difficulty: string
  rubric: string[]
  sampleAnswer?: string
}

export interface FluencyEvaluation {
  score: number
  strengths: string[]
  improvements: string[]
  detailedFeedback: string
  /** SEC-032: the answer contained instructions aimed at the grader — score capped, reasons logged. */
  integrityFlags?: string[]
}

export interface FluencyAnswerEntry {
  questionId: string
  answer: string
  evaluation: FluencyEvaluation
  timestamp: number
}

export interface CategoryBreakdown {
  category: FluencyCategory
  label: string
  score: number
  count: number
}

export interface FluencyReport {
  overallScore: number
  level: string
  summary: string
  categoryBreakdown: CategoryBreakdown[]
  strongestCategory: string
  weakestCategory: string
  topStrengths: string[]
  topImprovements: string[]
  recommendations: string[]
}

export interface FluencySession {
  id: string
  userId: string
  focusCategories: FluencyCategory[]
  difficulty: string
  questionCount: number
  questions: FluencyQuestion[]
  answers: FluencyAnswerEntry[]
  startedAt: number
  completedAt?: number
  report?: FluencyReport
}

export const CATEGORY_LABELS: Record<FluencyCategory, string> = {
  prompt_engineering: 'Prompt Engineering',
  ai_output_review: 'AI Output Review',
  debugging_ai_code: 'Debugging AI Code',
  ai_decision_making: 'AI Decision Making',
  prompt_chaining: 'Prompt Chaining',
}

export const ALL_CATEGORIES: FluencyCategory[] = [
  'prompt_engineering',
  'ai_output_review',
  'debugging_ai_code',
  'ai_decision_making',
  'prompt_chaining',
]

export const DIFFICULTY_LEVELS = ['beginner', 'intermediate', 'advanced', 'expert'] as const

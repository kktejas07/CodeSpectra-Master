// Client-safe types + constants for AI Mock Interview

// ── Legacy types (kept for UI compatibility) ─────────────────────────────

export interface ParsedResume {
  skills: string[]
  experience: { role: string; company: string; duration: string; highlights: string[] }[]
  education: { degree: string; school: string }[]
  summary: string
}

export interface Question {
  id: string
  type: 'technical' | 'behavioral' | 'system-design' | 'coding'
  question: string
  difficulty: string
  rubric: string[]
  expectedPoints: string[]
}

export interface Evaluation {
  score: number
  strengths: string[]
  improvements: string[]
  followUp: string | null
  detailedFeedback: string
}

export interface Report {
  overallScore: number
  category: string
  summary: string
  topStrengths: string[]
  topImprovements: string[]
  recommendedResources: string[]
}

// ── Conversational interview types ───────────────────────────────────────

export interface ConversationMessage {
  role: 'ai' | 'candidate'
  text: string
  timestamp: number
  category?: string
}

export interface CurrentQuestionState {
  text: string
  category: string
  askedAt: number
}

export interface TurnEvaluation {
  score: number
  strengths: string[]
  improvements: string[]
}

export interface ConversationReport extends Report {
  categoryBreakdown: { category: string; score: number; assessment: string }[]
  interviewTips: string[]
}

export interface ConversationSession {
  id: string
  userId: string
  role: string
  difficulty: string
  resume?: ParsedResume
  conversationHistory: ConversationMessage[]
  currentQuestion: CurrentQuestionState | null
  scores: TurnEvaluation[]
  turnCount: number
  totalDuration: number
  maxTurns: number
  maxDuration: number
  status: 'active' | 'completed' | 'timeout'
  startedAt: number
  completedAt?: number
  report?: ConversationReport
}

// ── API response shapes ─────────────────────────────────────────────────

export interface StartResponse {
  sessionId: string
  firstQuestion: Question
  totalQuestions: number
  greeting: string
}

export interface AnswerResponse {
  evaluation: Evaluation
  nextQuestion: Question | null
  progress: { current: number; total: number }
  shouldEnd: boolean
}

export interface CompleteResponse {
  report: Report
  sessionComplete: boolean
}

// ── Constants ───────────────────────────────────────────────────────────

export const ROLE_OPTIONS = [
  'Software Engineer', 'Frontend Developer', 'Backend Developer',
  'Data Scientist', 'DevOps Engineer', 'Product Manager',
  'Full Stack Developer', 'Custom',
]

export const DIFFICULTY_LEVELS = ['beginner', 'intermediate', 'advanced', 'expert'] as const

export const DEFAULT_MAX_TURNS = 10
export const DEFAULT_MAX_DURATION = 1800 // 30 minutes

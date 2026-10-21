/**
 * AI mock-interview simulator — shared types, constants and input schemas
 * (pure, client-safe). Server code lives next to it (store.ts, engine.ts).
 *
 * A session is one practice interview: setup (company, role, level, round,
 * language, text | voice), a short plan of 5–10 questions, the turns, and the
 * feedback report. Sessions belong to one learner and are private; a share
 * link is opt-in (share_token) and shows the report without answers.
 */
import { z } from 'zod'

export const ROUNDS = [
  { id: 'hr', label: 'HR and behavioural', hint: 'Motivation, teamwork, conflict, ownership. Answer with STAR.' },
  { id: 'technical', label: 'Technical concepts', hint: 'Core CS and role topics: explain, compare, trade-offs.' },
  { id: 'coding', label: 'Live coding', hint: 'Talk through an approach, write code in the editor, run it.' },
  { id: 'system_design', label: 'System design', hint: 'Requirements, high-level design, data, scale, trade-offs.' },
] as const
export type RoundType = (typeof ROUNDS)[number]['id']
export const ROUND_IDS = ROUNDS.map((r) => r.id) as unknown as readonly [RoundType, ...RoundType[]]

export const LEVELS = [
  { id: 'intern', label: 'Intern / student' },
  { id: 'entry', label: 'Entry level (0–2 years)' },
  { id: 'mid', label: 'Mid level (2–5 years)' },
  { id: 'senior', label: 'Senior (5+ years)' },
] as const
export type SimLevel = (typeof LEVELS)[number]['id']
export const LEVEL_IDS = LEVELS.map((l) => l.id) as unknown as readonly [SimLevel, ...SimLevel[]]

/** Spoken / written interview language (BCP-47). Browser speech recognition and synthesis use the same tag. */
export const SIM_LANGUAGES = [
  { id: 'en-IN', label: 'English (India)' },
  { id: 'en-US', label: 'English (US)' },
  { id: 'en-GB', label: 'English (UK)' },
  { id: 'hi-IN', label: 'Hindi' },
  { id: 'te-IN', label: 'Telugu' },
  { id: 'ta-IN', label: 'Tamil' },
] as const
export type SimLanguage = (typeof SIM_LANGUAGES)[number]['id']
export const LANGUAGE_IDS = SIM_LANGUAGES.map((l) => l.id) as unknown as readonly [SimLanguage, ...SimLanguage[]]

export const MODES = ['text', 'voice'] as const
export type SimMode = (typeof MODES)[number]

/** Rubric dimensions, each scored 0–5 by the interviewer model. */
export const DIMENSIONS = ['communication', 'correctness', 'depth', 'structure'] as const
export type Dimension = (typeof DIMENSIONS)[number]
export type DimScores = Record<Dimension, number>

export const DIMENSION_LABEL: Record<Dimension, string> = {
  communication: 'Communication',
  correctness: 'Correctness',
  depth: 'Depth',
  structure: 'Structure',
}

export type Readiness = 'ready' | 'almost' | 'developing' | 'not_yet'
export const READINESS_LABEL: Record<Readiness, string> = {
  ready: 'Ready',
  almost: 'Almost ready',
  developing: 'Developing',
  not_yet: 'Not ready yet',
}

// ─── Settings (admin) ───────────────────────────────────────────────────────

export interface InterviewSimSettings {
  enabled: boolean
  /** Sessions one learner may start per UTC day. */
  daily_sessions_per_user: number
  /** Planned questions per session (5–10). */
  questions_per_session: number
  /** Follow-ups the interviewer may ask per question (0–2). */
  max_followups_per_question: number
  /** Platform-wide AI spend cap per calendar month (USD, estimated from tokens). */
  monthly_cost_cap_usd: number
  /** AI spend cap per session (USD). */
  session_cost_cap_usd: number
  allow_voice: boolean
  allow_recordings: boolean
  /** Recordings are deleted this many days after upload. */
  recording_retention_days: number
}

export const DEFAULT_SIM_SETTINGS: InterviewSimSettings = {
  enabled: true,
  daily_sessions_per_user: 3,
  questions_per_session: 6,
  max_followups_per_question: 1,
  monthly_cost_cap_usd: 10,
  session_cost_cap_usd: 0.25,
  allow_voice: true,
  allow_recordings: true,
  recording_retention_days: 30,
}

export const SimSettingsPatchSchema = z.object({
  enabled: z.boolean().optional(),
  daily_sessions_per_user: z.coerce.number().int().min(0).max(50).optional(),
  questions_per_session: z.coerce.number().int().min(5).max(10).optional(),
  max_followups_per_question: z.coerce.number().int().min(0).max(2).optional(),
  monthly_cost_cap_usd: z.coerce.number().min(0).max(5000).optional(),
  session_cost_cap_usd: z.coerce.number().min(0.01).max(5).optional(),
  allow_voice: z.boolean().optional(),
  allow_recordings: z.boolean().optional(),
  recording_retention_days: z.coerce.number().int().min(1).max(365).optional(),
}).strict()

/** Validate an admin settings change. Pure. */
export function cleanSimSettingsPatch(raw: unknown): { ok: true; patch: Partial<InterviewSimSettings> } | { ok: false; error: string } {
  const r = SimSettingsPatchSchema.safeParse(raw)
  if (!r.success) {
    const i = r.error.issues[0]
    return { ok: false, error: i ? `${i.path.join('.') || 'settings'}: ${i.message}` : 'Invalid settings' }
  }
  const patch: Partial<InterviewSimSettings> = {}
  for (const [k, v] of Object.entries(r.data)) if (v !== undefined) (patch as Record<string, unknown>)[k] = v
  for (const k of ['monthly_cost_cap_usd', 'session_cost_cap_usd'] as const) {
    if (typeof patch[k] === 'number') patch[k] = Math.round((patch[k] as number) * 100) / 100
  }
  return { ok: true, patch }
}

/** Stored settings merged over the defaults (unknown / bad fields dropped). Pure. */
export function mergeSimSettings(raw: unknown): InterviewSimSettings {
  const r = SimSettingsPatchSchema.partial().safeParse(raw && typeof raw === 'object' ? pickKnown(raw as Record<string, unknown>) : {})
  return { ...DEFAULT_SIM_SETTINGS, ...(r.success ? stripUndefined(r.data) : {}) }
}

function pickKnown(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of Object.keys(DEFAULT_SIM_SETTINGS)) if (k in o) out[k] = o[k]
  return out
}
function stripUndefined<T extends object>(o: T): Partial<T> {
  const out: Partial<T> = {}
  for (const [k, v] of Object.entries(o)) if (v !== undefined) (out as Record<string, unknown>)[k] = v
  return out
}

// ─── Setup input ────────────────────────────────────────────────────────────

const slug = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{0,62}$/)

export const StartInputSchema = z.object({
  company: slug.optional().nullable(),
  pattern_id: slug.optional().nullable(),
  role: z.string().trim().min(2).max(80),
  level: z.enum(LEVEL_IDS),
  round: z.enum(ROUND_IDS),
  language: z.enum(LANGUAGE_IDS).default('en-IN'),
  mode: z.enum(MODES).default('text'),
  /** Piston language for the coding round. */
  code_language: z.string().trim().max(20).optional(),
  record: z.boolean().default(false),
  /** Consent to microphone / camera use was shown and accepted (voice or recording). */
  consent: z.boolean().default(false),
  retake_of: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(),
}).strict()
export type StartInput = z.infer<typeof StartInputSchema>

export const AnswerInputSchema = z.object({
  text: z.string().max(6000).default(''),
  code: z.string().max(50_000).optional(),
  code_language: z.string().trim().max(20).optional(),
  input: z.enum(MODES).default('text'),
  /** Voice answers: how long the learner spoke (ms), for pace. */
  duration_ms: z.number().int().min(0).max(30 * 60_000).optional(),
  /** The turn this answers (guards double submits). */
  turn: z.number().int().min(0).max(100),
}).strict()
export type AnswerInput = z.infer<typeof AnswerInputSchema>

// ─── Session documents ──────────────────────────────────────────────────────

export interface TestCase { input: string; output: string }

export interface PlannedQuestion {
  /** q1, q2 … */
  id: string
  text: string
  topic: string
  kind: 'talk' | 'code'
  expected_points: string[]
  /** Coding problems: visible sample cases (run with Piston). */
  test_cases?: TestCase[]
  starter_code?: string
  /** Bank question id when the problem came from the question bank. */
  bank_id?: string
}

export interface CodeRun { language: string; passed: number; total: number; error?: string }

export interface VoiceStats { words: number; filler_count: number; fillers: Record<string, number>; wpm: number | null; duration_ms: number }

export interface SimTurn {
  n: number
  question_id: string
  /** What the interviewer said (question or follow-up). */
  prompt: string
  is_followup: boolean
  answer?: string
  code?: string
  code_run?: CodeRun
  input?: SimMode
  voice?: VoiceStats
  /** The answer tripped the prompt guard (neutralised before scoring). */
  flagged?: boolean
  asked_at: string
  answered_at?: string
}

export interface QuestionResult {
  question_id: string
  scores: DimScores
  /** 0–100, rubric-weighted for the round. */
  score: number
  feedback: string
  model_answer: string
  strengths: string[]
  gaps: string[]
  flagged?: boolean
}

export interface ReportLink { label: string; href: string; kind: 'learn' | 'practice' }
export interface ReportGap { topic: string; note: string; links: ReportLink[] }

export interface SimReport {
  overall: number
  readiness: Readiness
  dimension_averages: DimScores
  summary: string
  strengths: string[]
  gaps: ReportGap[]
  tips: string[]
  questions: Array<QuestionResult & { text: string; topic: string }>
  voice?: { words: number; filler_count: number; filler_per_100: number; top_fillers: Array<{ word: string; count: number }>; wpm: number | null; pace: 'slow' | 'good' | 'fast' | null }
  answered: number
  planned: number
  /** True when the AI summary failed and the report was assembled from per-question scores only. */
  fallback?: boolean
  generated_at: string
}

export type SessionStatus = 'active' | 'completed' | 'abandoned'

export interface SimSessionDoc {
  id: string
  user_id: string
  status: SessionStatus
  config: {
    company: string | null
    company_name: string | null
    pattern_id: string | null
    role: string
    level: SimLevel
    round: RoundType
    language: SimLanguage
    mode: SimMode
    code_language: string
    record: boolean
  }
  greeting: string
  /** The interviewer's last line when the session ended. */
  closing?: string
  plan: PlannedQuestion[]
  turns: SimTurn[]
  results: QuestionResult[]
  /** Index into plan of the question being asked. */
  cursor: number
  followups_used: Record<string, number>
  report?: SimReport
  cost_usd: number
  ai_calls: number
  share_token: string | null
  retake_of?: string
  day: string
  month: string
  created_at: string
  updated_at: string
  completed_at?: string
}

/** What the learner's browser gets (no internal fields). */
export type SimSessionView = Omit<SimSessionDoc, 'user_id' | 'followups_used' | 'cost_usd' | 'ai_calls' | 'day' | 'month' | 'plan'> & {
  plan: Array<Pick<PlannedQuestion, 'id' | 'topic' | 'kind'>>
  current: null | { turn: number; prompt: string; kind: 'talk' | 'code'; question_id: string; is_followup: boolean; test_cases?: TestCase[]; starter_code?: string }
  recording: null | { size: number; mime: string; expires_at: string }
  share_url: string | null
}

export interface SimHistoryItem {
  id: string
  status: SessionStatus
  company_name: string | null
  role: string
  level: SimLevel
  round: RoundType
  mode: SimMode
  overall: number | null
  readiness: Readiness | null
  answered: number
  planned: number
  shared: boolean
  has_recording: boolean
  created_at: string
}

export function roundLabel(r: string): string {
  return ROUNDS.find((x) => x.id === r)?.label ?? r
}
export function levelLabel(l: string): string {
  return LEVELS.find((x) => x.id === l)?.label ?? l
}

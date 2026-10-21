/**
 * Personalised study plans — shared types (client-safe).
 *
 * A plan is built from a learner's own results (exam answers by topic + difficulty, adaptive
 * test levels, company-test section scores, practice sets, AI mock interview gaps): weak areas
 * are computed by a pure function (weak-areas.ts) and the week is chosen by a deterministic
 * planner (planner.ts). AI only words the weekly coach note (capped). The scheduler adapts the
 * plan every week from progress.
 */

export type Difficulty = 'Easy' | 'Medium' | 'Hard'

export type ItemKind = 'learn' | 'practice' | 'company_test' | 'mock_test' | 'daily_challenge' | 'interview'

export interface PlanTarget {
  /** company = a company exam pattern (e.g. tcs-nqt); skills = chosen domains */
  kind: 'company' | 'skills'
  pattern_id?: string | null
  /** label shown to the learner, e.g. "TCS NQT" */
  label: string
  /** question-bot domain ids the learner wants to focus on (skills plans, optional for company plans) */
  domains: string[]
  /** YYYY-MM-DD the plan started */
  start_date: string
  /** total plan length in days (7–180) */
  days: number
  hours_per_week: number
}

export interface WeakArea {
  /** `${domain}` or `${domain}::${topic}` */
  key: string
  domain: string
  topic: string | null
  label: string
  /** 0..1 estimated mastery (smoothed accuracy, difficulty weighted) */
  mastery: number
  /** evidence weight (≈ questions seen) */
  evidence: number
  /** priority used by the planner (higher = study first) */
  priority: number
  /** difficulty to practise at next */
  next_difficulty: Difficulty
  sources: string[]
}

export interface PlanItem {
  id: string
  kind: ItemKind
  /** YYYY-MM-DD in the learner's time zone */
  day: string
  title: string
  minutes: number
  /** why this item is here (plain words) */
  reason: string
  area_key?: string | null
  /** learn: post slug · practice: domain + difficulty (+ topic) · company/mock: pattern or catalogue id */
  ref: { slug?: string; domain?: string; topic?: string | null; difficulty?: Difficulty; count?: number; pattern_id?: string; level?: 'easy' | 'moderate' | 'tough'; mock_id?: string }
  href: string
  done_at?: string | null
}

export interface PlanWeek {
  week_no: number
  start: string
  end: string
  load_factor: number
  items: PlanItem[]
  /** AI-worded (or template) note for the week */
  note?: string | null
  note_source?: 'ai' | 'template'
}

export interface WeekSummary {
  week_no: number
  start: string
  end: string
  planned: number
  done: number
  minutes_planned: number
  minutes_done: number
}

export interface Reminders {
  email: boolean
  whatsapp: boolean
  /** local hour 0–23 */
  hour: number
  timezone: string
  last_sent_day?: string | null
}

export interface StudyPlanDoc {
  id: string
  user_id: string
  tenant_id?: string | null
  target: PlanTarget
  weak_areas: WeakArea[]
  week: PlanWeek
  history: WeekSummary[]
  reminders: Reminders
  status: 'active' | 'finished'
  /** practice item id → drawn question ids (so grading uses the same set) */
  practice_sets?: Record<string, string[]>
  /** adapt lock (scheduler + manual regenerate) */
  lock_until?: string | null
  /** set when the current week ended and the next one should be built */
  next_adapt_at: string
  regenerated_at?: string | null
  /** Learn posts read in earlier weeks (never planned again) */
  read_slugs?: string[]
  /** local days with at least one item done (streak) */
  active_days?: string[]
  created_at: string
  updated_at: string
}

export const ITEM_LABELS: Record<ItemKind, string> = {
  learn: 'Read',
  practice: 'Practice set',
  company_test: 'Company test',
  mock_test: 'Mock test',
  daily_challenge: 'Daily challenge',
  interview: 'Mock interview',
}

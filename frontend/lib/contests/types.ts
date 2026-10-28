/**
 * Hosted contests — one engine for many event formats (theory-to-code
 * sprints, reverse coding, debug-a-thons, CTFs, datathons, prompt-a-thons,
 * ideathons, code golf, system design jams, open-source sprints).
 *
 * Client-safe: types and constants only. Secrets (hidden tests, flag hashes,
 * labels, eval sets, reference solutions) never live on the contest doc —
 * they are in `contest_secrets` and only the server reads them.
 */
import type { CertificatePolicy } from '@/lib/codeathon-results'

export const CONTEST_FORMATS = [
  'theory_to_code', 'reverse_coding', 'debug_a_thon', 'ctf', 'datathon',
  'prompt_a_thon', 'ideathon', 'code_golf', 'system_design_jam', 'open_source_sprint',
] as const
export type ContestFormat = (typeof CONTEST_FORMATS)[number]

export function isContestFormat(v: unknown): v is ContestFormat {
  return typeof v === 'string' && (CONTEST_FORMATS as readonly string[]).includes(v)
}

export type ContestStatus = 'draft' | 'published' | 'closed'
/** Derived from the schedule for display; never stored. */
export type ContestPhase = 'draft' | 'upcoming' | 'registration' | 'live' | 'ended' | 'results' | 'closed'

export interface ContestSchedule {
  /** UTC ISO. Registration opens (null = as soon as it is published). */
  registration_opens_at: string | null
  /** UTC ISO. Registration closes (null = when the contest ends). */
  registration_closes_at: string | null
  starts_at: string
  ends_at: string
  /** IANA zone used to show times to people (e.g. Asia/Kolkata). */
  timezone: string
}

export interface ContestParticipation {
  mode: 'solo' | 'team'
  team_min: number
  team_max: number
  /** Cap on entries (people or teams); 0 = no cap. */
  max_entries: number
}

export type LeaderboardVisibility = 'live' | 'after_end' | 'hidden'
export type TieBreak = 'earliest' | 'fewest_attempts'

export interface ContestLeaderboard {
  visibility: LeaderboardVisibility
  /** Freeze the public board this many minutes before the end (0 = never). */
  freeze_minutes: number
  tie_break: TieBreak
}

export interface ContestRubricCriterion {
  name: string
  /** Points for this criterion; all weights add up to 100. */
  weight: number
}

export interface ContestJudging {
  rubric: ContestRubricCriterion[]
  /** User ids who may score submissions (staff always can). */
  judges: string[]
  /** Drop each submission's highest and lowest judge total before averaging. */
  drop_high_low: boolean
}

/** A task inside a format (challenge, problem, eval task…). Public fields only. */
export interface ContestTask {
  id: string
  [key: string]: unknown
}

export interface ContestPublicConfig {
  tasks: ContestTask[]
  [key: string]: unknown
}

export interface ContestDoc {
  id: string
  slug: string
  title: string
  /** One line for cards and the events feed. */
  summary: string
  /** Plain text / light markdown; rendered as text. */
  description: string
  format: ContestFormat
  status: ContestStatus
  visibility: 'public' | 'unlisted'
  schedule: ContestSchedule
  participation: ContestParticipation
  leaderboard: ContestLeaderboard
  certificates: CertificatePolicy
  judging: ContestJudging
  /** Format config visible to participants (no secrets). */
  config: ContestPublicConfig
  prize_text: string
  banner_url: string
  /** What still blocks publishing (admin only; empty = ready). */
  config_errors: string[]
  results_released: boolean
  released_at: string | null
  published_at: string | null
  tenant_id: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface ContestSecretDoc {
  contest_id: string
  /** Per-contest salt for CTF flag hashes (hex). */
  salt: string
  top: Record<string, unknown>
  tasks: Record<string, Record<string, unknown>>
  updated_at: string
}

export interface ContestEntryMember {
  user_id: string
  name: string
  role: 'captain' | 'member'
  /** GitHub login (open-source sprints). */
  github_login?: string | null
}

export interface ContestEntryDoc {
  id: string
  contest_id: string
  kind: 'user' | 'team'
  name: string
  members: ContestEntryMember[]
  member_ids: string[]
  /** Team join code (teams only). */
  join_code: string | null
  created_at: string
  updated_at: string
}

export type SubmissionStatus = 'scored' | 'pending_review' | 'rejected' | 'error'

export interface JudgeScore {
  judge_id: string
  scores: { name: string; score: number }[]
  total: number
  comment: string
  at: string
}

export interface ContestFileRef {
  id: string
  role: string
  name: string
  mime: string
  size: number
}

export interface ContestSubmissionDoc {
  id: string
  contest_id: string
  entry_id: string
  user_id: string
  /** Task id ('_' for single-task formats). */
  task_id: string
  status: SubmissionStatus
  /** Ranking value for this submission (null until scored). */
  score: number | null
  /** Datathon private-split score (shown after release). */
  private_score: number | null
  /** Short public feedback (e.g. "7 of 10 tests passed"). */
  feedback: string
  /** Format details safe to show the owner (lengths, sample results, metric). */
  detail: Record<string, unknown>
  /** What was submitted (code, prompt, PR URL, text…). Never shown to other entrants. */
  payload: Record<string, unknown>
  files: ContestFileRef[]
  judge_scores: JudgeScore[]
  created_at: string
}

export interface StandingRow {
  entry_id: string
  name: string
  kind: 'user' | 'team'
  member_ids: string[]
  total: number
  /** Per task best (or summed) score. */
  tasks: Record<string, number>
  solved: number
  attempts: number
  /** When the entry reached its total (tie-break: earliest). */
  reached_at: string | null
  rank: number | null
  tied: boolean
}

export interface ContestSettings {
  /** Platform-wide prompt-a-thon model runs per day (all contests). */
  ai_daily_runs: number
  /** Platform-wide prompt-a-thon spend per calendar month (USD). */
  ai_monthly_cost_usd: number
  /** Estimated price per 1,000 tokens (USD) used for the spend caps. */
  ai_cost_per_1k_tokens_usd: number
}

export const DEFAULT_CONTEST_SETTINGS: ContestSettings = {
  ai_daily_runs: 300,
  ai_monthly_cost_usd: 10,
  ai_cost_per_1k_tokens_usd: 0.002,
}

/** What participants and the public receive (no admin-only fields, no secrets). */
export type PublicContestView = Omit<ContestDoc, 'config_errors' | 'created_by' | 'judging'> & { judging: { rubric: ContestRubricCriterion[] } }

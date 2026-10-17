/**
 * QR / Hackathon data model + repository helpers.
 *
 * Collections introduced in Phase 10:
 *   - id_card_tokens   : signed-URL tokens for personal ID cards
 *   - hackathons       : event definitions (name, capacity, timing)
 *   - hackathon_teams  : per-team rows with embedded QR token + scoring
 *
 * IDs are UUIDv4 strings. Tokens are 32 base64url chars (`crypto.randomBytes(24)`).
 * Timestamps are ISO-8601 strings stored as strings (not BSON Date) so the
 * API layer can ship them straight to JSON without conversion.
 */
import { randomBytes } from 'node:crypto'
import type { Collection } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'
import { newId, nowIso } from './ids'

export { newId, nowIso }

/** url-safe random token used inside signed QR URLs. */
export function newToken(): string {
  return randomBytes(24)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export type IdCardRoleVariant = string

export interface IdCardTokenDoc {
  id: string
  token: string
  user_id: string
  /** Role-variant used when rendering the dashboard preview after scan. */
  role_variant: IdCardRoleVariant
  /** Optional metadata cached at issue time — refreshed lazily on scan. */
  snapshot?: {
    name?: string
    email?: string
    role?: string
  }
  revoked_at?: string | null
  created_at: string
}

export interface HackathonTask {
  problem_slug: string
  problem_title: string
  points: number
  difficulty: string
  required: boolean
  order: number
  /** Per-problem time limit in minutes (only for speed_contest type). Overrides event default. */
  time_limit_minutes?: number
}

export interface HackathonRule {
  type: 'scoring' | 'submission' | 'conduct' | 'general'
  title: string
  description: string
}

export interface RubricCriterion {
  name: string
  weight: number // percentage (0-100), all weights should sum to 100
}

export interface SponsorTrack {
  name: string
  prize: string
  description?: string
}

export interface HackathonFeatures {
  /** Team formation enabled */
  team_formation: boolean
  /** Claims system (first-come lock on problems) */
  claims_system: boolean
  /** Demo video requirement: 'required' | 'optional' | 'disabled' */
  demo_video: 'required' | 'optional' | 'disabled'
  /** Live URL requirement: 'required' | 'optional' | 'disabled' */
  live_url: 'required' | 'optional' | 'disabled'
  /** Code upload in editor enabled */
  code_upload: boolean
  /** Judging rubrics enabled */
  judging_rubrics: boolean
  /** Rubric criteria (only used when judging_rubrics is true) */
  rubric_criteria: RubricCriterion[]
  /** Leaderboard visibility */
  leaderboard_visibility: 'public' | 'private' | 'after_event'
  /** Project showcase after event ends */
  project_showcase: boolean
  /** Forum for Q&A during event */
  forum: boolean
  /** Proctoring (cheating detection) */
  proctoring: boolean
  /** Certificates for participants */
  certificates: boolean
  /** Sponsor prize tracks */
  sponsor_tracks: SponsorTrack[]
}

export const DEFAULT_FEATURES: HackathonFeatures = {
  team_formation: true,
  claims_system: false,
  demo_video: 'optional',
  live_url: 'optional',
  code_upload: true,
  judging_rubrics: false,
  rubric_criteria: [
    { name: 'Innovation', weight: 25 },
    { name: 'Technical Complexity', weight: 25 },
    { name: 'Design/UX', weight: 20 },
    { name: 'Impact', weight: 20 },
    { name: 'Completeness', weight: 10 },
  ],
  leaderboard_visibility: 'public',
  project_showcase: true,
  forum: false,
  proctoring: false,
  certificates: true,
  sponsor_tracks: [],
}

export interface HackathonDoc {
  id: string
  name: string
  slug: string
  description?: string
  /** Total teams allowed. Used as the registration cap. */
  num_teams: number
  /** Maximum members per team. */
  max_per_team: number
  /** Event duration limit (minutes). starts_at + timeout = ends_at. */
  timeout_minutes: number
  starts_at: string
  ends_at: string
  status: 'draft' | 'open' | 'live' | 'closed'
  /** Event type: hackathon (all problems concurrently) or speed_contest (per-problem timers). Default: hackathon. */
  event_type?: 'hackathon' | 'speed_contest'
  /** Default per-problem time limit in minutes for speed_contests. Default: 30. */
  per_problem_time_minutes?: number
  /** Limit the number of problems a team is allowed to solve. If undefined, no limit. */
  solve_limit?: number
  /** Grace period in minutes after event ends. Submissions allowed during this window. */
  grace_period_minutes?: number
  /** Allow late submissions during grace period */
  allow_late_submissions?: boolean
  /** Assigned problems for this event */
  tasks: HackathonTask[]
  /** Event-specific rules */
  rules: HackathonRule[]
  /** Scoring config */
  scoring: {
    auto_grade: boolean
    points_per_problem: number
    bonus_time: number
    penalty_per_attempt: number
  }
  /** Results visibility */
  results_released: boolean
  released_at?: string
  /** User IDs of assigned judges */
  judges?: string[]
  /** Feature flags for this event */
  features: HackathonFeatures
  /** Branding */
  banner_url?: string
  color_theme?: string
  /** Certificate template */
  cert_template?: 'classic' | 'modern' | 'minimal' | 'professional' | 'corporate' | 'academic'
  tenant_id?: string | null
  /** Judging configuration (lib/hackathons/judge-config). */
  judging_config?: unknown
  created_by: string
  created_at: string
  updated_at: string
}

export interface HackathonAchievement {
  id: string
  name: string
  awarded_at: string
}

export interface HackathonTeamDoc {
  id: string
  hackathon_id: string
  name: string
  slug: string
  qr_token: string
  members: Array<{ user_id: string; name: string; role: 'captain' | 'member' }>
  xp: number
  level: number
  achievements: HackathonAchievement[]
  /** Slugs of problems the team has explicitly locked in for solving, up to the solve_limit */
  selected_problems?: string[]
  submissions: number
  created_at: string
  updated_at: string
}

async function db() {
  return getMongoDb()
}

export async function idCardTokens(): Promise<Collection<IdCardTokenDoc>> {
  return (await db()).collection<IdCardTokenDoc>('id_card_tokens')
}
export async function hackathons(): Promise<Collection<HackathonDoc>> {
  return (await db()).collection<HackathonDoc>('hackathons')
}
export async function hackathonTeams(): Promise<Collection<HackathonTeamDoc>> {
  return (await db()).collection<HackathonTeamDoc>('hackathon_teams')
}

export interface HackathonSubmissionDoc {
  id: string
  hackathon_id: string
  team_id: string
  problem_slug: string
  repo_url?: string
  commit_sha?: string
  code?: string
  video_url?: string
  live_url?: string
  comment?: string
  score: number | null
  max_score: number
  /** Canonical: submitted → under_review → scored → released / rejected (lib/hackathons/submission-state). Legacy docs may hold pending / review_completed / accepted. */
  status: 'submitted' | 'under_review' | 'scored' | 'rejected' | 'released' | 'pending' | 'review_completed' | 'accepted'
  /** Auto-grade (all tests, hidden included) in task points. */
  auto_graded?: boolean
  auto_score?: number | null
  language?: string
  /** Set at release: blended judged score (0–100) and that scaled to task points. */
  final_score?: number | null
  final_points?: number | null
  human_avg?: number | null
  xp_awarded?: boolean
  updated_at?: string
  feedback?: string
  /** Rejection details */
  rejection_reason?: string
  rejected_at?: string
  rejected_by?: string
  /** Status history for audit trail */
  status_history?: Array<{
    status: string
    changed_by: string
    changed_at: string
    reason?: string
  }>
  /** Per-judge scoring records */
  scores?: Array<{ judge_id: string; score: number; feedback: string; created_at: string }>
  /** Rubric-based scores from judges (when hackathon.features.judging_rubrics is true) */
  rubric_scores?: Array<{
    judge_id: string
    criteria: Array<{ name: string; score: number }>
    total_score: number
    feedback: string
    created_at: string
  }>
  submitted_at: string
  reviewed_at?: string
  created_at: string
}

export async function hackathonSubmissions(): Promise<Collection<HackathonSubmissionDoc>> {
  return (await db()).collection<HackathonSubmissionDoc>('hackathon_submissions')
}

export interface HackathonClaimDoc {
  hackathon_id: string
  /** Claims are team-scoped: a teammate locks a problem so others on the team don't duplicate work. */
  team_id: string
  problem_slug: string
  user_id: string
  user_name: string
  claimed_at: string
  /** BSON Date so the TTL index actually expires it (older docs hold an ISO string). */
  expires_at: Date | string
}

let claimIndexesReady = false

export async function hackathonClaims(): Promise<Collection<HackathonClaimDoc>> {
  const col = (await db()).collection<HackathonClaimDoc>('hackathon_claims')
  if (claimIndexesReady) return col
  try {
    // The old unique index was event-wide (hackathon, problem) while claims
    // are upserted per team, so a second team's claim hit E11000. Replace it.
    const existing = await col.indexes().catch(() => [])
    const old = existing.find((i) => i.name === 'hackathon_claims_unique')
    if (old && !(old.key && 'team_id' in old.key)) await col.dropIndex('hackathon_claims_unique').catch(() => {})
    await col.createIndex(
      { hackathon_id: 1, team_id: 1, problem_slug: 1 },
      { unique: true, name: 'hackathon_claims_unique' },
    )
    await col.createIndex(
      { expires_at: 1 },
      { expireAfterSeconds: 0, name: 'hackathon_claims_ttl' },
    )
    claimIndexesReady = true
  } catch { /* index may already exist */ }
  return col
}

export interface HackathonInviteDoc {
  id: string
  hackathon_id: string
  team_id: string
  email: string
  token: string
  invited_by_user_id: string
  invited_by_name: string
  accepted_at?: string
  accepted_by_user_id?: string
  expires_at: string
  created_at: string
}

export async function hackathonInvites(): Promise<Collection<HackathonInviteDoc>> {
  const col = (await db()).collection<HackathonInviteDoc>('hackathon_invites')
  try {
    await col.createIndex({ token: 1 }, { unique: true, name: 'hackathon_invites_token' })
    await col.createIndex({ hackathon_id: 1, team_id: 1 }, { name: 'hackathon_invites_event_team' })
    await col.createIndex({ email: 1 }, { name: 'hackathon_invites_email' })
    await col.createIndex(
      { expires_at: 1 },
      { expireAfterSeconds: 0, name: 'hackathon_invites_ttl' },
    )
  } catch { /* index may already exist */ }
  return col
}

export type HackathonActivityType =
  | 'problem_started'
  | 'problem_claimed'
  | 'problem_released'
  | 'problem_submitted'
  | 'problem_viewed'
  | 'leaderboard_viewed'
  | 'workspace_entered'
  | 'workspace_left'

export interface HackathonActivityDoc {
  id: string
  hackathon_id: string
  team_id: string
  user_id: string
  type: HackathonActivityType
  problem_slug?: string
  meta?: Record<string, unknown>
  created_at: string
}

export async function hackathonActivity(): Promise<Collection<HackathonActivityDoc>> {
  const col = (await db()).collection<HackathonActivityDoc>('hackathon_activity')
  try {
    await col.createIndex({ hackathon_id: 1, team_id: 1 }, { name: 'hackathon_activity_team' })
    await col.createIndex({ hackathon_id: 1, problem_slug: 1 }, { name: 'hackathon_activity_problem' })
    await col.createIndex({ hackathon_id: 1, user_id: 1 }, { name: 'hackathon_activity_user' })
  } catch { /* index may already exist */ }
  return col
}

export type ProctorEventType =
  | 'tab_blur'
  | 'tab_focus'
  | 'copy_attempt'
  | 'paste_attempt'
  | 'right_click'
  | 'fullscreen_exit'
  | 'idle_warning'
  | 'suspicious_activity'

export interface HackathonProctorEventDoc {
  id: string
  hackathon_id: string
  team_id: string
  user_id: string
  type: ProctorEventType
  problem_slug?: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  meta?: {
    duration_ms?: number
    attempt_count?: number
    details?: string
  }
  created_at: string
}

export async function hackathonProctorEvents(): Promise<Collection<HackathonProctorEventDoc>> {
  const col = (await db()).collection<HackathonProctorEventDoc>('hackathon_proctor_events')
  try {
    await col.createIndex({ hackathon_id: 1, team_id: 1 }, { name: 'proctor_team' })
    await col.createIndex({ hackathon_id: 1, user_id: 1 }, { name: 'proctor_user' })
    await col.createIndex({ hackathon_id: 1, severity: 1 }, { name: 'proctor_severity' })
  } catch { /* index may already exist */ }
  return col
}

/**
 * Map a Better Auth role to the dashboard variant used on the public scan
 * page. Unknown roles default to `user`.
 */
export function roleToVariant(role?: string | null): IdCardRoleVariant {
  switch ((role || '').toLowerCase()) {
    case 'superadmin':
    case 'admin':
      return 'admin'
    case 'tenant_admin':
    case 'tenant':
      return 'tenant'
    default:
      return 'user'
  }
}

/**
 * Get the user's id-card token, creating it lazily on first request.
 * Idempotent: a single `(user_id, role_variant)` row exists per user.
 */
export async function getOrCreateIdCardToken(
  userId: string,
  roleVariant: IdCardRoleVariant,
  snapshot?: IdCardTokenDoc['snapshot'],
): Promise<IdCardTokenDoc> {
  const col = await idCardTokens()
  // Active = no `revoked_at` set. Revoked stubs are intentionally left
  // around so old QR scans resolve to 410.
  const existing = await col.findOne({
    user_id: userId,
    role_variant: roleVariant,
    $or: [{ revoked_at: null }, { revoked_at: { $exists: false } }],
  })
  if (existing) {
    // Refresh snapshot opportunistically (name/email might have changed).
    if (snapshot) {
      await col.updateOne(
        { id: existing.id },
        { $set: { snapshot } },
      )
      return { ...existing, snapshot }
    }
    return existing
  }
  const doc: IdCardTokenDoc = {
    id: newId(),
    token: newToken(),
    user_id: userId,
    role_variant: roleVariant,
    snapshot: snapshot ?? {},
    revoked_at: null,
    created_at: nowIso(),
  }
  await col.insertOne(doc)
  return doc
}

/** Level math — 1 level per 100 XP, matches `lib/leaderboard-utils.ts` xpToLevel. */
export function xpToLevel(xp: number): number {
  if (xp <= 0) return 1
  return Math.max(1, Math.floor(xp / 100) + 1)
}

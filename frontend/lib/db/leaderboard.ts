/**
 * XP & Leaderboard repository (MongoDB-native).
 *
 * Collections
 *   - xp_events                : per-award log; one document per XP grant.
 *   - github_webhook_events    : raw webhook payloads (audit trail).
 *   - github_webhook_scan_queue: pending push events to scan.
 *   - workflows                : admin-authored automation workflows.
 *
 * XP economy (kept in code so admins can tune without a DB migration):
 *   - easy   ->  10 XP
 *   - medium ->  25 XP
 *   - hard   ->  50 XP
 *   - First-blood bonus: +25 XP (first user to get an `accepted` submission
 *     on a given problem). Tracked by checking submissions collection.
 */
import { randomUUID } from 'node:crypto'
import type { Collection } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'

export const newId = (): string => randomUUID()
export const nowIso = (): string => new Date().toISOString()

export type Difficulty = 'easy' | 'medium' | 'hard'

export const DIFFICULTY_XP: Record<Difficulty, number> = {
  easy: 10,
  medium: 25,
  hard: 50,
}
export const FIRST_BLOOD_BONUS = 25

// XP rewards for non-problem activities (kept in code for easy tuning).
export const EXAM_PASS_XP = 50
export const CERT_PASS_XP = 100
export const CODEATHON_ATTEND_XP = 20
export const CHALLENGE_COMPLETE_XP = 15

export type XpReason =
  | 'submission_accepted'
  | 'first_blood'
  | 'daily_login'
  | 'admin_grant'
  | 'workflow_reward'
  | 'hackathon_score'
  | 'exam_passed'
  | 'certification_passed'
  | 'codeathon_attended'
  | 'challenge_completed'

export interface XpEventDoc {
  id: string
  user_id: string
  amount: number
  reason: XpReason
  problem_id?: string | null
  submission_id?: string | null
  metadata?: Record<string, unknown>
  created_at: string
}

export interface GithubWebhookEventDoc {
  id: string
  delivery_id: string | null
  event_type: string
  action: string | null
  repository_full_name: string | null
  payload: Record<string, unknown>
  created_at: string
}

export interface GithubScanQueueDoc {
  id: string
  delivery_id: string
  repository_full_name: string
  owner_login: string | null
  ref: string
  before_commit_sha: string
  head_commit_sha: string
  /** 'push' (default) or 'pull_request' — added in Phase 8 for PR-comment posting. */
  event_type?: 'push' | 'pull_request'
  /** Populated when `event_type === 'pull_request'`. */
  pull_request_number?: number
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  attempts: number
  last_error?: string | null
  scan_id?: string | null
  /** Set after a comment is posted to the PR. */
  pr_comment_url?: string | null
  created_at: string
  updated_at: string
  locked_at?: string | null
}

export interface WorkflowNode {
  id: string
  type: string // 'trigger' | 'http' | 'ai' | 'mongo' | 'condition' | ...
  label?: string
  config?: Record<string, unknown>
}

export interface WorkflowEdge {
  from: string
  to: string
  condition?: string
}

export interface WorkflowDoc {
  id: string
  name: string
  description?: string
  trigger: 'manual' | 'schedule' | 'webhook'
  /** Cron expression (5-field standard) when `trigger === 'schedule'`. */
  cron_expression?: string
  is_active: boolean
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  created_by: string
  created_at: string
  updated_at: string
}

export interface WorkflowRunDoc {
  id: string
  workflow_id: string
  user_id: string
  status: 'success' | 'failed' | 'partial'
  started_at: string
  finished_at: string
  steps: Array<{
    node_id: string
    label: string
    ok: boolean
    output?: unknown
    error?: string
    duration_ms: number
  }>
  duration_ms: number
}

export async function getXpRewards(): Promise<Record<string, number>> {
  try {
    const { getMongoDb } = await import('@/lib/mongodb')
    const db = await getMongoDb()
    const doc = await db.collection('platform_settings').findOne({ key: 'gamification' })
    const saved = doc?.value as any
    return {
      easy: saved?.xp_rewards?.easy ?? DIFFICULTY_XP.easy,
      medium: saved?.xp_rewards?.medium ?? DIFFICULTY_XP.medium,
      hard: saved?.xp_rewards?.hard ?? DIFFICULTY_XP.hard,
      first_blood: saved?.xp_rewards?.first_blood ?? FIRST_BLOOD_BONUS,
      exam_pass: saved?.xp_rewards?.exam_pass ?? EXAM_PASS_XP,
      cert_pass: saved?.xp_rewards?.cert_pass ?? CERT_PASS_XP,
      codeathon: saved?.xp_rewards?.codeathon ?? CODEATHON_ATTEND_XP,
      hackathon: saved?.xp_rewards?.hackathon ?? 100,
    }
  } catch {
    return {
      easy: DIFFICULTY_XP.easy,
      medium: DIFFICULTY_XP.medium,
      hard: DIFFICULTY_XP.hard,
      first_blood: FIRST_BLOOD_BONUS,
      exam_pass: EXAM_PASS_XP,
      cert_pass: CERT_PASS_XP,
      codeathon: CODEATHON_ATTEND_XP,
      hackathon: 100,
    }
  }
}

async function db() {
  return getMongoDb()
}

export async function xpEvents(): Promise<Collection<XpEventDoc>> {
  return (await db()).collection<XpEventDoc>('xp_events')
}
export async function githubWebhookEvents(): Promise<Collection<GithubWebhookEventDoc>> {
  return (await db()).collection<GithubWebhookEventDoc>('github_webhook_events')
}
export async function githubWebhookScanQueue(): Promise<Collection<GithubScanQueueDoc>> {
  return (await db()).collection<GithubScanQueueDoc>('github_webhook_scan_queue')
}
export async function workflows(): Promise<Collection<WorkflowDoc>> {
  return (await db()).collection<WorkflowDoc>('workflows')
}
export async function workflowRuns(): Promise<Collection<WorkflowRunDoc>> {
  return (await db()).collection<WorkflowRunDoc>('workflow_runs')
}

/**
 * Award XP to a user. Idempotent: a unique `(user_id, problem_id, reason)`
 * key prevents double-awarding for the same problem.
 *
 * Returns the inserted event id, or null if a duplicate award was attempted.
 */
export async function awardXp(args: {
  userId: string
  amount: number
  reason: XpReason
  problemId?: string | null
  submissionId?: string | null
  metadata?: Record<string, unknown>
}): Promise<string | null> {
  if (args.amount <= 0) return null
  const col = await xpEvents()

  // Idempotency for per-problem awards (accepted / first-blood)
  if (args.problemId && (args.reason === 'submission_accepted' || args.reason === 'first_blood')) {
    const existing = await col.findOne({
      user_id: args.userId,
      problem_id: args.problemId,
      reason: args.reason,
    })
    if (existing) return null
  }

  // Idempotency for per-submission awards (exams, certifications, hackathons…)
  if (args.submissionId) {
    const existing = await col.findOne({
      user_id: args.userId,
      submission_id: args.submissionId,
      reason: args.reason,
    })
    if (existing) return null
  }

  const doc: XpEventDoc = {
    id: newId(),
    user_id: args.userId,
    amount: args.amount,
    reason: args.reason,
    problem_id: args.problemId ?? null,
    submission_id: args.submissionId ?? null,
    metadata: args.metadata ?? {},
    created_at: nowIso(),
  }
  await col.insertOne(doc)
  return doc.id
}

/**
 * Compute a user's total XP from `xp_events` aggregation.
 */
export async function getUserXp(userId: string): Promise<number> {
  const col = await xpEvents()
  const agg = await col
    .aggregate<{ _id: null; total: number }>([
      { $match: { user_id: userId } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ])
    .toArray()
  return agg[0]?.total ?? 0
}

/**
 * Integrity collections + indexes (server only). Indexes are built once per
 * process on first use (createIndex is idempotent).
 *
 *   integrity_settings   one doc per test / contest (author's opt-in config)
 *   integrity_attempts   one doc per attempt: consent, counters, review status
 *   integrity_events     the timeline (TTL on purge_at)
 *   integrity_snapshots  camera stills taken on violations (bytes via lib/storage; swept on purge_at)
 *   integrity_reports    similarity clusters + AI-written signals per test / contest (job output + lock)
 *   integrity_global     platform caps for the optional classifier (one doc, id 'global')
 *   integrity_ai_usage   classifier calls / spend per UTC day
 */
import 'server-only'
import { createHash } from 'node:crypto'
import type { Collection, Db } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'
import { logger } from '@/lib/logger'
import type { IntegritySettings, ReviewStatus, TargetKind } from './types'
import type { SimilarPair } from './code-similarity'
import type { AiSignal } from './ai-signals'

let indexes: Promise<void> | null = null

async function ensureIndexes(db: Db): Promise<void> {
  if (!indexes) {
    indexes = (async () => {
      await Promise.all([
        db.collection('integrity_settings').createIndex({ target_kind: 1, target_id: 1 }, { unique: true, name: 'integrity_settings_target' }),
        db.collection('integrity_settings').createIndex({ enabled: 1, 'similarity.enabled': 1 }, { name: 'integrity_settings_enabled' }),
        db.collection('integrity_attempts').createIndex({ id: 1 }, { unique: true, name: 'integrity_attempts_id' }),
        db.collection('integrity_attempts').createIndex({ target_kind: 1, target_id: 1, last_at: -1 }, { name: 'integrity_attempts_target' }),
        db.collection('integrity_attempts').createIndex({ purge_at: 1 }, { expireAfterSeconds: 0, name: 'integrity_attempts_ttl' }),
        db.collection('integrity_events').createIndex({ attempt_id: 1, at: 1 }, { name: 'integrity_events_attempt' }),
        db.collection('integrity_events').createIndex({ target_kind: 1, target_id: 1, type: 1 }, { name: 'integrity_events_target_type' }),
        db.collection('integrity_events').createIndex({ purge_at: 1 }, { expireAfterSeconds: 0, name: 'integrity_events_ttl' }),
        db.collection('integrity_snapshots').createIndex({ id: 1 }, { unique: true, name: 'integrity_snapshots_id' }),
        db.collection('integrity_snapshots').createIndex({ attempt_id: 1, at: 1 }, { name: 'integrity_snapshots_attempt' }),
        db.collection('integrity_snapshots').createIndex({ purge_at: 1 }, { name: 'integrity_snapshots_purge' }),
        db.collection('integrity_reports').createIndex({ id: 1 }, { unique: true, name: 'integrity_reports_id' }),
        db.collection('integrity_ai_usage').createIndex({ day: 1 }, { unique: true, name: 'integrity_ai_usage_day' }),
      ])
    })().catch((e) => {
      indexes = null
      logger.error('[integrity] index build failed', (e as Error).message)
    })
  }
  await indexes
}

async function col<T extends object>(name: string): Promise<Collection<T>> {
  const db = await getMongoDb()
  await ensureIndexes(db)
  return db.collection<T>(name)
}

export interface SettingsDoc extends IntegritySettings {
  target_kind: TargetKind
  target_id: string
  tenant_id: string | null
  updated_by: string
  updated_at: string
}

export interface AttemptDoc {
  id: string
  target_kind: TargetKind
  target_id: string
  tenant_id: string | null
  user_id: string
  /** Exams: attempt number; contests: 1. */
  attempt_no: number
  consented_at: string | null
  first_at: string
  last_at: string
  /** Per-attempt salted hash of the last IP (never the IP itself). */
  last_ip_hash: string | null
  counts: Record<string, number>
  snapshot_count: number
  review: { status: ReviewStatus; note: string; by: string | null; at: string | null }
  purge_at: Date
}

export interface EventDoc {
  attempt_id: string
  target_kind: TargetKind
  target_id: string
  user_id: string
  type: string
  /** Epoch ms (clamped to the attempt window). */
  at: number
  q: string | null
  data: Record<string, unknown>
  snapshot_id: string | null
  received_at: Date
  purge_at: Date
}

export interface SnapshotDoc {
  id: string
  attempt_id: string
  target_kind: TargetKind
  target_id: string
  tenant_id: string | null
  user_id: string
  reason: string
  at: number
  size: number
  storage: 'db' | 's3'
  s3_key?: string
  data?: Buffer
  created_at: Date
  purge_at: Date
}

export interface ClusterReview { status: ReviewStatus; note: string; by: string | null; at: string | null }

export interface ReportCluster {
  id: string
  members: Array<{ submission_id: string; user_id: string; name: string }>
  max_score: number
  pairs: SimilarPair[]
  review: ClusterReview
}

export interface ReportQuestion {
  question_id: string
  title: string
  language: string
  submissions: number
  clusters: ReportCluster[]
}

export interface ReportAiRow {
  user_id: string
  name: string
  question_id: string
  submission_id: string
  signals: AiSignal[]
  combined: number
  level: 'none' | 'low' | 'medium' | 'high'
  classifier: number | null
}

export interface ReportDoc {
  id: string
  target_kind: TargetKind
  target_id: string
  tenant_id: string | null
  status: 'idle' | 'running' | 'done' | 'failed'
  lease_until: Date | null
  started_at: string | null
  finished_at: string | null
  error: string | null
  trigger: 'cron' | 'manual' | null
  questions: ReportQuestion[]
  ai: ReportAiRow[]
  classifier_calls: number
  /** Notes for reviewers (caps reached, limits applied). */
  notes: string[]
}

export interface GlobalDoc {
  id: 'global'
  classifier_daily_cap: number
  monthly_cost_cap_usd: number
  cost_per_call_usd: number
  updated_at?: string
  updated_by?: string
}

export interface AiUsageDoc { day: string; month: string; calls: number; cost_usd: number }

export const settingsCol = () => col<SettingsDoc>('integrity_settings')
export const attemptsCol = () => col<AttemptDoc>('integrity_attempts')
export const eventsCol = () => col<EventDoc>('integrity_events')
export const snapshotsCol = () => col<SnapshotDoc>('integrity_snapshots')
export const reportsCol = () => col<ReportDoc>('integrity_reports')
export const globalCol = () => col<GlobalDoc>('integrity_global')
export const aiUsageCol = () => col<AiUsageDoc>('integrity_ai_usage')

/** Stable, URL-safe attempt id (no user id or test id readable from it). */
export function attemptKey(kind: TargetKind, targetId: string, userId: string, attemptNo: number): string {
  return `ia_${createHash('sha256').update(`${kind}:${targetId}:${userId}:${attemptNo}`).digest('hex').slice(0, 32)}`
}

/** Per-attempt salted IP hash: detects a change within one attempt, links nothing across attempts. */
export function ipHash(attemptId: string, ip: string): string | null {
  if (!ip) return null
  return createHash('sha256').update(`integrity-ip:${attemptId}:${ip}`).digest('hex').slice(0, 24)
}

export const reportId = (kind: TargetKind, targetId: string) => `${kind}:${targetId}`

export function stripId<T extends object>(doc: T | null): T | null {
  if (!doc) return null
  const { _id, ...rest } = doc as T & { _id?: unknown }
  void _id
  return rest as T
}

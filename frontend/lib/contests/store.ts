/**
 * Contest collections + indexes (server only). Indexes are created once per
 * process on first use (createIndex is idempotent).
 *
 *   contests             one doc per contest (public config only)
 *   contest_secrets      hidden tests, flag hashes, labels, eval sets (never sent to people)
 *   contest_entries      a person or a team taking part
 *   contest_submissions  every submission with its score
 *   contest_files        uploaded decks / videos / diagrams / predictions (bytes)
 *   contest_usage        prompt-a-thon model runs (spend caps)
 *   contest_settings     platform caps (one doc, id 'global')
 */
import 'server-only'
import type { Collection, Db } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'
import { logger } from '@/lib/logger'
import type { ContestDoc, ContestEntryDoc, ContestSecretDoc, ContestSubmissionDoc, StandingRow } from './types'

let indexes: Promise<void> | null = null

async function ensureIndexes(db: Db): Promise<void> {
  if (!indexes) {
    indexes = (async () => {
      await Promise.all([
        db.collection('contests').createIndex({ id: 1 }, { unique: true }),
        db.collection('contests').createIndex({ slug: 1 }, { unique: true }),
        db.collection('contests').createIndex({ status: 1, visibility: 1, 'schedule.ends_at': 1 }),
        db.collection('contests').createIndex({ tenant_id: 1, created_at: -1 }),
        db.collection('contest_secrets').createIndex({ contest_id: 1 }, { unique: true }),
        db.collection('contest_entries').createIndex({ id: 1 }, { unique: true }),
        db.collection('contest_entries').createIndex({ contest_id: 1, member_ids: 1 }),
        db.collection('contest_entries').createIndex({ contest_id: 1, join_code: 1 }, { sparse: true }),
        db.collection('contest_submissions').createIndex({ id: 1 }, { unique: true }),
        db.collection('contest_submissions').createIndex({ contest_id: 1, entry_id: 1, created_at: -1 }),
        db.collection('contest_submissions').createIndex({ contest_id: 1, created_at: 1 }),
        // One open-source PR counts once per contest.
        db.collection('contest_submissions').createIndex({ contest_id: 1, 'payload.pr_key': 1 }, { unique: true, partialFilterExpression: { 'payload.pr_key': { $type: 'string' } } }),
        db.collection('contest_files').createIndex({ id: 1 }, { unique: true }),
        db.collection('contest_files').createIndex({ contest_id: 1, entry_id: 1 }),
        db.collection('contest_usage').createIndex({ contest_id: 1, user_id: 1 }),
        db.collection('contest_usage').createIndex({ at: 1 }),
        db.collection('contest_results').createIndex({ contest_id: 1 }, { unique: true }),
      ])
    })().catch((e) => {
      indexes = null
      logger.error('[contests] index build failed', (e as Error).message)
    })
  }
  await indexes
}

async function col<T extends object>(name: string): Promise<Collection<T>> {
  const db = await getMongoDb()
  await ensureIndexes(db)
  return db.collection<T>(name)
}

export const contestsCol = () => col<ContestDoc>('contests')
export const secretsCol = () => col<ContestSecretDoc>('contest_secrets')
export const entriesCol = () => col<ContestEntryDoc>('contest_entries')
export const submissionsCol = () => col<ContestSubmissionDoc>('contest_submissions')

export interface ContestFileDoc {
  id: string
  contest_id: string
  entry_id: string
  user_id: string
  role: string
  name: string
  mime: string
  size: number
  storage: 'db' | 's3'
  data?: Buffer
  s3_key?: string
  created_at: string
}
export const filesCol = () => col<ContestFileDoc>('contest_files')

export interface ContestUsageDoc {
  contest_id: string
  user_id: string
  task_id: string
  tokens: number
  cost_usd: number
  at: string
}
export const usageCol = () => col<ContestUsageDoc>('contest_usage')
export const settingsCol = () => col<{ id: string; [k: string]: unknown }>('contest_settings')

/** Frozen final board written once at release (first write wins). */
export interface ContestResultsDoc {
  contest_id: string
  released_at: string
  released_by: string
  ranked_count: number
  standings: StandingRow[]
}
export const resultsCol = () => col<ContestResultsDoc>('contest_results')

/** Strip Mongo's _id before a doc leaves the server. */
export function clean<T extends object>(doc: T | null): T | null {
  if (!doc) return null
  const { _id, ...rest } = doc as T & { _id?: unknown }
  void _id
  return rest as T
}

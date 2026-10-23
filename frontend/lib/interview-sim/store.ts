/**
 * Mock-interview persistence (server only).
 *
 * Collections:
 *   interview_sim_sessions    one row per session (owner, config, plan, turns, report)
 *   interview_sim_settings    one doc: admin caps (lib/interview-sim/types DEFAULT_SIM_SETTINGS)
 *   interview_sim_usage       one row per month: estimated AI spend (the monthly cap)
 *   interview_sim_recordings  optional session recordings (S3 key, or bytes when
 *                             object storage is off) with an expiry (retention)
 */
import 'server-only'
import { randomBytes } from 'crypto'
import type { Collection, Db } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'
import { logger } from '@/lib/logger'
import { nowIso } from '@/lib/db/ids'
import { mergeSimSettings, type InterviewSimSettings, type SimSessionDoc } from './types'

const SETTINGS_ID = 'settings'

export interface SimRecordingDoc {
  id: string
  session_id: string
  user_id: string
  storage: 'db' | 's3'
  s3_key?: string
  data?: Buffer
  size: number
  mime: string
  duration_s?: number
  scan_status?: string
  created_at: string
  expires_at: Date
  /** Mongo TTL backstop for inline rows (the sweep deletes first). */
  purge_at?: Date
}

let indexed: Promise<unknown> | null = null
async function db(): Promise<Db> {
  const d = await getMongoDb()
  if (!indexed) {
    indexed = Promise.all([
      d.collection('interview_sim_sessions').createIndex({ id: 1 }, { unique: true }),
      d.collection('interview_sim_sessions').createIndex({ user_id: 1, created_at: -1 }),
      d.collection('interview_sim_sessions').createIndex({ user_id: 1, day: 1 }),
      d.collection('interview_sim_sessions').createIndex({ share_token: 1 }, { unique: true, partialFilterExpression: { share_token: { $type: 'string' } } }),
      d.collection('interview_sim_settings').createIndex({ id: 1 }, { unique: true }),
      d.collection('interview_sim_usage').createIndex({ id: 1 }, { unique: true }),
      d.collection('interview_sim_recordings').createIndex({ id: 1 }, { unique: true }),
      d.collection('interview_sim_recordings').createIndex({ session_id: 1 }, { unique: true }),
      d.collection('interview_sim_recordings').createIndex({ user_id: 1 }),
      d.collection('interview_sim_recordings').createIndex({ expires_at: 1 }),
      d.collection('interview_sim_recordings').createIndex({ purge_at: 1 }, { expireAfterSeconds: 0 }),
    ]).catch((e) => { indexed = null; logger.warn(`[interview-sim] index setup: ${(e as Error).message}`) })
  }
  await indexed
  return d
}

export async function sessions(): Promise<Collection<SimSessionDoc>> {
  return (await db()).collection<SimSessionDoc>('interview_sim_sessions')
}
export async function recordings(): Promise<Collection<SimRecordingDoc>> {
  return (await db()).collection<SimRecordingDoc>('interview_sim_recordings')
}
async function usageCol(): Promise<Collection<{ id: string; cost_usd: number; sessions: number; updated_at: string }>> {
  return (await db()).collection('interview_sim_usage') as never
}

export const dayKey = (d: Date): string => d.toISOString().slice(0, 10)
export const monthKey = (d: Date): string => d.toISOString().slice(0, 7)

// ─── Settings ───────────────────────────────────────────────────────────────

let cached: { at: number; s: InterviewSimSettings } | null = null
export async function getSimSettings(fresh = false): Promise<InterviewSimSettings> {
  if (!fresh && cached && Date.now() - cached.at < 30_000) return cached.s
  const doc = await (await db()).collection('interview_sim_settings').findOne({ id: SETTINGS_ID }, { projection: { _id: 0 } })
  const s = mergeSimSettings(doc)
  cached = { at: Date.now(), s }
  return s
}

export async function updateSimSettings(patch: Partial<InterviewSimSettings>, by: string): Promise<InterviewSimSettings> {
  await (await db()).collection('interview_sim_settings').updateOne({ id: SETTINGS_ID }, { $set: { ...patch, updated_at: nowIso(), updated_by: by } }, { upsert: true })
  cached = null
  return getSimSettings(true)
}

// ─── Usage + caps ───────────────────────────────────────────────────────────

export async function monthSpend(now = new Date()): Promise<{ cost_usd: number; sessions: number }> {
  const doc = await (await usageCol()).findOne({ id: monthKey(now) })
  // Cap source: own ledger or platform-recorded cost, whichever is higher (lib/ai/spend capSpendUsd).
  const { capSpendFor } = await import('@/lib/ai/usage-record')
  return { cost_usd: await capSpendFor(['interview-sim*'], doc?.cost_usd ?? 0, now), sessions: doc?.sessions ?? 0 }
}

export async function recordSpend(costUsd: number, opts: { newSession?: boolean } = {}, now = new Date()): Promise<void> {
  if (!(costUsd > 0) && !opts.newSession) return
  await (await usageCol()).updateOne(
    { id: monthKey(now) },
    { $inc: { cost_usd: Math.max(0, Math.round(costUsd * 1e6) / 1e6), sessions: opts.newSession ? 1 : 0 }, $set: { updated_at: now.toISOString() } },
    { upsert: true },
  )
}

export async function sessionsStartedToday(userId: string, now = new Date()): Promise<number> {
  return (await sessions()).countDocuments({ user_id: userId, day: dayKey(now) })
}

// ─── Sessions ───────────────────────────────────────────────────────────────

export async function getOwnSession(id: string, userId: string): Promise<SimSessionDoc | null> {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null
  return (await sessions()).findOne({ id, user_id: userId }, { projection: { _id: 0 } }) as Promise<SimSessionDoc | null>
}

export async function getSharedSession(token: string): Promise<SimSessionDoc | null> {
  if (!/^[A-Za-z0-9_-]{24,64}$/.test(token)) return null
  return (await sessions()).findOne({ share_token: token, status: 'completed' }, { projection: { _id: 0 } }) as Promise<SimSessionDoc | null>
}

export function newShareToken(): string {
  return randomBytes(24).toString('base64url')
}

export async function listOwnSessions(userId: string, limit = 50): Promise<SimSessionDoc[]> {
  return (await sessions())
    .find({ user_id: userId }, { projection: { _id: 0, turns: 0, plan: 0 } })
    .sort({ created_at: -1 })
    .limit(limit)
    .toArray() as Promise<SimSessionDoc[]>
}

export async function getRecordingMeta(sessionId: string, userId: string): Promise<Pick<SimRecordingDoc, 'id' | 'size' | 'mime' | 'expires_at' | 'storage' | 's3_key'> | null> {
  return (await recordings()).findOne({ session_id: sessionId, user_id: userId }, { projection: { _id: 0, data: 0 } }) as never
}

/** Delete a recording (object first, then the row). True when one was removed. */
export async function deleteRecording(sessionId: string, userId: string): Promise<boolean> {
  const col = await recordings()
  const rec = await col.findOne({ session_id: sessionId, user_id: userId }, { projection: { _id: 0, storage: 1, s3_key: 1, id: 1 } })
  if (!rec) return false
  const { deleteBlobs } = await import('@/lib/storage/blobs')
  const failed = await deleteBlobs([rec])
  if (failed) throw new Error('recording object delete failed')
  await col.deleteOne({ id: rec.id })
  return true
}

/** Delete a session, its recording and its share link. */
export async function deleteSession(id: string, userId: string): Promise<boolean> {
  await deleteRecording(id, userId)
  const r = await (await sessions()).deleteOne({ id, user_id: userId })
  return r.deletedCount === 1
}

/** Retention: remove recordings past their expiry (idempotent; scheduler, once a day). */
export async function sweepExpiredRecordings(now = new Date(), limit = 200): Promise<{ removed: number; failed: number }> {
  const col = await recordings()
  const due = await col.find({ expires_at: { $lte: now } }, { projection: { _id: 0, id: 1, storage: 1, s3_key: 1 } }).limit(limit).toArray()
  if (!due.length) return { removed: 0, failed: 0 }
  const { deleteBlobs } = await import('@/lib/storage/blobs')
  let removed = 0
  let failed = 0
  for (const rec of due) {
    if (await deleteBlobs([rec])) { failed++; continue }
    await col.deleteOne({ id: rec.id })
    removed++
  }
  if (removed || failed) logger.info(`[interview-sim] retention: ${removed} recording(s) removed, ${failed} failed`)
  return { removed, failed }
}

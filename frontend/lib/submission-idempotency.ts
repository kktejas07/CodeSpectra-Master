/**
 * Idempotent practice submissions (offline answers synced by the PWA, or any
 * client that sends `Idempotency-Key`). One key per user is graded once; a
 * repeat gets the stored result back instead of re-running the tests.
 *
 *  submission_idempotency { key: "<user>:<idem>", user_id, state: 'pending'|'done',
 *                           status, body, created_at: Date }
 *  unique(key), TTL 7 days on created_at.
 *
 * Server errors (5xx) and rate limits (429) release the key so a retry is graded.
 */
import 'server-only'
import type { Collection } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'

export const IDEMPOTENCY_TTL_SECONDS = 7 * 24 * 60 * 60
/** A claim stuck in "pending" this long (crashed request) may be taken over. */
export const PENDING_STALE_MS = 2 * 60 * 1000

export interface IdempotencyDoc {
  key: string
  user_id: string
  state: 'pending' | 'done'
  status?: number
  body?: unknown
  created_at: Date
}

export type Claim =
  | { kind: 'fresh' }
  | { kind: 'replay'; status: number; body: unknown }
  | { kind: 'in_progress' }

/** Accept UUIDs and similar opaque ids only. */
export function parseIdempotencyKey(v: string | null | undefined): string | null {
  const s = (v || '').trim()
  return /^[A-Za-z0-9_-]{16,64}$/.test(s) ? s : null
}

let indexes: Promise<unknown> | null = null
export async function idempotencyCol(): Promise<Collection<IdempotencyDoc>> {
  const col = (await getMongoDb()).collection<IdempotencyDoc>('submission_idempotency')
  if (!indexes) {
    indexes = Promise.all([
      col.createIndex({ key: 1 }, { unique: true, name: 'subm_idem_key' }),
      col.createIndex({ created_at: 1 }, { expireAfterSeconds: IDEMPOTENCY_TTL_SECONDS, name: 'subm_idem_ttl' }),
    ]).catch((e) => { indexes = null; console.error('[idempotency] index build failed:', (e as Error)?.message) })
  }
  await indexes
  return col
}

type Col = Pick<Collection<IdempotencyDoc>, 'insertOne' | 'findOne' | 'updateOne' | 'deleteOne'>

export async function claimIdempotency(col: Col, userId: string, idem: string, now: Date = new Date()): Promise<Claim> {
  const key = `${userId}:${idem}`
  try {
    await col.insertOne({ key, user_id: userId, state: 'pending', created_at: now })
    return { kind: 'fresh' }
  } catch (e) {
    if ((e as { code?: number })?.code !== 11000) throw e
  }
  const doc = await col.findOne({ key })
  if (doc?.state === 'done') return { kind: 'replay', status: doc.status ?? 200, body: doc.body ?? null }
  if (doc && now.getTime() - new Date(doc.created_at).getTime() > PENDING_STALE_MS) {
    // Take over a claim whose request died; only one taker wins the compare-and-set.
    const r = await col.updateOne({ key, state: 'pending', created_at: doc.created_at }, { $set: { created_at: now } })
    if (r.modifiedCount === 1) return { kind: 'fresh' }
  }
  return { kind: 'in_progress' }
}

/** Store the final answer, or release the key when the outcome should be retried. */
export async function settleIdempotency(col: Col, userId: string, idem: string, status: number, body: unknown): Promise<void> {
  const key = `${userId}:${idem}`
  if (status >= 500 || status === 429) {
    await col.deleteOne({ key, state: 'pending' })
    return
  }
  await col.updateOne({ key }, { $set: { state: 'done', status, body } })
}

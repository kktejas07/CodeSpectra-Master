/**
 * WhatsApp practice collections + indexes, settings, and the shared
 * "practised today" ledger that feeds the app streak (lib/activity-streak.ts).
 */
import 'server-only'
import type { Collection, Db } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'
import { logger } from '@/lib/logger'
import { normalizePracticeSettings, type PracticeSettings, type WaPracticeDelivery, type WaPracticeEnrollment } from './logic'

let indexed: Promise<void> | null = null

async function db(): Promise<Db> {
  const d = await getMongoDb()
  if (!indexed) {
    indexed = Promise.all([
      d.collection('wa_practice_enrollments').createIndex({ id: 1 }, { unique: true, name: 'wpe_id' }),
      d.collection('wa_practice_enrollments').createIndex({ user_id: 1 }, { unique: true, name: 'wpe_user' }),
      // One learner per phone while pending / active / stopped (revoked rows release the number).
      d.collection('wa_practice_enrollments').createIndex(
        { phone_key: 1 },
        { unique: true, name: 'wpe_phone_live', partialFilterExpression: { status: { $in: ['pending', 'active', 'stopped'] } } },
      ),
      d.collection('wa_practice_enrollments').createIndex({ status: 1, send_hour: 1 }, { name: 'wpe_status_hour' }),
      d.collection('wa_practice_deliveries').createIndex({ id: 1 }, { unique: true, name: 'wpd_id' }),
      d.collection('wa_practice_deliveries').createIndex({ enrollment_id: 1, sent_at: -1 }, { name: 'wpd_enrollment_sent' }),
      d.collection('wa_practice_deliveries').createIndex({ user_id: 1, answered_at: -1 }, { name: 'wpd_user_answered' }),
      // Deliveries are practice history, not records: kept 180 days.
      d.collection('wa_practice_deliveries').createIndex({ sent_date: 1 }, { expireAfterSeconds: 180 * 86_400, name: 'wpd_ttl' }),
      d.collection('practice_activity_days').createIndex({ user_id: 1, day: 1 }, { unique: true, name: 'pad_user_day' }),
    ]).then(() => undefined).catch((e) => {
      indexed = null
      logger.warn(`[wa-practice] index setup: ${(e as Error).message}`)
    })
  }
  return d
}

export const enrollmentsCol = async (): Promise<Collection<WaPracticeEnrollment>> => (await db()).collection<WaPracticeEnrollment>('wa_practice_enrollments')
export const deliveriesCol = async (): Promise<Collection<WaPracticeDelivery & { sent_date: Date }>> => (await db()).collection('wa_practice_deliveries') as never

/** Mark `day` (UTC, same key as accepted submissions) as a practice day for the shared streak. */
export async function recordPracticeDay(userId: string, at: Date, source: string): Promise<void> {
  const day = at.toISOString().slice(0, 10)
  await (await db()).collection('practice_activity_days').updateOne(
    { user_id: userId, day },
    { $setOnInsert: { user_id: userId, day, source, created_at: at.toISOString() } },
    { upsert: true },
  ).catch((e) => { if ((e as { code?: number }).code !== 11000) throw e })
}

// ─── Settings (Admin → API /api/admin/wa-practice/settings) ─────────────────

let settingsCache: { at: number; s: PracticeSettings } | null = null

export async function getPracticeSettings(fresh = false): Promise<PracticeSettings> {
  if (!fresh && settingsCache && Date.now() - settingsCache.at < 30_000) return settingsCache.s
  const row = await (await db()).collection('wa_practice_settings').findOne({ id: 'global' }, { projection: { _id: 0 } }).catch(() => null)
  const s = normalizePracticeSettings(row)
  settingsCache = { at: Date.now(), s }
  return s
}

export async function savePracticeSettings(raw: unknown, actorId: string): Promise<PracticeSettings> {
  const s = normalizePracticeSettings(raw)
  await (await db()).collection('wa_practice_settings').updateOne(
    { id: 'global' },
    { $set: { ...s, id: 'global', updated_at: new Date().toISOString(), updated_by: actorId } },
    { upsert: true },
  )
  settingsCache = null
  return s
}

/**
 * Screening collections:
 *  - ats_screening_calls     ScreeningCallDoc (one per channel tried per stage entry)
 *  - ats_screening_settings  per-tenant numbers / templates / timings
 *  - ats_screening_events    webhook idempotency ledger (unique event key)
 */
import type { Collection, Db } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'
import type { ScreeningCallDoc, TenantScreeningSettings } from './types'

export { newId, nowIso } from '@/lib/db/ids'

const built = new Map<string, Promise<unknown> | null>()

function lazy<T extends object>(name: string, build: (c: Collection<T>) => Promise<unknown>) {
  return async (): Promise<Collection<T>> => {
    const db: Db = await getMongoDb()
    const col = db.collection<T>(name)
    if (!built.get(name)) {
      built.set(name, build(col).catch((e) => { built.set(name, null); console.error(`[ats/screening] ${name} index`, e) }))
    }
    await built.get(name)
    return col
  }
}

export const callsCol = lazy<ScreeningCallDoc>('ats_screening_calls', (c) =>
  Promise.all([
    c.createIndex({ id: 1 }, { unique: true, name: 'screening_calls_id' }),
    // one call per (stage entry, channel) — makes onEnter / fallback idempotent
    c.createIndex({ entry_channel: 1 }, { unique: true, name: 'screening_calls_entry_channel' }),
    c.createIndex({ entry_key: 1 }, { name: 'screening_calls_entry' }),
    c.createIndex({ tenant_id: 1, application_id: 1, created_at: -1 }, { name: 'screening_calls_tenant_app' }),
    c.createIndex({ to: 1, status: 1, updated_at: -1 }, { name: 'screening_calls_phone_active' }),
    c.createIndex({ provider_ref: 1 }, { name: 'screening_calls_provider_ref', sparse: true }),
    c.createIndex({ status: 1, next_action_at: 1 }, { name: 'screening_calls_due' }),
  ]),
)

export const settingsCol = lazy<TenantScreeningSettings>('ats_screening_settings', (c) =>
  c.createIndex({ tenant_id: 1 }, { unique: true, name: 'screening_settings_tenant' }),
)

interface EventDoc { key: string; at: Date } // Date: TTL indexes need a BSON date
export const eventsCol = lazy<EventDoc>('ats_screening_events', (c) =>
  Promise.all([
    c.createIndex({ key: 1 }, { unique: true, name: 'screening_events_key' }),
    c.createIndex({ at: 1 }, { name: 'screening_events_ttl', expireAfterSeconds: 60 * 60 * 24 * 14 }),
  ]),
)

/** true the first time `key` is seen (webhook retries / duplicates return false). */
export async function claimEvent(key: string): Promise<boolean> {
  try {
    await (await eventsCol()).insertOne({ key, at: new Date() })
    return true
  } catch (e) {
    if ((e as { code?: number })?.code === 11000) return false
    throw e
  }
}

/** Forget a claimed event so a provider retry is processed (call after a failed handler). */
export async function releaseEvent(key: string): Promise<void> {
  await (await eventsCol()).deleteOne({ key }).catch(() => undefined)
}

/** Tests only. */
export function __resetScreeningIndexes() {
  built.clear()
}

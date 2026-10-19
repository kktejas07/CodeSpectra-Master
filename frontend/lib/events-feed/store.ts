/**
 * Collections:
 *  - events_feed          FeedEventDoc (unique id, unique url_key)
 *  - events_feed_sources  SourceState per connector (enable, permission, last run, errors, counts)
 *  - events_feed_settings one doc { id: 'default' } (EventsFeedSettings + run markers)
 */
import type { Collection, Db } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'
import type { FeedEventDoc, SourceState } from './types'
import type { EventsFeedSettingsDoc } from './settings'

export { newId, nowIso } from '@/lib/db/ids'

const built = new Map<string, Promise<unknown> | null>()

function lazy<T extends object>(name: string, build: (c: Collection<T>) => Promise<unknown>) {
  return async (): Promise<Collection<T>> => {
    const db: Db = await getMongoDb()
    const col = db.collection<T>(name)
    if (!built.get(name)) {
      built.set(name, build(col).catch((e) => { built.set(name, null); console.error(`[events-feed] ${name} index`, e) }))
    }
    await built.get(name)
    return col
  }
}

export const feedCol = lazy<FeedEventDoc>('events_feed', (c) =>
  Promise.all([
    c.createIndex({ id: 1 }, { unique: true, name: 'ef_id' }),
    c.createIndex({ url_key: 1 }, { unique: true, name: 'ef_url' }),
    c.createIndex({ status: 1, starts_at: 1 }, { name: 'ef_status_start' }),
    c.createIndex({ status: 1, first_seen_at: -1 }, { name: 'ef_status_new' }),
    c.createIndex({ status: 1, registration_deadline: 1 }, { name: 'ef_status_deadline' }),
    c.createIndex({ 'sources.source': 1, 'sources.source_id': 1 }, { name: 'ef_sources' }),
  ]),
)

export const sourcesCol = lazy<SourceState>('events_feed_sources', (c) =>
  c.createIndex({ id: 1 }, { unique: true, name: 'efs_id' }),
)

export const settingsCol = lazy<EventsFeedSettingsDoc>('events_feed_settings', (c) =>
  c.createIndex({ id: 1 }, { unique: true, name: 'efset_id' }),
)

/** Tests only. */
export function __resetEventsFeedIndexes() { built.clear() }

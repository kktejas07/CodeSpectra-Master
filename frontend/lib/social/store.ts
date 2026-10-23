/**
 * Social studio storage (server only).
 *
 *   social_queue     SocialQueueDoc — one per published item (key `${type}:${ref_id}` unique)
 *   social_settings  { id: 'default', settings, usage: { day, drafts } }
 *
 * upsertQueueItems is idempotent: an item already queued keeps its id,
 * captions, post marks and first publish time; only its source fields refresh.
 */
import 'server-only'
import { createHash } from 'node:crypto'
import type { Collection } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'
import { queueKey } from './queue'
import { mergeSocialSettings, type SocialSettings } from './settings'
import type { CaptionDraft, CaptionLang, QueueInput, SocialPlatform, SocialQueueDoc } from './types'

const nowIso = () => new Date().toISOString()

let built: Promise<unknown> | null = null
export async function queueCol(): Promise<Collection<SocialQueueDoc>> {
  const db = await getMongoDb()
  const c = db.collection<SocialQueueDoc>('social_queue')
  if (!built) {
    built = Promise.all([
      c.createIndex({ id: 1 }, { unique: true, name: 'sq_id' }),
      c.createIndex({ key: 1 }, { unique: true, name: 'sq_key' }),
      c.createIndex({ published_at: -1 }, { name: 'sq_published' }),
      c.createIndex({ type: 1, published_at: -1 }, { name: 'sq_type_published' }),
      c.createIndex({ posted_count: 1, published_at: -1 }, { name: 'sq_posted' }),
      c.createIndex({ last_posted_at: -1 }, { name: 'sq_last_posted', sparse: true }),
      db.collection('social_settings').createIndex({ id: 1 }, { unique: true, name: 'ss_id' }),
    ]).catch((e) => {
      built = null
      console.error('[social] index setup:', (e as Error)?.message)
    })
  }
  await built
  return c
}

export const socialId = (key: string) => `sq_${createHash('sha1').update(key).digest('hex').slice(0, 16)}`

/** Insert new items, refresh source fields of known ones. Returns how many were new. */
export async function upsertQueueItems(items: readonly QueueInput[], now = new Date()): Promise<number> {
  if (!items.length) return 0
  const c = await queueCol()
  const ts = now.toISOString()
  const ops = items.map((it) => {
    const key = queueKey(it.type, it.ref_id)
    return {
      updateOne: {
        filter: { key },
        update: {
          $set: { title: it.title, summary: it.summary, url: it.url, image: it.image, image_own: it.image_own, source: it.source, facts: it.facts, updated_at: ts },
          $setOnInsert: {
            id: socialId(key), key, type: it.type, ref_id: it.ref_id, published_at: it.published_at || ts,
            captions: {}, posts: {}, posted_count: 0, last_posted_at: null, created_at: ts,
          },
        },
        upsert: true,
      },
    }
  })
  let created = 0
  for (let i = 0; i < ops.length; i += 200) {
    const r = await c.bulkWrite(ops.slice(i, i + 200) as never, { ordered: false })
    created += r.upsertedCount
  }
  return created
}

export async function getQueueItem(id: string): Promise<SocialQueueDoc | null> {
  if (!/^sq_[a-f0-9]{16}$/.test(id)) return null
  return (await (await queueCol()).findOne({ id }, { projection: { _id: 0 } })) as SocialQueueDoc | null
}

export async function saveCaptions(id: string, lang: CaptionLang, drafts: Partial<Record<SocialPlatform, CaptionDraft>>): Promise<SocialQueueDoc | null> {
  const set: Record<string, unknown> = { updated_at: nowIso() }
  for (const [p, d] of Object.entries(drafts)) set[`captions.${lang}.${p}`] = d
  return (await (await queueCol()).findOneAndUpdate({ id }, { $set: set }, { returnDocument: 'after', projection: { _id: 0 } })) as SocialQueueDoc | null
}

/** Mark / unmark one platform as posted (who / when), keeping posted_count in step. */
export async function setPosted(id: string, platform: SocialPlatform, posted: boolean, by: { id: string; name?: string | null }): Promise<SocialQueueDoc | null> {
  const c = await queueCol()
  const ts = nowIso()
  const cur = await c.findOne({ id }, { projection: { _id: 0, posts: 1 } })
  if (!cur) return null
  const posts = { ...(cur.posts || {}) }
  if (posted) posts[platform] = { at: ts, by: by.id, by_name: by.name?.slice(0, 120) || null }
  else delete posts[platform]
  const times = Object.values(posts).map((m) => m?.at).filter(Boolean).sort() as string[]
  return (await c.findOneAndUpdate(
    { id },
    { $set: { posts, posted_count: Object.keys(posts).length, last_posted_at: times.at(-1) ?? null, updated_at: ts } },
    { returnDocument: 'after', projection: { _id: 0 } },
  )) as SocialQueueDoc | null
}

// ─── Settings + daily AI counter ───────────────────────────────────────────

interface SettingsDoc { id: 'default'; settings?: Partial<SocialSettings>; usage?: { day?: string; drafts?: number }; updated_at?: string; updated_by?: string }

async function settingsCol(): Promise<Collection<SettingsDoc>> {
  await queueCol()
  return (await getMongoDb()).collection<SettingsDoc>('social_settings')
}

export async function getSocialSettings(): Promise<{ settings: SocialSettings; draftsToday: number }> {
  const doc = await (await settingsCol()).findOne({ id: 'default' }, { projection: { _id: 0 } })
  const day = nowIso().slice(0, 10)
  return { settings: mergeSocialSettings(doc?.settings), draftsToday: doc?.usage?.day === day ? doc.usage.drafts || 0 : 0 }
}

export async function saveSocialSettings(patch: Partial<SocialSettings>, actorId: string): Promise<SocialSettings> {
  const set: Record<string, unknown> = { updated_at: nowIso(), updated_by: actorId }
  for (const [k, v] of Object.entries(patch)) if (v !== undefined) set[`settings.${k}`] = v
  await (await settingsCol()).updateOne({ id: 'default' }, { $set: set, $setOnInsert: { id: 'default' } }, { upsert: true })
  return (await getSocialSettings()).settings
}

/**
 * Take one AI draft from today's allowance atomically. False when the cap is
 * reached (two admins clicking at once cannot both pass the last slot).
 */
export async function takeDraftSlot(cap: number): Promise<boolean> {
  if (cap <= 0) return false
  const c = await settingsCol()
  const day = nowIso().slice(0, 10)
  await c.updateOne({ id: 'default' }, { $setOnInsert: { id: 'default' } }, { upsert: true }).catch(() => undefined)
  // New day: reset the counter (only one writer wins the reset).
  await c.updateOne({ id: 'default', 'usage.day': { $ne: day } }, { $set: { usage: { day, drafts: 0 } } })
  const r = await c.updateOne({ id: 'default', 'usage.day': day, 'usage.drafts': { $lt: cap } }, { $inc: { 'usage.drafts': 1 } })
  return r.modifiedCount === 1
}

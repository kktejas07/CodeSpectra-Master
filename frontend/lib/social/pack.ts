/**
 * Daily social pack storage (server only) — built by the social pack loop
 * (lib/agent-loops/loops/social-pack.ts), shown in Admin → Social studio →
 * Today's pack. Approving a pack only records the owner's sign-off: he posts
 * each item himself with the studio's share buttons. Nothing is posted.
 *
 *   social_packs  { id: 'sp_<day>', day, status: ready | approved, items[], … }  (TTL 60 days)
 */
import 'server-only'
import type { Collection } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'
import type { CaptionLang, CardSize, SocialItemType, SocialPlatform } from './types'

export interface PackItem {
  queue_id: string
  type: SocialItemType
  title: string
  url: string
  score: number
  reasons: string[]
  /** Suggested posting time per network (UTC ISO). */
  times: Record<SocialPlatform, string>
  cards: Record<SocialPlatform, CardSize>
  /** Languages with a caption for every network. */
  langs_ready: CaptionLang[]
  /** Languages whose captions the AI wrote in this run (others: template or kept). */
  ai_langs: CaptionLang[]
}

export interface SocialPackDoc {
  id: string
  day: string
  status: 'ready' | 'approved'
  items: PackItem[]
  run_id: string | null
  /** Why AI captions were not used, when they weren't. */
  fallback: string | null
  created_at: string
  updated_at: string
  approved_at: string | null
  approved_by: string | null
  expires_at?: Date
}

let built: Promise<unknown> | null = null
export async function packsCol(): Promise<Collection<SocialPackDoc>> {
  const c = (await getMongoDb()).collection<SocialPackDoc>('social_packs')
  if (!built) {
    built = Promise.all([
      c.createIndex({ id: 1 }, { unique: true, name: 'sp_id' }),
      c.createIndex({ day: -1 }, { name: 'sp_day' }),
      c.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0, name: 'sp_ttl' }),
    ]).catch((e) => { built = null; console.error('[social] pack index:', (e as Error)?.message) })
  }
  await built
  return c
}

export const packIdFor = (day: string) => `sp_${day}`

export async function getPack(day: string): Promise<SocialPackDoc | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null
  return (await (await packsCol()).findOne({ id: packIdFor(day) }, { projection: { _id: 0, expires_at: 0 } })) as SocialPackDoc | null
}

export async function savePack(doc: Omit<SocialPackDoc, 'id' | 'created_at' | 'updated_at' | 'approved_at' | 'approved_by' | 'status'>, now = new Date()): Promise<SocialPackDoc | null> {
  const ts = now.toISOString()
  // An approved pack is never rebuilt (the owner may be posting from it).
  await (await packsCol()).updateOne(
    { id: packIdFor(doc.day), status: { $ne: 'approved' } },
    { $set: { ...doc, updated_at: ts, expires_at: new Date(now.getTime() + 60 * 86_400_000) }, $setOnInsert: { id: packIdFor(doc.day), status: 'ready', created_at: ts, approved_at: null, approved_by: null } },
    { upsert: true },
  ).catch((e) => { if ((e as { code?: number })?.code !== 11000) throw e })
  return getPack(doc.day)
}

export async function approvePack(day: string, by: string): Promise<SocialPackDoc | null> {
  const ts = new Date().toISOString()
  await (await packsCol()).updateOne({ id: packIdFor(day), status: 'ready' }, { $set: { status: 'approved', approved_at: ts, approved_by: by, updated_at: ts } })
  return getPack(day)
}

/** Queue ids packed in the last `days` days (not packed again so soon). */
export async function recentlyPackedIds(beforeDay: string, days = 7): Promise<Set<string>> {
  const since = new Date(Date.parse(`${beforeDay}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10)
  const rows = await (await packsCol()).find({ day: { $gte: since, $lt: beforeDay } }, { projection: { _id: 0, items: 1 } }).toArray()
  return new Set(rows.flatMap((r) => r.items.map((i) => i.queue_id)))
}

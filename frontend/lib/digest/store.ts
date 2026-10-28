/**
 * Daily digest storage (server only).
 *
 *   daily_digests          DigestDoc — one per local date (`date` unique, id `dg_<date>`)
 *   daily_digest_runs      DigestRunDoc — every run (schedule, bootstrap, admin, agent, preview)
 *   daily_digest_settings  { id: 'default', settings, templates, usage: { day, ai_calls } }
 */
import 'server-only'
import type { Collection, Db } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'
import { mergeDigestSettings, type DigestSettings, type DigestSettingsPatch } from './settings'
import { mergeTemplates, type DigestTemplates, type DigestTemplatesPatch } from './templates'
import type { DigestDoc, DigestRunDoc } from './types'

const built = new Map<string, Promise<unknown> | null>()
function lazy<T extends object>(name: string, build: (c: Collection<T>) => Promise<unknown>) {
  return async (): Promise<Collection<T>> => {
    const db: Db = await getMongoDb()
    const col = db.collection<T>(name)
    if (!built.get(name)) built.set(name, build(col).catch((e) => { built.set(name, null); console.error(`[digest] ${name} index:`, (e as Error)?.message) }))
    await built.get(name)
    return col
  }
}

export const digestsCol = lazy<DigestDoc>('daily_digests', (c) => Promise.all([
  c.createIndex({ id: 1 }, { unique: true, name: 'dd_id' }),
  c.createIndex({ date: 1 }, { unique: true, name: 'dd_date' }),
  c.createIndex({ status: 1, date: -1 }, { name: 'dd_status_date' }),
]))

export const runsCol = lazy<DigestRunDoc>('daily_digest_runs', (c) => Promise.all([
  c.createIndex({ id: 1 }, { unique: true, name: 'ddr_id' }),
  c.createIndex({ started_at: -1 }, { name: 'ddr_started' }),
  c.createIndex({ date: 1, started_at: -1 }, { name: 'ddr_date' }),
]))

interface SettingsDoc { id: 'default'; settings?: Partial<DigestSettings>; templates?: DigestTemplatesPatch; usage?: { day?: string; ai_calls?: number }; updated_at?: string; updated_by?: string }
const settingsCol = lazy<SettingsDoc>('daily_digest_settings', (c) => c.createIndex({ id: 1 }, { unique: true, name: 'dds_id' }))

const today = () => new Date().toISOString().slice(0, 10)

export async function getDigestConfig(): Promise<{ settings: DigestSettings; templates: DigestTemplates; rawTemplates: DigestTemplatesPatch; aiCallsToday: number }> {
  const doc = await (await settingsCol()).findOne({ id: 'default' }, { projection: { _id: 0 } })
  return {
    settings: mergeDigestSettings(doc?.settings),
    templates: mergeTemplates(doc?.templates),
    rawTemplates: (doc?.templates || {}) as DigestTemplatesPatch,
    aiCallsToday: doc?.usage?.day === today() ? doc.usage.ai_calls || 0 : 0,
  }
}

export async function saveDigestSettings(patch: DigestSettingsPatch, actorId: string): Promise<DigestSettings> {
  const set: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: actorId }
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue
    if ((k === 'quotas' || k === 'weights') && v && typeof v === 'object') {
      for (const [kk, vv] of Object.entries(v)) if (vv !== undefined) set[`settings.${k}.${kk}`] = vv
    } else set[`settings.${k}`] = v
  }
  await (await settingsCol()).updateOne({ id: 'default' }, { $set: set, $setOnInsert: { id: 'default' } }, { upsert: true })
  return (await getDigestConfig()).settings
}

export async function saveDigestTemplates(patch: DigestTemplatesPatch, actorId: string): Promise<DigestTemplates> {
  const set: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: actorId }
  for (const [lang, t] of Object.entries(patch)) {
    if (!t) continue
    for (const [k, v] of Object.entries(t)) {
      if (v === undefined) continue
      if (k === 'sections' && v && typeof v === 'object') {
        for (const [c, txt] of Object.entries(v)) if (txt !== undefined) set[`templates.${lang}.sections.${c}`] = txt
      } else set[`templates.${lang}.${k}`] = v
    }
  }
  await (await settingsCol()).updateOne({ id: 'default' }, { $set: set, $setOnInsert: { id: 'default' } }, { upsert: true })
  return (await getDigestConfig()).templates
}

/** Take one model call from today's allowance atomically (false when the cap is reached). */
export async function takeAiSlot(cap: number): Promise<boolean> {
  if (cap <= 0) return false
  const c = await settingsCol()
  const day = today()
  await c.updateOne({ id: 'default' }, { $setOnInsert: { id: 'default' } }, { upsert: true }).catch(() => undefined)
  await c.updateOne({ id: 'default', 'usage.day': { $ne: day } }, { $set: { usage: { day, ai_calls: 0 } } })
  const r = await c.updateOne({ id: 'default', 'usage.day': day, 'usage.ai_calls': { $lt: cap } }, { $inc: { 'usage.ai_calls': 1 } })
  return r.modifiedCount === 1
}

export async function getDigest(date: string, opts: { publishedOnly?: boolean } = {}): Promise<DigestDoc | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  return (await (await digestsCol()).findOne({ date, ...(opts.publishedOnly ? { status: 'published' } : {}) }, { projection: { _id: 0 } })) as DigestDoc | null
}

export interface DigestListRow { date: string; status: DigestDoc['status']; count: number; published_at: string | null; mode: DigestDoc['mode']; top: { title: string; category: string; url: string }[]; sections: DigestDoc['sections'] }

export async function listDigests(opts: { publishedOnly?: boolean; limit?: number; skip?: number } = {}): Promise<{ rows: DigestListRow[]; total: number }> {
  const c = await digestsCol()
  const filter = opts.publishedOnly ? { status: 'published' as const } : {}
  const [docs, total] = await Promise.all([
    c.find(filter, { projection: { _id: 0, date: 1, status: 1, published_at: 1, mode: 1, sections: 1, 'items.title': 1, 'items.category': 1, 'items.url': 1, 'items.rank': 1 } })
      .sort({ date: -1 }).skip(Math.max(0, opts.skip || 0)).limit(Math.min(100, Math.max(1, opts.limit || 30))).toArray(),
    c.countDocuments(filter),
  ])
  return {
    rows: (docs as unknown as DigestDoc[]).map((d) => ({
      date: d.date, status: d.status, count: d.items?.length || 0, published_at: d.published_at, mode: d.mode, sections: d.sections || [],
      top: [...(d.items || [])].sort((a, b) => a.rank - b.rank).slice(0, 4).map((i) => ({ title: i.title, category: i.category, url: i.url })),
    })),
    total,
  }
}

export async function digestStats(date: string): Promise<{ total: number; hasDate: boolean }> {
  const c = await digestsCol()
  const [total, one] = await Promise.all([c.estimatedDocumentCount().catch(() => c.countDocuments({})), c.findOne({ date }, { projection: { _id: 0, id: 1 } })])
  return { total, hasDate: !!one }
}

/** Keys featured in published digests on the `days` dates before `date`. */
export async function recentDigestKeys(date: string, days: number): Promise<Set<string>> {
  if (days <= 0) return new Set()
  const from = new Date(Date.parse(`${date}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10)
  const docs = await (await digestsCol()).find({ status: 'published', date: { $gte: from, $lt: date } }, { projection: { _id: 0, 'items.key': 1 } }).toArray()
  return new Set((docs as unknown as DigestDoc[]).flatMap((d) => (d.items || []).map((i) => i.key)))
}

export async function listRuns(limit = 20): Promise<DigestRunDoc[]> {
  return (await (await runsCol()).find({}, { projection: { _id: 0 } }).sort({ started_at: -1 }).limit(Math.min(100, limit)).toArray()) as DigestRunDoc[]
}

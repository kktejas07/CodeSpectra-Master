/**
 * Career AI settings + usage counters (server only).
 *   career_ai_settings  { _id: 'global', ...settings, usage: { day, day_count, month, month_cost_usd } }
 *   career_ai_user_usage { _id: `${userId}:${day}`, n, expire_at } (TTL)
 */
import 'server-only'
import { getMongoDb } from '@/lib/mongodb'
import { CareerAiPatch, careerAiAllowed, mergeCareerAi, type CapVerdict, type CareerAiSettings, type CareerAiUsage } from './settings'

type SettingsDoc = Partial<CareerAiSettings> & { _id: string; usage?: CareerAiUsage; updated_at?: string; updated_by?: string }
type UserUsage = { _id: string; n: number; expire_at: Date }

let indexed: Promise<unknown> | null = null
async function cols() {
  const db = await getMongoDb()
  const users = db.collection<UserUsage>('career_ai_user_usage')
  if (!indexed) indexed = users.createIndex({ expire_at: 1 }, { expireAfterSeconds: 0, name: 'career_ai_user_usage_ttl' }).catch(() => { indexed = null })
  await indexed
  return { settings: db.collection<SettingsDoc>('career_ai_settings'), users }
}

const EMPTY_USAGE: CareerAiUsage = { day: null, day_count: 0, month: null, month_cost_usd: 0 }

export async function getCareerAi(): Promise<CareerAiSettings & { usage: CareerAiUsage }> {
  const { settings } = await cols()
  const d = await settings.findOne({ _id: 'global' })
  return { ...mergeCareerAi(d), usage: d?.usage ?? EMPTY_USAGE }
}

export async function saveCareerAi(raw: unknown, actorId: string): Promise<CareerAiSettings> {
  const r = CareerAiPatch.safeParse(raw)
  if (!r.success) throw Object.assign(new Error(r.error.issues[0]?.message || 'Invalid settings'), { status: 400 })
  const set = Object.fromEntries(Object.entries(r.data).filter(([, v]) => v !== undefined))
  const { settings } = await cols()
  await settings.updateOne({ _id: 'global' }, { $set: { ...set, updated_at: new Date().toISOString(), updated_by: actorId } }, { upsert: true })
  return mergeCareerAi((await settings.findOne({ _id: 'global' })) ?? {})
}

/** Check the caps before a call. */
export async function careerAiGate(userId: string, now = new Date()): Promise<CapVerdict> {
  const s = await getCareerAi()
  const { users } = await cols()
  const u = await users.findOne({ _id: `${userId}:${now.toISOString().slice(0, 10)}` })
  return careerAiAllowed(s, s.usage, u?.n ?? 0, now)
}

/** Count one successful call (platform day/month + the learner's day). */
export async function recordCareerAi(userId: string, now = new Date()): Promise<void> {
  const s = await getCareerAi()
  const { settings, users } = await cols()
  const day = now.toISOString().slice(0, 10)
  const month = now.toISOString().slice(0, 7)
  await settings.updateOne({ _id: 'global', 'usage.day': { $ne: day } }, { $set: { 'usage.day': day, 'usage.day_count': 0 } }, { upsert: true }).catch(() => undefined)
  await settings.updateOne({ _id: 'global', 'usage.month': { $ne: month } }, { $set: { 'usage.month': month, 'usage.month_cost_usd': 0 } }, { upsert: true }).catch(() => undefined)
  await settings.updateOne({ _id: 'global' }, { $inc: { 'usage.day_count': 1, 'usage.month_cost_usd': s.cost_per_call_usd } }, { upsert: true })
  await users.updateOne({ _id: `${userId}:${day}` }, { $inc: { n: 1 }, $setOnInsert: { expire_at: new Date(now.getTime() + 2 * 86400_000) } }, { upsert: true })
}

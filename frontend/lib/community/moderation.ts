/**
 * Community moderation pipeline (server): settings, bans, link limits for new
 * accounts, profanity (mask / reject / review), spam heuristics, and an
 * optional AI check — off by default, capped per day and per month, and only
 * run on text that passed the prompt-injection scan (a flagged post goes to
 * the human queue instead of the model).
 */
import 'server-only'
import { createHash } from 'node:crypto'
import { getMongoDb } from '@/lib/mongodb'
import { nowIso } from '@/lib/db/ids'
import { fail } from './http'
import { aiUsageCol, profilesCol, settingsCol, type PostStatus } from './db'
import {
  DEFAULT_SETTINGS, aiBudget, countLinks, filterProfanity, linkLimitFor, mergeSettings, normaliseForHash, spamSignals,
  SettingsPatchSchema, type CommunitySettings,
} from './pure'

let cached: { at: number; s: CommunitySettings } | null = null

export async function getSettings(): Promise<CommunitySettings> {
  if (cached && Date.now() - cached.at < 30_000) return cached.s
  const row = await (await settingsCol()).findOne({ key: 'settings' }, { projection: { _id: 0 } })
  const s = row ? mergeSettings(DEFAULT_SETTINGS, row as never) : DEFAULT_SETTINGS
  cached = { at: Date.now(), s }
  return s
}

export async function saveSettings(userId: string, raw: unknown): Promise<CommunitySettings> {
  const r = SettingsPatchSchema.safeParse(raw)
  if (!r.success) throw fail(r.error.issues[0]?.message || 'Invalid settings', 400, 'community_settings_invalid')
  const next = mergeSettings(await getSettings(), r.data)
  if (typeof next.ai.monthly_cost_cap_usd === 'number') next.ai.monthly_cost_cap_usd = Math.round(next.ai.monthly_cost_cap_usd * 100) / 100
  await (await settingsCol()).updateOne({ key: 'settings' }, { $set: { ...next, key: 'settings', updated_at: nowIso(), updated_by: userId } }, { upsert: true })
  cached = null
  return next
}

export async function aiUsageNow(now = new Date()) {
  const day = now.toISOString().slice(0, 10)
  const month = day.slice(0, 7)
  const col = await aiUsageCol()
  const [d, m] = await Promise.all([
    col.findOne({ day }, { projection: { _id: 0, count: 1 } }),
    col.aggregate<{ usd: number }>([{ $match: { month } }, { $group: { _id: null, usd: { $sum: '$cost_usd' } } }]).toArray(),
  ])
  return { day, month, usedToday: d?.count ?? 0, spentMonthUsd: Math.round((m[0]?.usd ?? 0) * 1e4) / 1e4 }
}

export const textHash = (s: string) => createHash('sha256').update(normaliseForHash(s)).digest('hex').slice(0, 32)

export interface ModerationOutcome { text: string; status: PostStatus; reasons: string[]; ai: string | null; hash: string }

async function accountAgeDays(userId: string): Promise<number> {
  const u = await (await getMongoDb()).collection('user').findOne({ $or: [{ id: userId }, { _id: userId as never }] }, { projection: { createdAt: 1, created_at: 1 } })
  const at = u?.createdAt ? new Date(u.createdAt as Date).getTime() : u?.created_at ? Date.parse(String(u.created_at)) : NaN
  return Number.isFinite(at) ? (Date.now() - at) / 86_400_000 : 0
}

export async function assertNotBanned(userId: string): Promise<void> {
  const p = await (await profilesCol()).findOne({ user_id: userId }, { projection: { _id: 0, banned_until: 1 } })
  if (p?.banned_until && Date.parse(p.banned_until) > Date.now()) throw fail('You can’t post right now. A moderator paused your account.', 403, 'community_banned')
}

async function aiCheck(text: string, settings: CommunitySettings): Promise<'allow' | 'review' | 'block' | null> {
  const u = await aiUsageNow()
  if (!aiBudget(settings, u.usedToday, u.spentMonthUsd).ok) return null
  const { scanUntrusted, fenceUntrusted, untrustedRule } = await import('@/lib/ai/untrusted-input')
  if (scanUntrusted(text).flagged) return 'review'
  const { estimateTokens } = await import('@/lib/ai/usage-meter')
  const { backendComplete } = await import('@/lib/ai/backend')
  const system = `You moderate a programming community forum. Decide if a post is acceptable.
Answer JSON: {"verdict":"allow"|"review"|"block","reason":"<short>"}.
block = hate, harassment, sexual content, threats, doxxing, malware or clear spam/ads. review = unsure, scams, cheating on live exams. Otherwise allow. Code, technical criticism and non-English languages are fine.
${untrustedRule(['submission'])}`
  const user = fenceUntrusted('submission', text, 8000)
  const col = await aiUsageCol()
  const now = new Date()
  // Estimated cost (fast model): ~$0.5 per 1M input tokens, ~$1.5 per 1M output tokens.
  const cost = (estimateTokens(system + user) * 0.5 + 60 * 1.5) / 1_000_000
  await col.updateOne({ day: now.toISOString().slice(0, 10) }, { $inc: { count: 1, cost_usd: cost }, $setOnInsert: { month: now.toISOString().slice(0, 7) } }, { upsert: true })
  try {
    const res = await backendComplete({ systemMessage: system, userMessage: user, modelRole: 'fast', responseFormat: 'json', feature: 'community-moderation', cache: false })
    const j = (res.json && typeof res.json === 'object' ? res.json : null) as { verdict?: string } | null
    const v = j?.verdict
    return v === 'block' || v === 'review' || v === 'allow' ? v : null
  } catch {
    return null
  }
}

/**
 * Run a new post through the pipeline. Throws for a rejection the author can
 * fix (too many links, profanity in reject mode); returns the stored text and
 * whether it is visible or waits for a moderator.
 */
export async function moderate(userId: string, raw: string, opts: { recentHashes?: string[]; trusted?: boolean } = {}): Promise<ModerationOutcome> {
  const s = await getSettings()
  await assertNotBanned(userId)
  const reasons: string[] = []
  const links = countLinks(raw)
  if (!opts.trusted && links > 0) {
    const limit = linkLimitFor(s, await accountAgeDays(userId))
    if (links > limit) throw fail(limit === 0 ? 'New accounts can’t post links yet. Try again in a few days.' : `Posts can have at most ${limit} links.`, 400, limit === 0 ? 'community_links_new' : 'community_links_max', { max: limit })
  }
  const p = filterProfanity(raw, s.profanity.words, s.profanity.enabled)
  let text = raw
  if (p.hits) {
    if (s.profanity.action === 'reject') throw fail('Please remove the offensive words and post again.', 400, 'community_profanity')
    if (s.profanity.action === 'mask') text = p.text
    else reasons.push('profanity')
  }
  const hash = textHash(raw)
  reasons.push(...spamSignals(raw, { recentHashes: opts.recentHashes, hash }))
  let ai: string | null = null
  if (!opts.trusted && !reasons.length) {
    ai = await aiCheck(raw, s).catch(() => null)
    if (ai === 'block') throw fail('This post breaks the community guidelines.', 400, 'community_blocked')
    if (ai === 'review') reasons.push('ai_review')
  }
  return { text, status: reasons.length ? 'pending' : 'visible', reasons, ai, hash }
}

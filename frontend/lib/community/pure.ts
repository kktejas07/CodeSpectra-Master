/**
 * Community forum rules (pure, client-safe; tests/community.test.ts):
 * input validation, profanity filter, link limits for new accounts, spam
 * heuristics, mentions, reputation points and their XP, ranking, slugs.
 */
import { z } from 'zod'

export const THREAD_KINDS = ['question', 'discussion', 'solution'] as const
export type ThreadKind = (typeof THREAD_KINDS)[number]
export const CONTENT_LANGS = ['en', 'hi', 'te', 'other'] as const
export type ContentLang = (typeof CONTENT_LANGS)[number]
export const CATEGORY_KINDS = ['general', 'course', 'cohort', 'company'] as const
export type CategoryKind = (typeof CATEGORY_KINDS)[number]
export const REPORT_REASONS = ['spam', 'abuse', 'off_topic', 'spoiler', 'other'] as const
export type ReportReason = (typeof REPORT_REASONS)[number]

export interface CommunitySettings {
  profanity: { enabled: boolean; words: string[]; action: 'mask' | 'reject' | 'review' }
  links: { new_account_days: number; max_links_new: number; max_links: number }
  rate: { threads_per_hour: number; replies_per_hour: number; messages_per_minute: number }
  ai: { enabled: boolean; daily_cap: number; monthly_cost_cap_usd: number }
  /** XP per reputation point (positive events only), and the daily XP cap from reputation. */
  xp: { per_point: number; daily_cap: number }
}

export const DEFAULT_SETTINGS: CommunitySettings = {
  profanity: { enabled: true, words: [], action: 'mask' },
  links: { new_account_days: 7, max_links_new: 0, max_links: 5 },
  rate: { threads_per_hour: 5, replies_per_hour: 30, messages_per_minute: 20 },
  ai: { enabled: false, daily_cap: 200, monthly_cost_cap_usd: 5 },
  xp: { per_point: 1, daily_cap: 100 },
}

export const SettingsPatchSchema = z.object({
  profanity: z.object({
    enabled: z.boolean(),
    words: z.array(z.string().max(40)).max(500).transform((a) => [...new Set(a.map((w) => w.trim().toLowerCase()).filter((w) => w.length >= 2))]),
    action: z.enum(['mask', 'reject', 'review']),
  }).partial().optional(),
  links: z.object({
    new_account_days: z.coerce.number().int().min(0).max(90),
    max_links_new: z.coerce.number().int().min(0).max(20),
    max_links: z.coerce.number().int().min(0).max(50),
  }).partial().optional(),
  rate: z.object({
    threads_per_hour: z.coerce.number().int().min(1).max(100),
    replies_per_hour: z.coerce.number().int().min(1).max(500),
    messages_per_minute: z.coerce.number().int().min(1).max(120),
  }).partial().optional(),
  ai: z.object({
    enabled: z.boolean(),
    daily_cap: z.coerce.number().int().min(0).max(10_000),
    monthly_cost_cap_usd: z.coerce.number().min(0).max(1000),
  }).partial().optional(),
  xp: z.object({
    per_point: z.coerce.number().int().min(0).max(10),
    daily_cap: z.coerce.number().int().min(0).max(1000),
  }).partial().optional(),
}).strict()

export function mergeSettings(base: CommunitySettings, patch: z.infer<typeof SettingsPatchSchema>): CommunitySettings {
  return {
    profanity: { ...base.profanity, ...(patch.profanity || {}) },
    links: { ...base.links, ...(patch.links || {}) },
    rate: { ...base.rate, ...(patch.rate || {}) },
    ai: { ...base.ai, ...(patch.ai || {}) },
    xp: { ...base.xp, ...(patch.xp || {}) },
  }
}

const ctrl = (s: string) => s.replace(/[\u0000-\u0008\u000b-\u001f\u007f​-‏‪-‮⁦-⁩]/g, '')
export const cleanBody = (s: string) => ctrl(s.replace(/\r\n/g, '\n')).replace(/\n{4,}/g, '\n\n\n').trim()
export const cleanLine = (s: string) => ctrl(s).replace(/\s+/g, ' ').trim()

export const ThreadInputSchema = z.object({
  category_id: z.string().regex(/^[a-z0-9-]{2,80}$/),
  kind: z.enum(THREAD_KINDS).default('question'),
  title: z.string().max(400).transform(cleanLine).refine((s) => s.length >= 8 && s.length <= 160, 'Titles are 8 to 160 characters'),
  body: z.string().max(40_000).transform(cleanBody).refine((s) => s.length >= 10 && s.length <= 20_000, 'Write at least 10 characters (up to 20,000)'),
  lang: z.enum(CONTENT_LANGS).default('en'),
  problem: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).optional(),
  tags: z.array(z.string().max(30)).max(5).optional().transform((a) => [...new Set((a || []).map((t) => t.trim().toLowerCase().replace(/[^a-z0-9+#.-]/g, '')).filter(Boolean))].slice(0, 5)),
}).strict().refine((t) => t.kind !== 'solution' || !!t.problem, { message: 'Pick the problem this solution is for', path: ['problem'] })

export const ReplyInputSchema = z.object({
  body: z.string().max(40_000).transform(cleanBody).refine((s) => s.length >= 2 && s.length <= 20_000, 'Write a reply (up to 20,000 characters)'),
  lang: z.enum(CONTENT_LANGS).default('en'),
}).strict()

export const GroupInputSchema = z.object({
  name: z.string().max(160).transform(cleanLine).refine((s) => s.length >= 3 && s.length <= 80, 'Names are 3 to 80 characters'),
  goal: z.string().max(400).transform(cleanLine).refine((s) => s.length >= 5 && s.length <= 200, 'Describe the shared goal (5 to 200 characters)'),
  description: z.string().max(4000).transform(cleanBody).optional(),
  max_members: z.coerce.number().int().min(2).max(12).default(8),
  visibility: z.enum(['public', 'private']).default('public'),
  target_date: z.string().refine((s) => Number.isFinite(Date.parse(s)), 'Use a valid date').nullable().optional(),
}).strict()

// ─── Profanity ───────────────────────────────────────────────────────────────

/** Small built-in list (English + common Hinglish); admins extend it in settings. */
export const BASE_PROFANITY = ['fuck', 'fucking', 'shit', 'bitch', 'bastard', 'asshole', 'motherfucker', 'cunt', 'dick', 'chutiya', 'madarchod', 'behenchod', 'bhosdike', 'gandu', 'randi']

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function wordsRe(words: string[]): RegExp | null {
  const list = [...new Set(words.map((w) => w.trim().toLowerCase()).filter((w) => w.length >= 2))].sort((a, b) => b.length - a.length)
  if (!list.length) return null
  // Letters around the word must not be letters (unicode-aware), so "class" never matches "ass".
  return new RegExp(`(?<![\\p{L}\\p{N}])(${list.map(escapeRe).join('|')})(?![\\p{L}\\p{N}])`, 'giu')
}

/** Profanity outside code blocks / inline code: masked text and whether anything matched. */
export function filterProfanity(text: string, extra: string[] = [], enabled = true): { text: string; hits: number } {
  if (!enabled) return { text, hits: 0 }
  const re = wordsRe([...BASE_PROFANITY, ...extra])
  if (!re) return { text, hits: 0 }
  let hits = 0
  const parts = text.split(/(```[\s\S]*?```|`[^`\n]*`)/g)
  const out = parts.map((p, i) => (i % 2 === 1 ? p : p.replace(re, (m) => { hits++; return m[0] + '*'.repeat(Math.max(1, [...m].length - 1)) })))
  return { text: out.join(''), hits }
}

// ─── Links / spam ────────────────────────────────────────────────────────────

/** Links in prose (code blocks don't count): bare URLs, markdown links and www. hosts. */
export function countLinks(text: string): number {
  const prose = text.replace(/```[\s\S]*?```|`[^`\n]*`/g, ' ')
  const urls = prose.match(/\bhttps?:\/\/[^\s)<>]+|\bwww\.[a-z0-9-]+\.[a-z]{2,}[^\s)<>]*/gi) || []
  return urls.length
}

export function linkLimitFor(s: CommunitySettings, accountAgeDays: number): number {
  return accountAgeDays < s.links.new_account_days ? s.links.max_links_new : s.links.max_links
}

export type SpamSignal = 'repeated_chars' | 'shouting' | 'duplicate' | 'link_heavy'

/** Cheap heuristics; any signal sends the post to the moderation queue (it is not rejected). */
export function spamSignals(text: string, opts: { recentHashes?: string[]; hash?: string } = {}): SpamSignal[] {
  const out: SpamSignal[] = []
  const prose = text.replace(/```[\s\S]*?```|`[^`\n]*`/g, ' ')
  if (/(.)\1{14,}/u.test(prose)) out.push('repeated_chars')
  const letters = prose.replace(/[^A-Za-z]/g, '')
  if (letters.length >= 40 && letters.replace(/[^A-Z]/g, '').length / letters.length > 0.8) out.push('shouting')
  if (opts.hash && opts.recentHashes?.includes(opts.hash)) out.push('duplicate')
  const words = prose.split(/\s+/).filter(Boolean).length
  if (countLinks(text) >= 3 && words < countLinks(text) * 8) out.push('link_heavy')
  return out
}

/** Normalised text hash input (duplicate-post check). */
export function normaliseForHash(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 2000)
}

// ─── Mentions ────────────────────────────────────────────────────────────────

/** @handles in prose (not in code), lower-cased, unique, max 10. */
export function parseMentions(text: string): string[] {
  const prose = text.replace(/```[\s\S]*?```|`[^`\n]*`/g, ' ')
  const out = new Set<string>()
  for (const m of prose.matchAll(/(^|[^\w@])@([a-z0-9][a-z0-9_.-]{1,30}[a-z0-9])/gi)) out.add(m[2].toLowerCase())
  return [...out].slice(0, 10)
}

// ─── Reputation ──────────────────────────────────────────────────────────────

export type RepEvent = 'thread_upvoted' | 'reply_upvoted' | 'answer_accepted' | 'accepted_an_answer' | 'downvoted' | 'solution_upvoted'

export const REP_POINTS: Record<RepEvent, number> = {
  thread_upvoted: 5,
  reply_upvoted: 10,
  solution_upvoted: 10,
  answer_accepted: 15,
  accepted_an_answer: 2,
  downvoted: -2,
}

/** Reputation change when a vote on a post moves from `before` to `after` (-1, 0, 1). */
export function voteRepDelta(target: 'thread' | 'reply' | 'solution', before: number, after: number): number {
  const up = target === 'thread' ? REP_POINTS.thread_upvoted : target === 'solution' ? REP_POINTS.solution_upvoted : REP_POINTS.reply_upvoted
  const pts = (v: number) => (v > 0 ? up : v < 0 ? REP_POINTS.downvoted : 0)
  return pts(after) - pts(before)
}

/** XP for a positive reputation gain, within what's left of today's cap. */
export function xpForReputation(points: number, s: CommunitySettings, awardedToday: number): number {
  if (points <= 0 || s.xp.per_point <= 0) return 0
  return Math.max(0, Math.min(points * s.xp.per_point, s.xp.daily_cap - awardedToday))
}

/** Reputation never goes below zero. */
export const clampReputation = (n: number) => Math.max(0, Math.round(n))

// ─── Ranking / ids ───────────────────────────────────────────────────────────

/** "Hot" order for a thread list: score and replies, decaying with age (hours). */
export function hotScore(t: { score: number; reply_count: number; last_activity_at: string }, now = Date.now()): number {
  const ageH = Math.max(0, (now - Date.parse(t.last_activity_at)) / 3_600_000)
  return (t.score * 2 + t.reply_count + 1) / Math.pow(ageH + 2, 1.5)
}

export function slugify(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'topic'
}

/** Thread id usable in a localized URL (/community/t/<id>): lower-case letters, digits and dashes. */
export function isThreadId(v: unknown): v is string {
  return typeof v === 'string' && /^t[0-9a-f]{16}$/.test(v)
}

/** Should the viewer see a solution write-up's body? */
export function solutionVisible(p: { isAuthor: boolean; isModerator: boolean; solved: boolean }): boolean {
  return p.isAuthor || p.isModerator || p.solved
}

/** AI moderation budget for one more call (daily count + estimated monthly cost). */
export function aiBudget(s: CommunitySettings, usedToday: number, spentMonthUsd: number): { ok: boolean; reason?: 'off' | 'daily_cap' | 'monthly_cap' } {
  if (!s.ai.enabled) return { ok: false, reason: 'off' }
  if (usedToday >= s.ai.daily_cap) return { ok: false, reason: 'daily_cap' }
  if (spentMonthUsd >= s.ai.monthly_cost_cap_usd) return { ok: false, reason: 'monthly_cap' }
  return { ok: true }
}

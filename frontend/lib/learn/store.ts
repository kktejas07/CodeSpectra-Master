/**
 * Learn hub persistence: collections, indexes, settings, topics, the source
 * allowlist and the practice-problem lookup. Server only.
 *
 * Collections: learn_posts, learn_topics, learn_sources, learn_settings (one doc).
 */
import type { Collection, Db } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'
import { newId, nowIso } from '@/lib/db/ids'
import { sanitizeRegex } from '@/lib/sanitize'
import { findDuplicateTitle, missingSeedRows, seedTopicRows, topicHash } from './topics'
import {
  DEFAULT_LEARN_SETTINGS, LEARN_LANGUAGES, isLearnCategory, isLearnLanguage, isLearnLevel,
  type LearnPostDoc, type LearnSettings, type LearnSourceDoc, type LearnTopicDoc, type PracticeLink,
} from './types'

const SETTINGS_ID = 'settings'

let indexed = false
async function db(): Promise<Db> {
  const d = await getMongoDb()
  if (!indexed) {
    indexed = true
    void Promise.all([
      d.collection('learn_posts').createIndex({ slug: 1 }, { unique: true }),
      d.collection('learn_posts').createIndex({ id: 1 }, { unique: true }),
      d.collection('learn_posts').createIndex({ status: 1, published_at: -1 }),
      d.collection('learn_posts').createIndex({ status: 1, publish_at: 1 }),
      d.collection('learn_posts').createIndex({ topic_id: 1 }),
      d.collection('learn_posts').createIndex({ translation_of: 1, locale: 1 }, { sparse: true }),
      d.collection('learn_topics').createIndex({ hash: 1 }, { unique: true }),
      d.collection('learn_topics').createIndex({ id: 1 }, { unique: true }),
      d.collection('learn_sources').createIndex({ domain: 1 }, { unique: true }),
      d.collection('learn_settings').createIndex({ id: 1 }, { unique: true }),
    ]).catch((e) => console.warn('[learn] index setup:', (e as Error).message))
  }
  return d
}

export async function learnPosts(): Promise<Collection<LearnPostDoc>> {
  return (await db()).collection<LearnPostDoc>('learn_posts')
}
export async function learnTopics(): Promise<Collection<LearnTopicDoc>> {
  return (await db()).collection<LearnTopicDoc>('learn_topics')
}
export async function learnSources(): Promise<Collection<LearnSourceDoc>> {
  return (await db()).collection<LearnSourceDoc>('learn_sources')
}
async function settingsCol(): Promise<Collection<LearnSettings & { id: string }>> {
  return (await db()).collection<LearnSettings & { id: string }>('learn_settings')
}

// ─── Settings ────────────────────────────────────────────────────────────────

export async function getLearnSettings(): Promise<LearnSettings> {
  const col = await settingsCol()
  const doc = await col.findOne({ id: SETTINGS_ID }, { projection: { _id: 0, id: 0 } })
  return { ...DEFAULT_LEARN_SETTINGS, ...(doc ?? {}) }
}

/** Validate a settings patch from the admin UI. */
export function cleanSettingsPatch(raw: Record<string, unknown>): { patch: Partial<LearnSettings>; error?: string } {
  const patch: Partial<LearnSettings> = {}
  if ('enabled' in raw) patch.enabled = raw.enabled === true
  if ('research_enabled' in raw) patch.research_enabled = raw.research_enabled === true
  if ('auto_approve' in raw) patch.auto_approve = raw.auto_approve === true
  if ('posts_per_day' in raw) {
    const n = Number(raw.posts_per_day)
    if (!Number.isInteger(n) || n < 0 || n > 10) return { patch, error: 'Posts per day must be a whole number from 0 to 10.' }
    patch.posts_per_day = n
  }
  if ('run_hour_utc' in raw) {
    const n = Number(raw.run_hour_utc)
    if (!Number.isInteger(n) || n < 0 || n > 23) return { patch, error: 'Run hour must be 0–23 (UTC).' }
    patch.run_hour_utc = n
  }
  if ('auto_approve_min_score' in raw) {
    const n = Number(raw.auto_approve_min_score)
    if (!Number.isFinite(n) || n < 50 || n > 100) return { patch, error: 'Minimum score must be 50–100.' }
    patch.auto_approve_min_score = Math.round(n)
  }
  if ('translate_daily_cap' in raw) {
    const n = Number(raw.translate_daily_cap)
    if (!Number.isInteger(n) || n < 0 || n > 50) return { patch, error: 'Translations per day must be 0–50.' }
    patch.translate_daily_cap = n
  }
  if ('translate_monthly_cap' in raw) {
    const n = Number(raw.translate_monthly_cap)
    if (!Number.isInteger(n) || n < 0 || n > 1000) return { patch, error: 'Translations per month must be 0–1000.' }
    patch.translate_monthly_cap = n
  }
  if ('languages' in raw) {
    const langs = Array.isArray(raw.languages) ? [...new Set(raw.languages.filter(isLearnLanguage))] : []
    if (langs.length < 2) return { patch, error: `Pick at least two languages (${LEARN_LANGUAGES.map((l) => l.label).join(', ')}).` }
    patch.languages = langs.slice(0, 4)
  }
  return { patch }
}

export async function updateLearnSettings(patch: Partial<LearnSettings>, by: string | null): Promise<LearnSettings> {
  const col = await settingsCol()
  await col.updateOne({ id: SETTINGS_ID }, { $set: { ...patch, updated_at: nowIso(), updated_by: by } }, { upsert: true })
  return getLearnSettings()
}

/**
 * Claim one of today's `perDay` generation slots (atomic across replicas and
 * restarts). The scheduler writes one post per tick, so each tick stays short.
 * A failed generation still uses its slot (no runaway retries / AI spend).
 */
export async function claimDailySlot(day: string, perDay: number): Promise<boolean> {
  if (perDay <= 0) return false
  const col = await settingsCol()
  try {
    // Make sure the single settings doc exists, then claim conditionally (no upsert,
    // so a lost race can never insert a second settings doc).
    await col.updateOne({ id: SETTINGS_ID }, { $setOnInsert: { id: SETTINGS_ID } }, { upsert: true })
    const fresh = await col.updateOne({ id: SETTINGS_ID, last_daily_run: { $ne: day } }, { $set: { last_daily_run: day, daily_count: 1 } })
    if (fresh.modifiedCount === 1) return true
    const more = await col.updateOne({ id: SETTINGS_ID, last_daily_run: day, daily_count: { $lt: perDay } }, { $inc: { daily_count: 1 } })
    return more.modifiedCount === 1
  } catch {
    return false
  }
}

/** Claim this ISO week's subscriber digest run (once across replicas). */
export async function claimDigestWeek(week: string): Promise<boolean> {
  const col = await settingsCol()
  try {
    await col.updateOne({ id: SETTINGS_ID }, { $setOnInsert: { id: SETTINGS_ID } }, { upsert: true })
    const r = await col.updateOne({ id: SETTINGS_ID, last_digest_week: { $ne: week } }, { $set: { last_digest_week: week } })
    return r.modifiedCount === 1
  } catch {
    return false
  }
}

// ─── Topics ──────────────────────────────────────────────────────────────────

let seeded = false
/** Insert the seed taxonomy once (idempotent: unique topic hash). */
export async function ensureTopicSeed(): Promise<void> {
  if (seeded) return
  const col = await learnTopics()
  // A live database gets only the seed rows it is missing (new categories), never duplicates.
  const existing = (await col.estimatedDocumentCount()) > 0
    ? ((await col.find({}, { projection: { _id: 0, hash: 1, title: 1 } }).limit(20_000).toArray()) as { hash: string; title: string }[])
    : null
  const seedRows = existing ? missingSeedRows(existing) : seedTopicRows()
  if (!seedRows.length) {
    seeded = true
    return
  }
  const now = nowIso()
  const rows: LearnTopicDoc[] = seedRows.map((r) => ({
    ...r, id: newId(), enabled: true, generated_count: 0, last_generated_at: null, source: 'seed', created_at: now, updated_at: now,
  }))
  try {
    await col.insertMany(rows, { ordered: false })
  } catch {
    // Duplicates from a concurrent seed are fine.
  }
  seeded = true
}

export type TopicInput = { title?: unknown; category?: unknown; level?: unknown; tags?: unknown; series?: unknown; series_order?: unknown; refs?: unknown; priority?: unknown; enabled?: unknown }

function cleanTags(v: unknown): string[] {
  if (!Array.isArray(v)) return typeof v === 'string' ? cleanTags(v.split(',')) : []
  return [...new Set(v.map((t) => String(t).trim().toLowerCase().slice(0, 40)).filter(Boolean))].slice(0, 10)
}
function cleanRefs(v: unknown): string[] {
  const list = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/\s+/) : []
  return list.map((u) => String(u).trim()).filter((u) => /^https:\/\/[^\s]+$/i.test(u) && u.length <= 500).slice(0, 5)
}

/** Add a topic (admin). Refuses exact and near-duplicate titles in the same category. */
export async function addTopic(input: TopicInput, by: 'admin' | 'seed' = 'admin'): Promise<{ topic?: LearnTopicDoc; error?: string }> {
  const title = typeof input.title === 'string' ? input.title.trim().replace(/\s+/g, ' ').slice(0, 140) : ''
  if (title.length < 3) return { error: 'Give the topic a title.' }
  if (!isLearnCategory(input.category)) return { error: 'Pick a category.' }
  if (!isLearnLevel(input.level)) return { error: 'Pick a level.' }
  const col = await learnTopics()
  const sameCat = await col.find({ category: input.category }, { projection: { title: 1 } }).toArray()
  const dup = findDuplicateTitle(title, sameCat.map((t) => t.title))
  if (dup) return { error: `This looks like an existing topic: "${dup}".` }
  const now = nowIso()
  const series = typeof input.series === 'string' && input.series.trim() ? input.series.trim().slice(0, 80) : null
  const doc: LearnTopicDoc = {
    id: newId(), title, category: input.category, level: input.level, tags: cleanTags(input.tags),
    series, series_order: series && Number.isInteger(Number(input.series_order)) ? Number(input.series_order) : null,
    refs: cleanRefs(input.refs), hash: topicHash(title, input.category), enabled: input.enabled !== false,
    priority: Number.isFinite(Number(input.priority)) ? Math.max(-10, Math.min(10, Math.round(Number(input.priority)))) : 0,
    generated_count: 0, last_generated_at: null, source: by, created_at: now, updated_at: now,
  }
  try {
    await col.insertOne(doc)
  } catch {
    return { error: 'This topic already exists.' }
  }
  return { topic: doc }
}

/** Edit a topic (admin): enabled, priority, level, tags, series, refs. Title changes re-check duplicates. */
export async function updateTopic(id: string, input: TopicInput): Promise<{ topic?: LearnTopicDoc; error?: string }> {
  const col = await learnTopics()
  const cur = await col.findOne({ id })
  if (!cur) return { error: 'Topic not found.' }
  const set: Partial<LearnTopicDoc> = { updated_at: nowIso() }
  if ('enabled' in input) set.enabled = input.enabled === true
  if ('priority' in input && Number.isFinite(Number(input.priority))) set.priority = Math.max(-10, Math.min(10, Math.round(Number(input.priority))))
  if ('level' in input) { if (!isLearnLevel(input.level)) return { error: 'Pick a level.' }; set.level = input.level }
  if ('tags' in input) set.tags = cleanTags(input.tags)
  if ('refs' in input) set.refs = cleanRefs(input.refs)
  if ('series' in input) set.series = typeof input.series === 'string' && input.series.trim() ? input.series.trim().slice(0, 80) : null
  if ('series_order' in input) set.series_order = Number.isInteger(Number(input.series_order)) ? Number(input.series_order) : null
  if (typeof input.title === 'string' && input.title.trim() && input.title.trim() !== cur.title) {
    const title = input.title.trim().replace(/\s+/g, ' ').slice(0, 140)
    const others = await col.find({ category: cur.category, id: { $ne: id } }, { projection: { title: 1 } }).toArray()
    const dup = findDuplicateTitle(title, others.map((t) => t.title))
    if (dup) return { error: `This looks like an existing topic: "${dup}".` }
    set.title = title
    set.hash = topicHash(title, cur.category)
  }
  try {
    await col.updateOne({ id }, { $set: set })
  } catch {
    return { error: 'Another topic already has this title.' }
  }
  return { topic: { ...cur, ...set } as LearnTopicDoc }
}

/** Claim a topic for generation for 10 minutes (prevents two runs writing the same topic). */
export async function claimTopic(id: string, now = new Date()): Promise<boolean> {
  const col = await learnTopics()
  const r = await col.updateOne(
    { id, $or: [{ generating_until: null }, { generating_until: { $exists: false } }, { generating_until: { $lte: now.toISOString() } }] },
    { $set: { generating_until: new Date(now.getTime() + 10 * 60_000).toISOString() } },
  )
  return r.modifiedCount === 1
}

export async function releaseTopic(id: string, generated: boolean): Promise<void> {
  const col = await learnTopics()
  await col.updateOne({ id }, {
    $set: { generating_until: null, ...(generated ? { last_generated_at: nowIso() } : {}) },
    ...(generated ? { $inc: { generated_count: 1 } } : {}),
  })
}

// ─── Source allowlist ────────────────────────────────────────────────────────

export const DEFAULT_SOURCES: Array<Pick<LearnSourceDoc, 'domain' | 'label'>> = [
  { domain: 'en.wikipedia.org', label: 'Wikipedia' },
  { domain: 'developer.mozilla.org', label: 'MDN Web Docs' },
  { domain: 'docs.python.org', label: 'Python docs' },
  { domain: 'docs.oracle.com', label: 'Java (Oracle) docs' },
  { domain: 'en.cppreference.com', label: 'cppreference' },
  { domain: 'www.typescriptlang.org', label: 'TypeScript docs' },
  { domain: 'owasp.org', label: 'OWASP' },
  { domain: 'cheatsheetseries.owasp.org', label: 'OWASP cheat sheets' },
  { domain: 'scrumguides.org', label: 'The Scrum Guide' },
  { domain: 'agilemanifesto.org', label: 'Agile Manifesto' },
  { domain: 'kubernetes.io', label: 'Kubernetes docs' },
  { domain: 'docs.docker.com', label: 'Docker docs' },
  { domain: 'www.postgresql.org', label: 'PostgreSQL docs' },
  { domain: 'learn.microsoft.com', label: 'Microsoft Learn' },
]

/** Bare hostname from user input ("https://Docs.Python.org/3/" → "docs.python.org"), or null. */
export function cleanDomain(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  let s = raw.trim().toLowerCase()
  if (!s) return null
  if (!/^https?:\/\//.test(s)) s = `https://${s}`
  try {
    const h = new URL(s).hostname
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(h) || h.length > 200) return null
    return h
  } catch {
    return null
  }
}

let sourcesSeeded = false
export async function listSources(): Promise<LearnSourceDoc[]> {
  const col = await learnSources()
  if (!sourcesSeeded) {
    sourcesSeeded = true
    if ((await col.estimatedDocumentCount()) === 0) {
      const now = nowIso()
      await col.insertMany(DEFAULT_SOURCES.map((s) => ({ ...s, id: newId(), enabled: true, created_at: now })), { ordered: false }).catch(() => undefined)
    }
  }
  return col.find({}, { projection: { _id: 0 } }).sort({ domain: 1 }).toArray()
}

export async function allowedDomains(): Promise<string[]> {
  return (await listSources()).filter((s) => s.enabled).map((s) => s.domain)
}

// ─── Practice problems ──────────────────────────────────────────────────────

/** Up to `limit` published problems whose topics match the given tags (case-insensitive, exact words). */
export async function findPracticeProblems(tags: readonly string[], limit = 4): Promise<PracticeLink[]> {
  const clean = tags.map((t) => t.trim()).filter(Boolean).slice(0, 8)
  if (!clean.length) return []
  try {
    const d = await getMongoDb()
    const rows = await d.collection('problems')
      .find(
        { is_published: { $ne: false }, topics: { $in: clean.map((t) => new RegExp(`^${sanitizeRegex(t)}$`, 'i')) } },
        { projection: { _id: 0, title: 1, slug: 1, difficulty: 1 } },
      )
      .limit(limit)
      .toArray()
    return rows
      .filter((r) => typeof r.slug === 'string' && r.slug)
      .map((r) => ({ title: String(r.title || r.slug).slice(0, 160), slug: String(r.slug), ...(r.difficulty ? { difficulty: String(r.difficulty).slice(0, 20) } : {}) }))
  } catch {
    return []
  }
}

/** Public projection for cards. */
export const CARD_PROJECTION = { _id: 0, slug: 1, title: 1, summary: 1, category: 1, level: 1, tags: 1, series: 1, reading_minutes: 1, published_at: 1, featured: 1 } as const

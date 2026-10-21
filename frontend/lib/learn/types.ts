/**
 * Learn hub (knowledge blog) — shared types and constants. Client-safe (no
 * server imports), so the admin UI and public pages can use the same lists.
 */

export const LEARN_CATEGORIES = [
  { id: 'dsa', label: 'Algorithms & data structures' },
  { id: 'system-design', label: 'System design' },
  { id: 'design-patterns', label: 'Design patterns' },
  { id: 'architecture', label: 'Architecture styles' },
  { id: 'methodologies', label: 'Methodologies' },
  { id: 'testing', label: 'Testing' },
  { id: 'security', label: 'Security' },
  { id: 'databases', label: 'Databases' },
  { id: 'cloud', label: 'Cloud & DevOps' },
  { id: 'ai-ml', label: 'AI/ML engineering' },
  { id: 'interview-prep', label: 'Interview prep' },
  { id: 'career', label: 'Career skills' },
  { id: 'languages', label: 'Programming languages' },
  { id: 'technologies', label: 'Frameworks & technologies' },
  { id: 'competitions-careers', label: 'Competitions & careers' },
] as const

export type LearnCategoryId = (typeof LEARN_CATEGORIES)[number]['id']

export const LEARN_LEVELS = ['beginner', 'intermediate', 'advanced'] as const
export type LearnLevel = (typeof LEARN_LEVELS)[number]

/** Languages the generator can write code examples in. */
export const LEARN_LANGUAGES = [
  { id: 'python', label: 'Python' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'java', label: 'Java' },
  { id: 'cpp', label: 'C++' },
] as const
export type LearnLanguage = (typeof LEARN_LANGUAGES)[number]['id']

export const LEARN_STATUSES = ['draft', 'approved', 'scheduled', 'published', 'rejected', 'archived'] as const
export type LearnStatus = (typeof LEARN_STATUSES)[number]

export const SHARE_CHANNELS = ['linkedin', 'whatsapp', 'x', 'facebook', 'telegram', 'email', 'copy', 'native'] as const
export type ShareChannel = (typeof SHARE_CHANNELS)[number]

/** Categories where code examples are not the point (process / people topics). */
export const PROSE_FIRST_CATEGORIES: ReadonlySet<LearnCategoryId> = new Set(['methodologies', 'career', 'competitions-careers'])

export function isLearnCategory(v: unknown): v is LearnCategoryId {
  return typeof v === 'string' && LEARN_CATEGORIES.some((c) => c.id === v)
}
export function isLearnLevel(v: unknown): v is LearnLevel {
  return typeof v === 'string' && (LEARN_LEVELS as readonly string[]).includes(v)
}
export function isLearnLanguage(v: unknown): v is LearnLanguage {
  return typeof v === 'string' && LEARN_LANGUAGES.some((l) => l.id === v)
}
export function isShareChannel(v: unknown): v is ShareChannel {
  return typeof v === 'string' && (SHARE_CHANNELS as readonly string[]).includes(v)
}
export function categoryLabel(id: string): string {
  return LEARN_CATEGORIES.find((c) => c.id === id)?.label ?? id
}

export interface LearnTopicDoc {
  id: string
  title: string
  category: LearnCategoryId
  level: LearnLevel
  /** Problem-bank topics/tags used to find practice problems. */
  tags: string[]
  /** Optional series this topic belongs to, and its position in it. */
  series?: string | null
  series_order?: number | null
  /** Optional reference pages (must still pass the source allowlist). */
  refs?: string[]
  /** sha256 of normalised title + category — unique. */
  hash: string
  enabled: boolean
  /** Higher goes first in the scheduler. */
  priority: number
  generated_count: number
  last_generated_at?: string | null
  /** Claim while a generation is running (ISO). */
  generating_until?: string | null
  source: 'seed' | 'admin'
  created_at: string
  updated_at: string
}

export interface PracticeLink {
  title: string
  slug: string
  difficulty?: string
}

export interface FurtherReading {
  title: string
  url: string
}

export interface LearnPostDoc {
  id: string
  slug: string
  title: string
  summary: string
  category: LearnCategoryId
  level: LearnLevel
  tags: string[]
  series?: string | null
  series_order?: number | null
  topic_id?: string | null
  reading_minutes: number
  /** Sanitised markdown. */
  body: string
  languages: LearnLanguage[]
  practice: PracticeLink[]
  /** Sources the bot learned from or cites — URLs only, never their text. */
  sources: FurtherReading[]
  status: LearnStatus
  quality: { score: number; flags: string[] }
  featured?: boolean
  reject_reason?: string | null
  publish_at?: string | null
  published_at?: string | null
  reviewed_by?: string | null
  reviewed_at?: string | null
  generated_by: 'bot' | 'admin'
  model?: string | null
  stats: { views: number; shares: Partial<Record<ShareChannel, number>>; share_total: number }
  created_at: string
  updated_at: string
}

export interface LearnSourceDoc {
  id: string
  /** Hostname (exact or parent domain, e.g. "wikipedia.org" covers en.wikipedia.org). */
  domain: string
  label: string
  enabled: boolean
  created_at: string
}

export interface LearnSettings {
  /** Scheduled generation on/off. */
  enabled: boolean
  posts_per_day: number
  /** UTC hour the daily run starts. */
  run_hour_utc: number
  languages: LearnLanguage[]
  research_enabled: boolean
  /** OFF by default: every post needs an admin approval. */
  auto_approve: boolean
  /** Only with auto_approve: minimum quality score to publish without review. */
  auto_approve_min_score: number
  last_daily_run?: string | null
  /** Posts generated (attempted) on last_daily_run. */
  daily_count?: number
  /** ISO week (e.g. 2026-W42) the "new on Learn" subscriber digest last ran. */
  last_digest_week?: string | null
  updated_at?: string
  updated_by?: string | null
}

export const DEFAULT_LEARN_SETTINGS: LearnSettings = {
  enabled: true,
  posts_per_day: 2,
  run_hour_utc: 3,
  languages: ['python', 'javascript', 'java'],
  research_enabled: true,
  auto_approve: false,
  auto_approve_min_score: 85,
}

/** Public post card (list endpoints and the landing section). */
export type LearnPostCard = Pick<
  LearnPostDoc,
  'slug' | 'title' | 'summary' | 'category' | 'level' | 'tags' | 'series' | 'reading_minutes' | 'published_at' | 'featured'
>

/**
 * Daily digest — shared types (client-safe, no I/O).
 *
 * Every 24 hours the "Digest curator" picks the best items the aggregator
 * has collected (events feed, tech news, Learn, contests, hackathons,
 * codeathons, certifications, company tests — the Social studio queue is the
 * candidate pool), groups them by category, writes 1–2 line summaries from
 * the items' own data, has a separate verifier reject anything wrong, and
 * publishes /digest/<date> (+ /hi, /te), RSS, RAG, share cards and the
 * subscriber email / WhatsApp.
 */

export const DIGEST_LOCALES = ['en', 'hi', 'te'] as const
export type DigestLocale = (typeof DIGEST_LOCALES)[number]
export const isDigestLocale = (v: unknown): v is DigestLocale => typeof v === 'string' && (DIGEST_LOCALES as readonly string[]).includes(v)

/** Normalised category of one item. Display order of the digest sections. */
export const DIGEST_CATEGORIES = ['hackathon', 'ctf', 'datathon', 'conference', 'contest', 'codeathon', 'news', 'learn', 'platform'] as const
export type DigestCategory = (typeof DIGEST_CATEGORIES)[number]
export const isDigestCategory = (v: unknown): v is DigestCategory => typeof v === 'string' && (DIGEST_CATEGORIES as readonly string[]).includes(v)

/** Quota buckets (so one type can't take the whole digest). */
export const DIGEST_GROUPS = ['events', 'news', 'learn', 'contests'] as const
export type DigestGroup = (typeof DIGEST_GROUPS)[number]

export const GROUP_OF: Record<DigestCategory, DigestGroup> = {
  hackathon: 'events', ctf: 'events', datathon: 'events', conference: 'events',
  contest: 'contests', codeathon: 'contests', platform: 'contests',
  news: 'news', learn: 'learn',
}

export type DigestRegion = 'india' | 'global' | 'other'
export type DigestMode = 'online' | 'in_person' | 'hybrid'

/** One item the aggregator collected, normalised for ranking (pure output of lib/digest/candidates). */
export interface DigestCandidate {
  /** Social queue key `${type}:${ref_id}` — stable across days. */
  key: string
  /** Social queue type it came from (event, news, learn, contest, …). */
  source_type: string
  ref_id: string
  category: DigestCategory
  group: DigestGroup
  /** News topic id, Learn category id, or the event's first theme. */
  topic: string | null
  title: string
  /** The source's own short summary (our wording for events / news). */
  summary: string
  /** Our public page for the item (absolute). */
  url: string
  /** The organiser / publisher page (registration, original article), if any. */
  source_url: string | null
  /** Feed / publisher id ('devpost', 'aws-news', 'codespectra', …). */
  source: string
  /** Credit line shown on the card ("Devpost", "AWS News Blog", "CodeSpectra"). */
  source_name: string
  /** 0–1: own content 1, official / primary sources high, aggregators lower. */
  trust: number
  region: DigestRegion
  country: string | null
  city: string | null
  mode: DigestMode | null
  starts_at: string | null
  ends_at: string | null
  deadline: string | null
  prize_text: string | null
  /** Rough USD minor units (sorting only). */
  prize_usd_minor: number | null
  organiser: string | null
  level: string | null
  /** When it went live / we first saw it (ISO). */
  published_at: string
  /** Content languages available (Learn translations); everything has 'en'. */
  languages: DigestLocale[]
  engagement: { views: number; saves: number; clicks: number }
  student_friendly: boolean
  /** Third-party text (fed to the prompt guard before any model call). */
  third_party: boolean
}

export interface ScoreParts {
  freshness: number
  deadline: number
  prize: number
  trust: number
  relevance: number
  engagement: number
  language: number
}

export interface ScoredCandidate extends DigestCandidate {
  score: number
  parts: ScoreParts
}

/** Summary of one item in one language. */
export interface DigestSummary {
  text: string
  /** Written by the model (true) or the template (false). */
  ai: boolean
}

/** An item as published in a digest. */
export interface DigestItem extends ScoredCandidate {
  rank: number
  summaries: Partial<Record<DigestLocale, DigestSummary>>
}

export type DigestStatus = 'published' | 'review' | 'unpublished'

export interface DigestDoc {
  /** `dg_<YYYY-MM-DD>` */
  id: string
  /** Local calendar day in the digest timezone. */
  date: string
  timezone: string
  status: DigestStatus
  items: DigestItem[]
  /** Category counts, display order. */
  sections: { category: DigestCategory; count: number }[]
  /** 'ai' = model summaries; 'fallback' = deterministic ranking + template text only. */
  mode: 'ai' | 'fallback'
  run_id: string
  n_target: number
  created_at: string
  published_at: string | null
  updated_at: string
  /** Social queue ids of the share entries (whole digest + per category). */
  social_ids?: string[]
}

export type RejectReason =
  | 'closed' // registration / event already over
  | 'stale' // too old for a daily digest
  | 'missing_facts' // no usable date / title / link
  | 'broken_link' // our page or the source page is gone
  | 'duplicate' // near-duplicate of a picked item
  | 'repeat' // featured in a recent digest (and not closing soon)
  | 'flagged' // third-party text tripped the prompt guard
  | 'gone' // no longer published at the source

/** Reasons that only concern the drafted summary (the item stays; the template summary replaces it). */
export type SummaryIssue = 'invented_facts' | 'has_url' | 'too_long' | 'empty'

export interface VerifyResult {
  key: string
  ok: boolean
  reasons: RejectReason[]
  summary_issues: Partial<Record<DigestLocale, SummaryIssue[]>>
}

export type RunTrigger = 'schedule' | 'bootstrap' | 'admin' | 'agent' | 'preview'
export type RunStatus = 'running' | 'published' | 'review' | 'preview' | 'empty' | 'failed' | 'skipped'

export interface TraceStep {
  agent: 'curator' | 'verifier' | 'system'
  tool: string
  /** Short, log-safe note (counts, keys, reasons — no third-party text). */
  note: string
  at: string
}

export interface DigestRunDoc {
  id: string
  date: string
  trigger: RunTrigger
  status: RunStatus
  mode: 'ai' | 'fallback'
  iterations: number
  candidates: number
  selected: number
  verified: number
  rejected: { key: string; reasons: string[] }[]
  ai_calls: number
  fallback_reason: string | null
  message: string
  trace: TraceStep[]
  started_at: string
  finished_at: string | null
  by: string | null
}

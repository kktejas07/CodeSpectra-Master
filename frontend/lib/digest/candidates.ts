/**
 * Digest candidates — the aggregator's "candidate view" (pure, no I/O).
 *
 * The pool is the Social studio queue (every published event, news story,
 * Learn post, contest, hackathon, codeathon, certification and company test,
 * kept fresh every 30 minutes plus the publish hooks) enriched with the
 * source rows the queue doesn't copy: the events-feed kind / country / prize
 * in USD / organiser link, the news topic + trusted feed, Learn category +
 * translations, and engagement (views / saves / share clicks).
 *
 *   toCandidate(queueDoc, enrichment, now) → DigestCandidate | null
 */
import { SIGNAL_FEEDS, isNewsTopic } from '@/lib/signals/feeds'
import { isStudentFriendly } from '@/lib/events-feed/public'
import type { SocialFacts } from '@/lib/social/types'
import { GROUP_OF, type DigestCandidate, type DigestCategory, type DigestLocale, type DigestMode, type DigestRegion } from './types'

/** What the pool row looks like (a SocialQueueDoc subset). */
export interface PoolRow {
  id?: string
  key: string
  type: string
  ref_id: string
  title: string
  summary: string
  url: string
  source: string
  facts: SocialFacts
  published_at: string
}

/** Extra fields from the item's own collection (all optional). */
export interface Enrichment {
  /** events_feed: kind, organiser url, country, prize USD, source, status. */
  feed?: {
    kind?: string | null; url?: string | null; country?: string | null; city?: string | null; mode?: string | null; source?: string | null
    prize_usd_minor?: number | null; status?: string | null; internal?: boolean; themes?: string[]; organiser?: string | null
  }
  /** blog_posts (news): tags (topic + feed id) and the original article links. */
  news?: { tags?: string[]; source_urls?: string[]; status?: string | null }
  /** learn_posts: category + translations available. */
  learn?: { category?: string | null; locales?: string[]; status?: string | null }
  engagement?: { views?: number; saves?: number; clicks?: number }
}

const EVENT_KIND_CATEGORY: Record<string, DigestCategory> = {
  hackathon: 'hackathon', buildathon: 'hackathon', ideathon: 'hackathon', promptathon: 'hackathon', design_jam: 'hackathon', open_source: 'hackathon',
  ctf: 'ctf', datathon: 'datathon', conference: 'conference',
  codeathon: 'codeathon', debugathon: 'codeathon', code_golf: 'codeathon', competition: 'contest',
}

/** Events-feed sources we trust as primary listings (organiser platforms / official APIs). */
const FEED_TRUST: Record<string, number> = {
  internal: 1, devpost: 0.85, mlh: 0.9, devfolio: 0.85, unstop: 0.8, hackerearth: 0.8, codechef: 0.9, codeforces: 0.9,
  leetcode: 0.9, kaggle: 0.9, ctftime: 0.85, hackclub: 0.8, jsonld: 0.6, simulated: 0.1,
}

const INDIA_CITIES = /\b(bengaluru|bangalore|hyderabad|mumbai|pune|chennai|delhi|new delhi|noida|gurugram|gurgaon|kolkata|ahmedabad|kochi|jaipur|chandigarh|indore|coimbatore|vizag|visakhapatnam|warangal|vijayawada|bhubaneswar|lucknow|mysuru|mysore|trivandrum|thiruvananthapuram)\b/i

const clip = (s: unknown, n: number): string => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, n) : '')
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0)
const isoOrNull = (v: unknown): string | null => {
  if (typeof v !== 'string' || !v) return null
  const t = Date.parse(v)
  return Number.isFinite(t) ? new Date(t).toISOString() : null
}
const httpUrl = (v: unknown): string | null => (typeof v === 'string' && /^https?:\/\/[^\s]+$/i.test(v.trim()) ? v.trim().slice(0, 1000) : null)

/** Feed id carried in a news post's tags (the first one that is a known feed). */
export function newsFeedOf(tags: readonly string[] | undefined): (typeof SIGNAL_FEEDS)[number] | null {
  for (const t of tags || []) {
    const f = SIGNAL_FEEDS.find((x) => x.id === t)
    if (f) return f
  }
  return null
}

/** News topic id from `news:<topic>` tags, else the feed's topic, else 'industry' (pure). */
export function newsTopicFromTags(tags: readonly string[] | undefined): string {
  for (const t of tags || []) if (t.startsWith('news:') && isNewsTopic(t.slice(5))) return t.slice(5)
  return newsFeedOf(tags)?.topic ?? 'industry'
}

export function regionOf(country: string | null, city: string | null, mode: DigestMode | null): DigestRegion {
  if ((country || '').toUpperCase() === 'IN' || (city && INDIA_CITIES.test(city))) return 'india'
  if (mode === 'online' || (!country && !city)) return 'global'
  return 'other'
}

const modeOf = (v: unknown): DigestMode | null => {
  const s = String(v || '').toLowerCase().replace(/[-\s]/g, '_')
  if (s === 'online' || s === 'virtual') return 'online'
  if (s === 'in_person' || s === 'offline') return 'in_person'
  if (s === 'hybrid') return 'hybrid'
  return null
}

function categoryOf(row: PoolRow, e: Enrichment): DigestCategory | null {
  switch (row.type) {
    case 'event': return EVENT_KIND_CATEGORY[String(e.feed?.kind || '')] ?? 'hackathon'
    case 'hackathon': return 'hackathon'
    case 'codeathon': return 'codeathon'
    case 'contest': return 'contest'
    case 'news': return 'news'
    case 'learn': return 'learn'
    case 'certification':
    case 'company_test': return 'platform'
    default: return null // roundups / digests are never candidates
  }
}

function trustOf(row: PoolRow, e: Enrichment): number {
  if (row.source === 'codespectra' || row.source === 'learn' || row.source === 'team') return 1
  if (row.type === 'news') return newsFeedOf(e.news?.tags)?.trusted ? 0.9 : 0.6
  if (row.type === 'event') {
    const src = String(e.feed?.source || row.source || '')
    if (e.feed?.internal) return 1
    if (src in FEED_TRUST) return FEED_TRUST[src]
    return src.startsWith('rss:') || src.startsWith('ical:') ? 0.5 : 0.6
  }
  return 0.7
}

function sourceName(row: PoolRow, e: Enrichment): string {
  if (row.type === 'news') return newsFeedOf(e.news?.tags)?.name || 'CodeSpectra news'
  if (row.source === 'codespectra' || row.source === 'learn' || row.source === 'team') return 'CodeSpectra'
  const s = String(e.feed?.source || row.source || '')
  if (s.startsWith('rss:') || s.startsWith('ical:')) return clip(e.feed?.organiser || row.facts.organiser, 60) || 'Events feed'
  return s ? s[0].toUpperCase() + s.slice(1) : 'Events feed'
}

/**
 * One pool row → candidate, or null when it can't be in a digest (roundups,
 * hidden / unpublished at the source, no title / link). Pure.
 */
export function toCandidate(row: PoolRow, e: Enrichment, now: Date): DigestCandidate | null {
  if (!row?.key || !row.title?.trim() || !httpUrl(row.url)) return null
  if (e.feed?.status && e.feed.status !== 'published') return null
  if (e.news?.status && e.news.status !== 'published') return null
  if (e.learn?.status && e.learn.status !== 'published') return null
  const category = categoryOf(row, e)
  if (!category) return null
  const f = row.facts || {}
  const mode = modeOf(e.feed?.mode ?? f.mode)
  const country = clip(e.feed?.country, 2).toUpperCase() || null
  const city = clip(e.feed?.city ?? f.city, 60) || null
  const languages: DigestLocale[] = ['en']
  for (const l of e.learn?.locales || []) if ((l === 'hi' || l === 'te') && !languages.includes(l)) languages.push(l)
  const topic = category === 'news' ? newsTopicFromTags(e.news?.tags)
    : category === 'learn' ? (clip(e.learn?.category, 40) || null)
    : (clip((e.feed?.themes || f.tags || [])[0], 40) || null)
  const sourceUrl = row.type === 'event' ? httpUrl(e.feed?.url) : row.type === 'news' ? httpUrl((e.news?.source_urls || [])[0]) : null
  const published = isoOrNull(row.published_at) || now.toISOString()
  const organiser = clip(e.feed?.organiser ?? f.organiser, 80) || null
  const themes = e.feed?.themes || f.tags || []
  return {
    key: row.key,
    source_type: row.type,
    ref_id: row.ref_id,
    category,
    group: GROUP_OF[category],
    topic,
    title: clip(row.title, 200),
    summary: clip(row.summary, 400),
    url: row.url,
    source_url: sourceUrl,
    source: clip(row.type === 'news' ? newsFeedOf(e.news?.tags)?.id || row.source : e.feed?.source || row.source, 60) || 'codespectra',
    source_name: sourceName(row, e),
    trust: trustOf(row, e),
    region: regionOf(country, city, mode),
    country,
    city,
    mode,
    starts_at: isoOrNull(f.starts_at),
    ends_at: isoOrNull(f.ends_at),
    deadline: isoOrNull(f.deadline),
    prize_text: clip(f.prize, 80) || null,
    prize_usd_minor: num(e.feed?.prize_usd_minor) || null,
    organiser,
    level: clip(f.level, 30) || null,
    published_at: published,
    languages,
    engagement: { views: num(e.engagement?.views), saves: num(e.engagement?.saves), clicks: num(e.engagement?.clicks) },
    student_friendly: row.type === 'event'
      ? isStudentFriendly({ title: row.title, organiser, themes, source: String(e.feed?.source || row.source), internal: e.feed?.internal })
      : row.source === 'codespectra' || category === 'learn',
    third_party: row.type === 'event' ? !e.feed?.internal : row.type === 'news',
  }
}

/** Candidate facts as text — the ONLY data a summary may use (pure). */
export function candidateFactsText(c: Pick<DigestCandidate, 'title' | 'summary' | 'category' | 'topic' | 'starts_at' | 'ends_at' | 'deadline' | 'prize_text' | 'mode' | 'city' | 'country' | 'organiser' | 'level' | 'source_name'>): string {
  const d = (v: string | null) => (v ? new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '')
  const lines = [`category: ${c.category}`, `title: ${c.title}`]
  if (c.topic) lines.push(`topic: ${c.topic}`)
  if (c.summary) lines.push(`summary: ${c.summary}`)
  if (c.starts_at) lines.push(`starts: ${d(c.starts_at)}`)
  if (c.ends_at) lines.push(`ends: ${d(c.ends_at)}`)
  if (c.deadline) lines.push(`register by: ${d(c.deadline)}`)
  if (c.prize_text) lines.push(`prizes: ${c.prize_text}`)
  if (c.mode) lines.push(`mode: ${c.mode.replace('_', ' ')}`)
  if (c.city) lines.push(`city: ${c.city}`)
  if (c.country) lines.push(`country: ${c.country}`)
  if (c.organiser) lines.push(`organiser: ${c.organiser}`)
  if (c.level) lines.push(`level: ${c.level}`)
  lines.push(`source: ${c.source_name}`)
  return lines.join('\n')
}

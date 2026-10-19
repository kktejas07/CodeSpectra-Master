/**
 * SEO / GEO settings (Admin → Settings → SEO & AI search). Client-safe:
 * types, defaults and the validating merge used by both the API and the UI.
 * Stored in `platform_settings` under key `seo`.
 */

/** AI crawlers we publish an explicit robots.txt policy for. */
export const AI_CRAWLERS = [
  { id: 'GPTBot', owner: 'OpenAI', purpose: 'Model training' },
  { id: 'OAI-SearchBot', owner: 'OpenAI', purpose: 'ChatGPT search results' },
  { id: 'ChatGPT-User', owner: 'OpenAI', purpose: 'Pages fetched when a ChatGPT user asks' },
  { id: 'PerplexityBot', owner: 'Perplexity', purpose: 'Perplexity search index' },
  { id: 'ClaudeBot', owner: 'Anthropic', purpose: 'Model training' },
  { id: 'Claude-SearchBot', owner: 'Anthropic', purpose: 'Claude search results' },
  { id: 'Claude-User', owner: 'Anthropic', purpose: 'Pages fetched when a Claude user asks' },
  { id: 'Google-Extended', owner: 'Google', purpose: 'Gemini training and grounding' },
  { id: 'Applebot-Extended', owner: 'Apple', purpose: 'Apple Intelligence training' },
  { id: 'CCBot', owner: 'Common Crawl', purpose: 'Open web corpus used by many models' },
] as const

export type AiCrawlerId = (typeof AI_CRAWLERS)[number]['id']

export interface ComparisonRow {
  feature: string
  codespectra: string
  competitor: string
}

/** "CodeSpectra vs X" page. Admin-written; never generated with invented claims. */
export interface ComparisonPage {
  slug: string
  competitor: string
  /** Answer-first summary shown at the top (2–3 sentences). */
  summary: string
  rows: ComparisonRow[]
  /** Who each product suits best — plain text. */
  best_for_codespectra: string
  best_for_competitor: string
  /** Where the competitor facts come from (their pricing / docs pages). */
  sources: string[]
  published: boolean
  updated_at: string
}

export interface EditorialMember {
  name: string
  role: string
  bio: string
  url: string
}

export interface SeoSettings {
  site_url: string
  default_og_image: string
  /** sameAs links: LinkedIn, GitHub, X, YouTube… */
  social_profiles: string[]
  organization: {
    legal_name: string
    logo_url: string
    email: string
    /** "City, Region, CC" lines — shown on About and in Organization schema. */
    locations: string[]
    founding_year: string
  }
  /** true = allowed to crawl public pages. */
  ai_crawlers: Record<AiCrawlerId, boolean>
  indexnow_enabled: boolean
  indexnow_key: string
  verification: { google: string; bing: string; yandex: string }
  editorial_team: EditorialMember[]
  comparisons: ComparisonPage[]
}

export const DEFAULT_SEO_SETTINGS: SeoSettings = {
  site_url: '',
  default_og_image: '',
  social_profiles: [],
  organization: {
    legal_name: 'CodeSpectra',
    logo_url: '',
    email: '',
    locations: ['Hyderabad, Telangana, IN', 'Princeton, NJ, US'],
    founding_year: '',
  },
  ai_crawlers: Object.fromEntries(AI_CRAWLERS.map((c) => [c.id, true])) as Record<AiCrawlerId, boolean>,
  indexnow_enabled: false,
  indexnow_key: '',
  verification: { google: '', bing: '', yandex: '' },
  editorial_team: [],
  comparisons: [],
}

const str = (v: unknown, max = 500): string => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const isHttpUrl = (v: string) => /^https?:\/\/[^\s]+$/i.test(v)
const urlOrEmpty = (v: unknown): string => {
  const s = str(v, 1000)
  return s && (isHttpUrl(s) || s.startsWith('/')) ? s : ''
}
const strList = (v: unknown, maxItems: number, maxLen = 300): string[] =>
  Array.isArray(v) ? v.map((x) => str(x, maxLen)).filter(Boolean).slice(0, maxItems) : []

export function slugifyComparison(v: string): string {
  return v.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)
}

/** IndexNow keys: 8–128 chars of a-z, A-Z, 0-9 and dashes (protocol rule). */
export function isValidIndexNowKey(k: string): boolean {
  return /^[a-zA-Z0-9-]{8,128}$/.test(k)
}

/** Validate + merge untrusted input over defaults (never throws). */
export function mergeSeoSettings(raw: unknown): SeoSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const d = DEFAULT_SEO_SETTINGS
  const org = (r.organization && typeof r.organization === 'object' ? r.organization : {}) as Record<string, unknown>
  const ver = (r.verification && typeof r.verification === 'object' ? r.verification : {}) as Record<string, unknown>
  const ai = (r.ai_crawlers && typeof r.ai_crawlers === 'object' ? r.ai_crawlers : {}) as Record<string, unknown>
  const key = str(r.indexnow_key, 128)
  const verificationCode = (v: unknown) => str(v, 200).replace(/[^a-zA-Z0-9_\-=.:]/g, '')

  const comparisons: ComparisonPage[] = []
  if (Array.isArray(r.comparisons)) {
    const seen = new Set<string>()
    for (const c of r.comparisons.slice(0, 50)) {
      if (!c || typeof c !== 'object') continue
      const o = c as Record<string, unknown>
      const competitor = str(o.competitor, 80)
      const slug = slugifyComparison(str(o.slug, 80) || competitor)
      if (!competitor || !slug || seen.has(slug)) continue
      seen.add(slug)
      const rows = Array.isArray(o.rows)
        ? o.rows.slice(0, 40).map((x) => {
            const rr = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
            return { feature: str(rr.feature, 120), codespectra: str(rr.codespectra, 300), competitor: str(rr.competitor, 300) }
          }).filter((x) => x.feature)
        : []
      comparisons.push({
        slug,
        competitor,
        summary: str(o.summary, 600),
        rows,
        best_for_codespectra: str(o.best_for_codespectra, 400),
        best_for_competitor: str(o.best_for_competitor, 400),
        sources: strList(o.sources, 10, 500).filter(isHttpUrl),
        published: o.published === true,
        updated_at: str(o.updated_at, 40) || new Date().toISOString(),
      })
    }
  }

  const team: EditorialMember[] = Array.isArray(r.editorial_team)
    ? r.editorial_team.slice(0, 20).map((m) => {
        const o = (m && typeof m === 'object' ? m : {}) as Record<string, unknown>
        return { name: str(o.name, 80), role: str(o.role, 80), bio: str(o.bio, 500), url: urlOrEmpty(o.url) }
      }).filter((m) => m.name)
    : []

  return {
    site_url: urlOrEmpty(r.site_url).startsWith('http') ? urlOrEmpty(r.site_url) : '',
    default_og_image: urlOrEmpty(r.default_og_image),
    social_profiles: strList(r.social_profiles, 12, 500).filter(isHttpUrl),
    organization: {
      legal_name: str(org.legal_name, 120) || d.organization.legal_name,
      logo_url: urlOrEmpty(org.logo_url),
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str(org.email, 200)) ? str(org.email, 200) : '',
      locations: Array.isArray(org.locations) ? strList(org.locations, 10, 120) : d.organization.locations,
      founding_year: /^\d{4}$/.test(str(org.founding_year, 4)) ? str(org.founding_year, 4) : '',
    },
    ai_crawlers: Object.fromEntries(
      Object.keys(d.ai_crawlers).map((id) => [id, typeof ai[id] === 'boolean' ? (ai[id] as boolean) : true]),
    ) as Record<AiCrawlerId, boolean>,
    indexnow_enabled: r.indexnow_enabled === true && isValidIndexNowKey(key),
    indexnow_key: isValidIndexNowKey(key) ? key : '',
    verification: { google: verificationCode(ver.google), bing: verificationCode(ver.bing), yandex: verificationCode(ver.yandex) },
    editorial_team: team,
    comparisons,
  }
}

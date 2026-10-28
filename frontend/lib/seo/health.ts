/**
 * SEO health report for Admin → Settings → SEO & AI search: static pages
 * with weak titles/descriptions or missing schema, content items that can't
 * produce valid structured data (jobs without a location country, events
 * without dates…), sitemap counts and setup gaps. Pure checks + one loader.
 */
import { buildMetadata, DESCRIPTION_MAX, pageTitle, TITLE_MAX } from './metadata'
import { jobPostingJsonLd, validateJsonLd, type JobInput } from './jsonld'
import { PUBLIC_ROUTES, type PublicRoute } from './public-routes'
import type { SeoSettings } from './settings-shared'
import { AI_CRAWLERS } from './settings-shared'
import { SITEMAP_TYPES, type SitemapType } from './sitemap'

export type Severity = 'error' | 'warning' | 'info'
export interface HealthIssue { severity: Severity; area: string; item: string; message: string; href?: string }

export interface HealthReport {
  generated_at: string
  site_url: string
  site_url_source: 'admin' | 'env' | 'default'
  pages: { path: string; title: string; title_length: number; description_length: number; has_og: boolean; schema: string[] }[]
  sitemaps: Record<SitemapType, number>
  issues: HealthIssue[]
  score: number
}

/** Pure: checks for one registered static page. */
export function checkStaticPage(r: PublicRoute): HealthIssue[] {
  const out: HealthIssue[] = []
  const meta = buildMetadata({ title: r.title, description: r.description, path: r.path })
  const title = pageTitle(r.title)
  if (title.length > TITLE_MAX) out.push({ severity: 'warning', area: 'Titles', item: r.path, message: `Title is ${title.length} characters (max ${TITLE_MAX}).`, href: r.path })
  if (r.description.length < 70) out.push({ severity: 'warning', area: 'Descriptions', item: r.path, message: `Description is short (${r.description.length} chars); aim for 120–160.`, href: r.path })
  if (r.description.length > DESCRIPTION_MAX) out.push({ severity: 'info', area: 'Descriptions', item: r.path, message: `Description is ${r.description.length} characters and will be cut to ${DESCRIPTION_MAX}.`, href: r.path })
  if (!meta.openGraph?.images) out.push({ severity: 'error', area: 'Social cards', item: r.path, message: 'No Open Graph image.', href: r.path })
  if (!r.schema.length && r.group === 'pages') out.push({ severity: 'info', area: 'Structured data', item: r.path, message: 'No structured data beyond the site-wide Organization/WebSite.', href: r.path })
  return out
}

/** Pure: JobPosting problems for one job (Google for Jobs eligibility). */
export function checkJob(job: JobInput, site: string): HealthIssue | null {
  const missing = validateJsonLd(jobPostingJsonLd(job, site))
  if (!job.description?.trim()) missing.push('description text')
  if (!missing.length) return null
  return { severity: 'error', area: 'Jobs (Google for Jobs)', item: job.title || job.id, message: `Missing: ${[...new Set(missing)].join(', ')}. Add a city and country (or "Remote, India") to the job location.`, href: `/jobs/${job.id}` }
}

/** Pure: setup gaps from settings. */
export function checkSettings(s: SeoSettings, siteSource: HealthReport['site_url_source']): HealthIssue[] {
  const out: HealthIssue[] = []
  if (siteSource === 'default') out.push({ severity: 'info', area: 'Setup', item: 'Site URL', message: 'Using the default https://codespectra.ai. Set NEXT_PUBLIC_SITE_URL or the Site URL field if production uses another domain.' })
  if (!s.verification.google) out.push({ severity: 'warning', area: 'Setup', item: 'Google Search Console', message: 'No Google verification code (or verify the domain by DNS instead).' })
  if (!s.verification.bing) out.push({ severity: 'warning', area: 'Setup', item: 'Bing Webmaster Tools', message: 'No Bing verification code. Bing powers ChatGPT search and Copilot answers.' })
  if (!s.indexnow_enabled) out.push({ severity: 'warning', area: 'Setup', item: 'IndexNow', message: 'IndexNow is off, so Bing/Yandex learn about new posts, jobs and events only by crawling.' })
  if (!s.social_profiles.length) out.push({ severity: 'warning', area: 'Entity', item: 'Social profiles', message: 'No sameAs profiles (LinkedIn, GitHub, X). They help search engines and AI assistants identify the company.' })
  if (!s.editorial_team.length) out.push({ severity: 'info', area: 'E-E-A-T', item: 'Editorial team', message: 'No named editors on /editorial-policy. Named, accountable authors strengthen trust signals.' })
  const blocked = AI_CRAWLERS.filter((c) => s.ai_crawlers[c.id] === false).map((c) => c.id)
  if (blocked.length) out.push({ severity: 'info', area: 'AI crawlers', item: blocked.join(', '), message: 'Blocked in robots.txt: these assistants cannot read or cite public pages.' })
  return out
}

export function scoreIssues(issues: HealthIssue[]): number {
  const penalty = issues.reduce((n, i) => n + (i.severity === 'error' ? 6 : i.severity === 'warning' ? 3 : 0.5), 0)
  return Math.max(0, Math.round(100 - penalty))
}

export async function buildHealthReport(): Promise<HealthReport> {
  const { getSeoSettings } = await import('./settings')
  const { DEFAULT_SITE_URL, normaliseOrigin, resolveSiteUrl } = await import('./site')
  const { loadSitemapEntries } = await import('./sitemap')
  const s = await getSeoSettings()
  const site = resolveSiteUrl(s.site_url)
  const adminOrigin = normaliseOrigin(s.site_url)
  const source: HealthReport['site_url_source'] = adminOrigin && site === adminOrigin ? 'admin' : site !== DEFAULT_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL ? 'env' : 'default'

  const issues: HealthIssue[] = [...checkSettings(s, source)]
  const pages = PUBLIC_ROUTES.map((r) => {
    issues.push(...checkStaticPage(r))
    return { path: r.path, title: pageTitle(r.title), title_length: pageTitle(r.title).length, description_length: r.description.length, has_og: true, schema: r.schema }
  })

  const counts = Object.fromEntries(await Promise.all(SITEMAP_TYPES.map(async (t) => [t, (await loadSitemapEntries(t)).length] as const))) as Record<SitemapType, number>

  // Content checks (each best-effort).
  try {
    const { getMongoDb } = await import('@/lib/mongodb')
    const db = await getMongoDb()
    const jobs = (await db.collection('job_postings').find({ is_active: true }, { projection: { _id: 0, created_by: 0, tenant_id: 0 } }).limit(500).toArray()) as unknown as JobInput[]
    for (const j of jobs) {
      const issue = checkJob(j, site)
      if (issue) issues.push(issue)
    }
    const undated = await db.collection('events_feed').countDocuments({ status: 'published', starts_at: null }).catch(() => 0)
    if (undated) issues.push({ severity: 'warning', area: 'Events', item: `${undated} event(s)`, message: 'Published without a start date, so they get no Event rich result.', href: '/dashboard/admin/events-feed' })
    const thin = await db.collection('learn_posts').countDocuments({ status: 'published', $expr: { $lt: [{ $strLenCP: { $ifNull: ['$summary', ''] } }, 50] } }).catch(() => 0)
    if (thin) issues.push({ severity: 'warning', area: 'Learn', item: `${thin} post(s)`, message: 'Summary under 50 characters (used as meta description and answer-first summary).', href: '/dashboard/admin/learn' })
    const noImg = await db.collection('mkt_products').countDocuments({ status: 'published', $or: [{ images: { $size: 0 } }, { images: { $exists: false } }] }).catch(() => 0)
    if (noImg) issues.push({ severity: 'warning', area: 'Marketplace', item: `${noImg} item(s)`, message: 'Published without a photo: no image in Product results or link previews.', href: '/dashboard/admin/marketplace' })
    const noDesc = await db.collection('hackathons').countDocuments({ status: { $in: ['open', 'live'] }, $or: [{ description: { $exists: false } }, { description: '' }] }).catch(() => 0)
    if (noDesc) issues.push({ severity: 'info', area: 'Hackathons', item: `${noDesc} event(s)`, message: 'No description: the meta description falls back to generic text.', href: '/dashboard/admin/hackathons' })
  } catch {
    issues.push({ severity: 'info', area: 'Content', item: 'Database', message: 'Content checks skipped: database unavailable.' })
  }

  return { generated_at: new Date().toISOString(), site_url: site, site_url_source: source, pages, sitemaps: counts, issues, score: scoreIssues(issues) }
}

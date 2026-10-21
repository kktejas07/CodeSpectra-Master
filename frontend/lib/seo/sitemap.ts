/**
 * Sitemap index + per-type sitemaps.
 *
 *   /sitemap.xml                 → <sitemapindex> listing every type below
 *   /sitemaps/<type>.xml         → <urlset> for one content type
 *
 * lastmod is always a real date: the page registry's `updated` for static
 * pages, `updated_at` / `published_at` for content. Never "now".
 * Pure XML builders + server loaders (each loader swallows DB errors and
 * returns [] so one failing source never breaks the others).
 */
import { escapeHtml } from '@/lib/safe-html'
import { PUBLIC_ROUTES } from './public-routes'
import { PREFIXED_LOCALES, isLocalizedPath, localizedPath, sitemapAlternates } from '@/lib/i18n/public-paths'

export const SITEMAP_TYPES = ['pages', 'legal', 'learn', 'news', 'docs', 'events', 'jobs', 'hackathons', 'marketplace', 'companies', 'compare'] as const
export type SitemapType = (typeof SITEMAP_TYPES)[number]

export interface SitemapEntry {
  path: string
  lastmod?: string | null
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never'
  priority?: number
}

/** Max URLs per sitemap file (protocol limit is 50 000; we stay well below). */
export const MAX_URLS = 45_000

export function isSitemapType(v: string): v is SitemapType {
  return (SITEMAP_TYPES as readonly string[]).includes(v)
}

function isoDate(v: string | Date | null | undefined): string | null {
  if (!v) return null
  const t = typeof v === 'string' ? Date.parse(v) : v.getTime()
  return Number.isFinite(t) ? new Date(t).toISOString() : null
}

const enc = (path: string) => path.split('/').map((seg) => (seg ? encodeURIComponent(decodeURIComponent(seg)) : seg)).join('/')

export function buildUrlsetXml(entries: SitemapEntry[], site: string): string {
  const seen = new Set<string>()
  const rows: string[] = []
  let xhtml = false
  for (const e of entries.slice(0, MAX_URLS)) {
    const loc = `${site}${enc(e.path)}`
    if (seen.has(loc)) continue
    seen.add(loc)
    const lastmod = isoDate(e.lastmod)
    // Pages with Hindi / Telugu copies list every language (Google's sitemap hreflang form).
    const alts = sitemapAlternates(e.path, site)
    if (alts.length) xhtml = true
    const altXml = alts.map((a) => `<xhtml:link rel="alternate" hreflang="${a.hreflang}" href="${escapeHtml(`${site}${enc(a.href.slice(site.length))}`)}"/>`).join('')
    rows.push(
      `  <url><loc>${escapeHtml(loc)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}${e.changefreq ? `<changefreq>${e.changefreq}</changefreq>` : ''}${e.priority != null ? `<priority>${e.priority.toFixed(1)}</priority>` : ''}${altXml}</url>`,
    )
  }
  const ns = xhtml ? ' xmlns:xhtml="http://www.w3.org/1999/xhtml"' : ''
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${ns}>\n${rows.join('\n')}\n</urlset>\n`
}

/** Adds the /hi/… and /te/… copy after every page that has translations (same lastmod / priority). */
export function withLocalizedEntries(entries: SitemapEntry[]): SitemapEntry[] {
  const out: SitemapEntry[] = []
  for (const e of entries) {
    out.push(e)
    if (isLocalizedPath(e.path)) for (const l of PREFIXED_LOCALES) out.push({ ...e, path: localizedPath(e.path, l) })
  }
  return out
}

export function buildSitemapIndexXml(items: { type: SitemapType; lastmod?: string | null }[], site: string): string {
  const rows = items.map((i) => {
    const lastmod = isoDate(i.lastmod)
    return `  <sitemap><loc>${escapeHtml(`${site}/sitemaps/${i.type}.xml`)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</sitemap>`
  })
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join('\n')}\n</sitemapindex>\n`
}

/** Latest lastmod in a list (index lastmod for the type). */
export function latestLastmod(entries: SitemapEntry[]): string | null {
  let best = 0
  for (const e of entries) {
    const t = e.lastmod ? Date.parse(e.lastmod) : NaN
    if (Number.isFinite(t) && t > best) best = t
  }
  return best ? new Date(best).toISOString() : null
}

export function staticEntries(group: 'pages' | 'legal'): SitemapEntry[] {
  return PUBLIC_ROUTES.filter((r) => r.group === group && r.path !== '/compare').map((r) => ({
    path: r.path,
    lastmod: r.updated,
    changefreq: r.changefreq,
    priority: r.priority,
  }))
}

// ---------------------------------------------------------------------------
// Loaders (server only — dynamic imports keep this module test-friendly)
// ---------------------------------------------------------------------------

async function safe(fn: () => Promise<SitemapEntry[]>): Promise<SitemapEntry[]> {
  try {
    return await fn()
  } catch (e) {
    console.error('[seo/sitemap] source failed:', (e as Error)?.message)
    return []
  }
}

export async function loadSitemapEntries(type: SitemapType): Promise<SitemapEntry[]> {
  switch (type) {
    case 'pages':
    case 'legal':
      return withLocalizedEntries(staticEntries(type))
    case 'learn':
      return safe(async () => {
        const { latestPublished } = await import('@/lib/learn/queries')
        const { latestTeam } = await import('@/lib/learn/team-queries')
        // "From the team" posts (blog_posts, not news) live under /learn too; /blog/* 301s here.
        const [learn, team] = await Promise.all([latestPublished(MAX_URLS), latestTeam(MAX_URLS).catch(() => [])])
        return [
          ...learn.map((p) => ({ path: `/learn/${p.slug}`, lastmod: p.updated_at || p.published_at, changefreq: 'monthly' as const, priority: 0.7 })),
          ...team.map((p) => ({ path: `/learn/${p.slug}`, lastmod: p.updated_at || p.published_at, changefreq: 'monthly' as const, priority: 0.5 })),
        ].slice(0, MAX_URLS)
      })
    case 'news':
      return safe(async () => {
        const { newsPostsCol } = await import('@/lib/signals/store')
        const rows = await (await newsPostsCol()).find({ status: 'published', tags: 'signals' }, { projection: { _id: 0, slug: 1, updated_at: 1, published_at: 1 } }).sort({ published_at: -1 }).limit(MAX_URLS).toArray()
        return rows.map((p) => ({ path: `/news/${p.slug}`, lastmod: p.updated_at || p.published_at, changefreq: 'monthly', priority: 0.5 }))
      })
    case 'docs':
      return safe(async () => {
        const { docHref, getDocTree } = await import('@/lib/docs')
        const out: SitemapEntry[] = []
        for (const section of getDocTree()) for (const doc of section.docs) out.push({ path: docHref(doc), changefreq: 'monthly', priority: 0.6 })
        return out
      })
    case 'events':
      return safe(async () => {
        const { listPublishedFeed } = await import('@/lib/events-feed/query')
        const { getMongoDb } = await import('@/lib/mongodb')
        const events = await listPublishedFeed()
        // Internal hackathons canonicalise to /hackathons/<slug>, so they're listed there instead.
        const ids = events.filter((e) => !e.internal).map((e) => e.id)
        const docs = await (await getMongoDb()).collection('events_feed').find({ id: { $in: ids } }, { projection: { _id: 0, id: 1, updated_at: 1 } }).toArray().catch(() => [] as { id: string; updated_at?: string }[])
        const updated = new Map(docs.map((d) => [String(d.id), d.updated_at as string | undefined]))
        return ids.map((id) => ({ path: `/events/${id}`, lastmod: updated.get(id) || null, changefreq: 'weekly', priority: 0.6 }))
      })
    case 'jobs':
      return safe(async () => {
        const { getMongoDb } = await import('@/lib/mongodb')
        const rows = await (await getMongoDb()).collection('job_postings').find({ is_active: true }, { projection: { _id: 0, id: 1, updated_at: 1, created_at: 1 } }).sort({ created_at: -1 }).limit(MAX_URLS).toArray()
        return rows.map((j) => ({ path: `/jobs/${j.id}`, lastmod: (j.updated_at || j.created_at) as string, changefreq: 'daily', priority: 0.7 }))
      })
    case 'hackathons':
      return safe(async () => {
        const { hackathons } = await import('@/lib/db/qr-events')
        const rows = await (await hackathons()).find({ status: { $in: ['open', 'live', 'closed'] } }, { projection: { _id: 0, slug: 1, updated_at: 1, status: 1, results_released: 1 } }).sort({ starts_at: -1 }).limit(5000).toArray()
        const out: SitemapEntry[] = []
        for (const h of rows) {
          if (!h.slug) continue
          out.push({ path: `/hackathons/${h.slug}`, lastmod: h.updated_at, changefreq: h.status === 'closed' ? 'monthly' : 'daily', priority: 0.6 })
          if (h.results_released) out.push({ path: `/hackathons/${h.slug}/results`, lastmod: h.updated_at, changefreq: 'monthly', priority: 0.4 })
        }
        return out
      })
    case 'marketplace':
      return safe(async () => {
        const { approvedSellers } = await import('@/lib/marketplace/catalog')
        const { productsCol } = await import('@/lib/marketplace/db')
        const sellers = await approvedSellers()
        const rows = await (await productsCol()).find({ status: 'published', seller_id: { $in: [...sellers.keys()] } }, { projection: { _id: 0, slug: 1, updated_at: 1 } }).limit(MAX_URLS).toArray()
        const out: SitemapEntry[] = rows.map((p) => ({ path: `/marketplace/p/${p.slug}`, lastmod: p.updated_at, changefreq: 'weekly', priority: 0.6 }))
        for (const s of sellers.values()) out.push({ path: `/marketplace/s/${s.slug}`, lastmod: s.updated_at, changefreq: 'weekly', priority: 0.4 })
        // Verified mentors (lib/mentors): /mentors/<slug>.
        const { loadDirectory } = await import('@/lib/mentors/service')
        for (const m of await loadDirectory().catch(() => [])) out.push({ path: `/mentors/${m.slug}`, changefreq: 'weekly', priority: 0.5 })
        return out
      })
    case 'companies':
      return safe(async () => {
        const { COMPANY_CATALOG } = await import('@/lib/companies/company-catalog')
        return withLocalizedEntries(COMPANY_CATALOG.map((c) => ({ path: `/companies/${c.slug}`, changefreq: 'monthly' as const, priority: 0.5 })))
      })
    case 'compare':
      return safe(async () => {
        const { getSeoSettings } = await import('./settings')
        const s = await getSeoSettings()
        const pub = s.comparisons.filter((c) => c.published)
        if (!pub.length) return []
        return [{ path: '/compare', lastmod: latestLastmod(pub.map((c) => ({ path: '', lastmod: c.updated_at }))), changefreq: 'monthly', priority: 0.5 }, ...pub.map((c) => ({ path: `/compare/${c.slug}`, lastmod: c.updated_at, changefreq: 'monthly' as const, priority: 0.5 }))]
      })
  }
}

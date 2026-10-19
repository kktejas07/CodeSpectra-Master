import type { MetadataRoute } from 'next'
import { docHref, getDocTree } from '@/lib/docs'

// Re-generated hourly so newly published Learn posts appear.
export const revalidate = 3600

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://codespectra.ai'

const STATIC_ROUTES = [
  '/',
  '/features',
  '/pricing',
  '/about',
  '/contact',
  '/faq',
  '/support',
  '/blog',
  '/learn',
  '/hackathons',
  '/jobs',
  '/newsletter',
  '/status',
  '/docs',
]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()
  const entries: MetadataRoute.Sitemap = STATIC_ROUTES.map((path) => ({
    url: `${BASE_URL}${path}`,
    lastModified: now,
    changeFrequency: path === '/' ? 'daily' : 'weekly',
    priority: path === '/' ? 1 : 0.7,
  }))

  // Every public doc page gets discovered by search engines (user guides included —
  // all served content is public-safe by construction: only docs/public + docs/user).
  try {
    for (const section of getDocTree()) {
      for (const doc of section.docs) {
        entries.push({
          url: `${BASE_URL}${docHref(doc)}`,
          lastModified: now,
          changeFrequency: 'weekly',
          priority: 0.6,
        })
      }
    }
  } catch {
    // Docs mirror missing (fresh container pre-sync) — sitemap still serves statics.
  }

  // Published Learn hub posts (lib/learn).
  try {
    const { latestPublished } = await import('@/lib/learn/queries')
    for (const p of await latestPublished(5000)) {
      entries.push({
        url: `${BASE_URL}/learn/${encodeURIComponent(p.slug)}`,
        lastModified: p.updated_at || p.published_at || now,
        changeFrequency: 'monthly',
        priority: 0.6,
      })
    }
  } catch {
    // DB unavailable — statics and docs still serve.
  }

  // Marketplace storefront + published products (approved sellers only).
  try {
    const { approvedSellers } = await import('@/lib/marketplace/catalog')
    const { productsCol } = await import('@/lib/marketplace/db')
    const sellers = await approvedSellers()
    entries.push({ url: `${BASE_URL}/marketplace`, lastModified: now, changeFrequency: 'daily', priority: 0.7 })
    const rows = await (await productsCol()).find({ status: 'published', seller_id: { $in: [...sellers.keys()] } }, { projection: { _id: 0, slug: 1, updated_at: 1 } }).limit(5000).toArray()
    for (const p of rows) entries.push({ url: `${BASE_URL}/marketplace/p/${encodeURIComponent(p.slug)}`, lastModified: p.updated_at || now, changeFrequency: 'weekly', priority: 0.6 })
    for (const s of sellers.values()) entries.push({ url: `${BASE_URL}/marketplace/s/${encodeURIComponent(s.slug)}`, lastModified: s.updated_at || now, changeFrequency: 'weekly', priority: 0.5 })
  } catch {
    // DB unavailable — the rest of the sitemap still serves.
  }

  return entries
}

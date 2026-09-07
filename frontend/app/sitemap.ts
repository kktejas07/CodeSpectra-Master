import type { MetadataRoute } from 'next'
import { docHref, getDocTree } from '@/lib/docs'

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
  '/hackathons',
  '/jobs',
  '/newsletter',
  '/status',
  '/docs',
]

export default function sitemap(): MetadataRoute.Sitemap {
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

  return entries
}

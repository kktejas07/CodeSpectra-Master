import type { MetadataRoute } from 'next'
import { getSeoSettings, getSiteOrigin } from '@/lib/seo/settings'
import { buildRobots } from '@/lib/seo/robots'

// Reads the admin AI-crawler policy, so render per request (cached 60 s in lib/seo/settings).
export const dynamic = 'force-dynamic'

export default async function robots(): Promise<MetadataRoute.Robots> {
  const [settings, site] = await Promise.all([getSeoSettings(), getSiteOrigin()])
  return buildRobots(settings, site)
}

/**
 * robots.txt rules (pure). Public pages are open to every crawler; private,
 * token and app pages are disallowed; each AI crawler gets an explicit group
 * that follows the admin toggle (allowed by default).
 */
import type { MetadataRoute } from 'next'
import { AI_CRAWLERS, type SeoSettings } from './settings-shared'
import { ALLOWED_API_PATHS, DISALLOWED_PATHS } from './public-routes'

export function buildRobots(settings: Pick<SeoSettings, 'ai_crawlers'>, site: string): MetadataRoute.Robots {
  const rules: MetadataRoute.Robots['rules'] = [
    { userAgent: '*', allow: ['/', ...ALLOWED_API_PATHS], disallow: DISALLOWED_PATHS },
  ]
  for (const bot of AI_CRAWLERS) {
    const allowed = settings.ai_crawlers?.[bot.id] !== false
    rules.push(
      allowed
        ? { userAgent: bot.id, allow: ['/', ...ALLOWED_API_PATHS, '/llms.txt', '/llms-full.txt'], disallow: DISALLOWED_PATHS }
        : { userAgent: bot.id, disallow: '/' },
    )
  }
  return {
    rules,
    sitemap: `${site}/sitemap.xml`,
    host: site,
  }
}

/**
 * Server wrapper: reads the admin-configured third-party ids (validated) and
 * renders the client <AnalyticsRoot/>. Never fails the page.
 */
import { AnalyticsRoot } from './analytics-root'
import { publicConfigFrom, type PublicAnalyticsConfig } from '@/lib/analytics/integrations'

export async function AnalyticsMount() {
  let config: PublicAnalyticsConfig = {}
  try {
    const { readServerSecrets } = await import('@/lib/server-secrets-cache')
    config = publicConfigFrom((await readServerSecrets()) as Record<string, unknown>)
  } catch { /* no DB during static work — first-party analytics still runs */ }
  return <AnalyticsRoot config={config} />
}

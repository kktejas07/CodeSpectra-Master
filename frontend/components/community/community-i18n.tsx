/**
 * Area catalogs for pages outside /dashboard (public forum, LTI landing):
 * loads them in the page's own language (URL locale on /hi, /te, else
 * English) — never from a cookie, so the public pages stay cacheable.
 * tests/i18n-app-areas.test.ts reads the `areas={[…]}` list.
 */
import { loadAreaMessages } from '@/lib/i18n/area-load'
import type { AreaNamespace } from '@/lib/i18n/areas'
import type { Locale } from '@/lib/i18n/config'
import { I18nAreaProvider } from '@/lib/i18n/client'

export async function CommunityI18n({ areas, locale, children }: { areas: readonly AreaNamespace[]; locale: Locale; children: React.ReactNode }) {
  const messages = await loadAreaMessages(locale, areas)
  return <I18nAreaProvider messages={messages}>{children}</I18nAreaProvider>
}

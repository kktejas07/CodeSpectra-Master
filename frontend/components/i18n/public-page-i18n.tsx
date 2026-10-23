/**
 * SEO-031: adds one public page's client namespaces (`publicPages`, `learn`)
 * to the /hi /te layout's provider, so other pages don't carry them.
 * English pages read the bundled English catalog and need nothing.
 */
import { I18nAreaProvider } from '@/lib/i18n/client'
import type { Locale } from '@/lib/i18n/config'
import { publicPageMessages, type PublicPageNamespace } from '@/lib/i18n/public-server'

export function PublicPageI18n({ locale, ns, children }: { locale: Locale; ns: readonly PublicPageNamespace[]; children: React.ReactNode }) {
  if (locale === 'en') return <>{children}</>
  return <I18nAreaProvider messages={publicPageMessages(locale, ns)}>{children}</I18nAreaProvider>
}

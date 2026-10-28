/**
 * Area layout wrapper (server): loads one signed-in area's catalogs in the
 * request's language and merges them into the surrounding provider. Every
 * /dashboard/<area> segment layout renders this; tests/i18n-app-areas.test.ts
 * checks each page's components only use namespaces its layouts provide.
 */
import { cache } from 'react'
import { getRequestLocale } from '@/lib/i18n/server'
import { loadAreaMessages } from '@/lib/i18n/area-load'
import type { AreaNamespace } from '@/lib/i18n/areas'
import { I18nAreaProvider } from '@/lib/i18n/client'

const requestLocale = cache(() => getRequestLocale())

export async function AreaI18n({ ns, children }: { ns: readonly AreaNamespace[]; children: React.ReactNode }) {
  const locale = await requestLocale()
  const messages = await loadAreaMessages(locale, ns)
  return <I18nAreaProvider messages={messages}>{children}</I18nAreaProvider>
}

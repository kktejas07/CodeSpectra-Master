/**
 * Admin console language (server): the admin catalog in the request's
 * language, Hindi / Telugu completed with English, for lib/i18n/admin.tsx.
 */
import 'server-only'
import { getRequestLocale } from '@/lib/i18n/server'
import { AdminI18nProvider } from '@/lib/i18n/admin'
import type { Locale } from '@/lib/i18n/config'

type Table = Record<string, string>
const LOAD: Record<Locale, () => Promise<Table>> = {
  en: () => import('@/lib/i18n/messages/en/admin.json').then((m) => m.default as Table),
  hi: () => import('@/lib/i18n/messages/hi/admin.json').then((m) => m.default as Table),
  te: () => import('@/lib/i18n/messages/te/admin.json').then((m) => m.default as Table),
}

export async function loadAdminMessages(locale: Locale): Promise<Table> {
  const en = await LOAD.en()
  return locale === 'en' ? en : { ...en, ...(await LOAD[locale]()) }
}

export async function AdminI18n({ children }: { children: React.ReactNode }) {
  const locale = await getRequestLocale()
  return <AdminI18nProvider locale={locale} messages={await loadAdminMessages(locale)}>{children}</AdminI18nProvider>
}

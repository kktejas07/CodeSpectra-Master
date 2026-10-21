/**
 * Per-request segment wrapper (dashboard, auth, assessment): resolves the
 * interface language, hands that locale's catalogs to the client provider,
 * marks the subtree with `lang` (server-rendered, so screen readers and the
 * Indic font fallback are right on first paint) and syncs <html lang>.
 */
import { getServerI18n } from '@/lib/i18n/server'
import { localeFontClass } from '@/lib/i18n/fonts'
import { HtmlLangSync, I18nProvider } from '@/lib/i18n/client'
import { loadAreaMessages } from '@/lib/i18n/area-load'
import type { AreaNamespace } from '@/lib/i18n/areas'

/** `areas`: signed-in area catalogs every page of the segment needs (lib/i18n/areas.ts); they are also published to app-wide providers (tour). */
export async function LocaleRoot({ children, areas }: { children: React.ReactNode; areas?: readonly AreaNamespace[] }) {
  const { locale, messages: base } = await getServerI18n()
  const messages = areas?.length ? { ...base, ...(await loadAreaMessages(locale, areas)) } : base
  return (
    <I18nProvider locale={locale} messages={messages}>
      <HtmlLangSync locale={locale} />
      <div lang={locale} className={`contents ${localeFontClass(locale)}`.trim()}>
        {children}
      </div>
    </I18nProvider>
  )
}

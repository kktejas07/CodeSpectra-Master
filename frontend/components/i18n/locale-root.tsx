/**
 * Per-request segment wrapper (dashboard, auth, assessment): resolves the
 * interface language, hands that locale's catalogs to the client provider,
 * marks the subtree with `lang` (server-rendered, so screen readers and the
 * Indic font fallback are right on first paint) and syncs <html lang>.
 */
import { getServerI18n } from '@/lib/i18n/server'
import { localeFontClass } from '@/lib/i18n/fonts'
import { HtmlLangSync, I18nProvider } from '@/lib/i18n/client'

export async function LocaleRoot({ children }: { children: React.ReactNode }) {
  const { locale, messages } = await getServerI18n()
  return (
    <I18nProvider locale={locale} messages={messages}>
      <HtmlLangSync locale={locale} />
      <div lang={locale} className={`contents ${localeFontClass(locale)}`.trim()}>
        {children}
      </div>
    </I18nProvider>
  )
}

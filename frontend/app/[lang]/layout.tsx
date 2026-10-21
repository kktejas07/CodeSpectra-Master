/**
 * Hindi / Telugu copies of the public pages: /hi/… and /te/… (English stays
 * unprefixed). Each locale is prerendered / cached like the English page
 * (generateStaticParams + the same lib/cache data helpers), never per cookie.
 *
 * The root layout is shared and can't read the URL, so this segment marks its
 * subtree with `lang` on the server (screen readers, Noto font fallback,
 * hyphenation), sets <html lang> before first paint with a hashed inline
 * script (lib/csp/inline-scripts.ts) and keeps it in sync on client
 * navigation (HtmlLangSync).
 */
import { notFound } from 'next/navigation'
import { HtmlLangSync, I18nProvider } from '@/lib/i18n/client'
import { localeFontClass } from '@/lib/i18n/fonts'
import { PREFIXED_LOCALES, isPrefixedLocale } from '@/lib/i18n/public-paths'
import { publicClientMessages } from '@/lib/i18n/public-server'
import { LANG_INIT_SCRIPT } from '@/lib/csp/inline-scripts'

export const dynamicParams = false

export function generateStaticParams() {
  return PREFIXED_LOCALES.map((lang) => ({ lang }))
}

export default async function LangLayout({ children, params }: { children: React.ReactNode; params: Promise<{ lang: string }> }) {
  const { lang } = await params
  if (!isPrefixedLocale(lang)) notFound()
  return (
    <I18nProvider locale={lang} messages={publicClientMessages(lang)}>
      <script id="lang-init" dangerouslySetInnerHTML={{ __html: LANG_INIT_SCRIPT }} />
      <HtmlLangSync locale={lang} />
      <div lang={lang} className={`contents ${localeFontClass(lang)}`}>
        {children}
      </div>
    </I18nProvider>
  )
}

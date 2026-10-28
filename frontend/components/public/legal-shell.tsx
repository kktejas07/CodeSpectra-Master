/**
 * Frame for the legal pages (privacy, terms, cookies) in every language.
 *
 * The legal text itself stays in English on /hi/… and /te/…: a translation
 * that drifts from the binding English wording is a legal risk, so the page
 * title, date and a short note are translated and the body is marked
 * lang="en". Translating the text needs a reviewed legal translation first.
 */
import Link from 'next/link'
import { Info } from 'lucide-react'
import { PublicPageWrapper } from '@/app/public-layout'
import { PageHero } from '@/components/landing/page-hero'
import { SoftGlow } from '@/components/visuals'
import { JsonLd } from '@/components/seo/json-ld'
import { webPageJsonLd } from '@/lib/seo/jsonld'
import { getSiteUrl } from '@/lib/seo/site'
import { formatDate } from '@/lib/i18n/format'
import type { Locale } from '@/lib/i18n/config'
import { localizedPath } from '@/lib/i18n/public-paths'
import { publicT, type PublicKey } from '@/lib/i18n/public-server'
import { publicPageMetadata, seoCopy } from '@/lib/i18n/public-page'

export type LegalPath = '/privacy' | '/terms' | '/cookies'

const TITLE: Record<LegalPath, PublicKey> = {
  '/privacy': 'legal.privacyTitle',
  '/terms': 'legal.termsTitle',
  '/cookies': 'legal.cookiesTitle',
}

export const legalMetadata = (path: LegalPath, locale: Locale) => publicPageMetadata(path, locale)

export function LegalShell({ path, locale, updated, children }: { path: LegalPath; locale: Locale; updated: string; children: React.ReactNode }) {
  const t = publicT(locale)
  const copy = seoCopy(path, locale)
  const date = locale === 'en' ? updated : formatDate(locale, `${updated} 12:00 UTC`, { day: 'numeric', month: 'long', year: 'numeric' })
  return (
    <PublicPageWrapper>
      {locale !== 'en' && (
        <JsonLd data={webPageJsonLd({ site: getSiteUrl(), path: localizedPath(path, locale), name: copy.title, description: copy.description, inLanguage: locale })} />
      )}
      <div className="relative isolate">
        <SoftGlow />
        <PageHero title={t(TITLE[path])} lead={t('legal.lastUpdated', { date })} />
      </div>
      {locale !== 'en' && (
        <div className="mx-auto max-w-[72ch] px-4 pt-10 sm:px-6">
          <p role="note" className="flex gap-3 rounded-2xl border border-cs-accent/25 bg-cs-accent/5 p-4 text-[15px] leading-relaxed text-cs-ink">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-cs-accent-text" aria-hidden />
            <span>
              {t('legal.englishNote')}{' '}
              <Link href={path} hrefLang="en" className="font-semibold text-cs-accent-text underline underline-offset-4">{t('legal.englishLink')}</Link>
            </span>
          </p>
        </div>
      )}
      <div lang="en">{children}</div>
    </PublicPageWrapper>
  )
}

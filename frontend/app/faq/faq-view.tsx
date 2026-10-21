import Link from 'next/link'
import { PublicPageWrapper } from '@/app/public-layout'
import { HeroIllustration, PageHero, btnPrimary, btnSecondary } from '@/components/landing/page-hero'
import { FaqList } from '@/components/seo/faq-list'
import { JsonLd } from '@/components/seo/json-ld'
import { Breadcrumbs } from '@/components/seo/breadcrumbs'
import { AnswerSummary } from '@/components/seo/answer-summary'
import { ALL_SITE_FAQS, SITE_FAQS } from '@/lib/seo/faq-content'
import { faqJsonLd } from '@/lib/seo/jsonld'
import { getSiteUrl } from '@/lib/seo/site'
import type { Locale } from '@/lib/i18n/config'
import { localizedPath } from '@/lib/i18n/public-paths'
import { publicT } from '@/lib/i18n/public-server'
import { localizeFaqCategory, localizeFaqs, publicPageMetadata } from '@/lib/i18n/public-page'

export const faqMetadata = (locale: Locale) => publicPageMetadata('/faq', locale)

/*
 * Server-rendered so every answer is in the HTML (answer engines, featured
 * snippets). Copy lives in lib/seo/faq-content.ts — keep it true to the product.
 */
export function FaqView({ locale }: { locale: Locale }) {
  const site = getSiteUrl()
  const t = publicT(locale)
  const lp = (p: string) => localizedPath(p, locale)
  const sections = SITE_FAQS.map((s) => ({ category: localizeFaqCategory(s.category, t), items: localizeFaqs(s.items, t) }))
  const all = localizeFaqs(ALL_SITE_FAQS, t)
  return (
    <PublicPageWrapper>
      {/* One FAQPage for the whole page (sections below render without their own schema). */}
      <JsonLd data={faqJsonLd(all, locale)} />
      <PageHero
        title={t('publicPages.faqTitle')}
        lead={t('marketing.qLead')}
        actions={
          <>
            <Link href={lp('/contact')} className={btnPrimary}>{t('marketing.qAskElse')}</Link>
            <Link href="/docs" className={btnSecondary}>{t('marketing.qDocs')}</Link>
          </>
        }
        art={<HeroIllustration spot="search" />}
      />

      <section className="border-b border-cs-grid">
        <div className="mx-auto grid max-w-[1200px] gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[220px_1fr] lg:gap-16 lg:px-8 lg:py-20">
          <nav aria-label={t('marketing.qTopics')} className="hidden lg:block">
            <ul className="sticky top-24 space-y-1">
              {sections.map((section, sectionIdx) => (
                <li key={section.category}>
                  <a
                    href={`#faq-${sectionIdx}`}
                    className="block rounded-lg px-3 py-2 text-sm font-medium text-cs-ink-soft transition-colors hover:bg-cs-accent/10 hover:text-cs-accent-text"
                  >
                    {section.category}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="max-w-3xl space-y-12">
            <Breadcrumbs site={site} items={[{ name: t('public.footFaq'), path: lp('/faq') }]} home={{ name: t('marketing.crumbHome'), path: lp('/') }} ariaLabel={t('marketing.crumbLabel')} />
            <AnswerSummary
              answer={all[0].a}
              label={t('landing.whatIsLabel')}
            />
            {sections.map((section, sectionIdx) => (
              <div key={section.category} id={`faq-${sectionIdx}`} className="scroll-mt-24">
                <h2 className="cs-heading mb-5 text-3xl">{section.category}</h2>
                <FaqList items={section.items} schema={false} idPrefix={`faq-${sectionIdx}`} />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 lg:px-8">
          <div className="flex flex-col items-start gap-4 rounded-3xl border border-cs-grid bg-cs-sheet p-8 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold text-cs-ink">{t('marketing.qStill')}</h2>
              <p className="mt-1 text-cs-ink-soft">{t('marketing.qStillBody')}</p>
            </div>
            <a href="mailto:support@codespectra.ai" className={btnSecondary}>
              support@codespectra.ai
            </a>
          </div>
        </div>
      </section>
    </PublicPageWrapper>
  )
}

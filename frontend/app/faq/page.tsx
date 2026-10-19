import Link from 'next/link'
import { PublicPageWrapper } from '@/app/public-layout'
import { HeroIllustration, PageHero, btnPrimary, btnSecondary } from '@/components/landing/page-hero'
import { FaqList } from '@/components/seo/faq-list'
import { JsonLd } from '@/components/seo/json-ld'
import { Breadcrumbs } from '@/components/seo/breadcrumbs'
import { AnswerSummary } from '@/components/seo/answer-summary'
import { ALL_SITE_FAQS, SITE_FAQS } from '@/lib/seo/faq-content'
import { buildMetadata } from '@/lib/seo/metadata'
import { faqJsonLd } from '@/lib/seo/jsonld'
import { publicRoute } from '@/lib/seo/public-routes'
import { getSiteUrl } from '@/lib/seo/site'

const route = publicRoute('/faq')!
export const metadata = buildMetadata({ title: route.title, description: route.description, path: '/faq' })

/*
 * Server-rendered so every answer is in the HTML (answer engines, featured
 * snippets). Copy lives in lib/seo/faq-content.ts — keep it true to the product.
 */
export default function FAQPage() {
  const site = getSiteUrl()
  return (
    <PublicPageWrapper>
      {/* One FAQPage for the whole page (sections below render without their own schema). */}
      <JsonLd data={faqJsonLd(ALL_SITE_FAQS)} />
      <PageHero
        title="Frequently asked questions"
        lead="Quick answers about assessments, proctoring, hackathons, billing and your data."
        actions={
          <>
            <Link href="/contact" className={btnPrimary}>Ask us something else</Link>
            <Link href="/docs" className={btnSecondary}>Read the docs</Link>
          </>
        }
        art={<HeroIllustration spot="search" />}
      />

      <section className="border-b border-cs-grid">
        <div className="mx-auto grid max-w-[1200px] gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[220px_1fr] lg:gap-16 lg:px-8 lg:py-20">
          <nav aria-label="FAQ topics" className="hidden lg:block">
            <ul className="sticky top-24 space-y-1">
              {SITE_FAQS.map((section, sectionIdx) => (
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
            <Breadcrumbs site={site} items={[{ name: 'FAQ', path: '/faq' }]} />
            <AnswerSummary
              answer={ALL_SITE_FAQS[0].a}
              label="What is CodeSpectra?"
            />
            {SITE_FAQS.map((section, sectionIdx) => (
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
              <h2 className="text-2xl font-bold text-cs-ink">Still have questions?</h2>
              <p className="mt-1 text-cs-ink-soft">Can&apos;t find the answer you&apos;re looking for? Email our support team.</p>
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

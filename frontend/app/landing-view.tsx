/**
 * Landing page body, shared by / (English) and /hi, /te (app/[lang]/page.tsx).
 * Copy: `landing` catalog (server-only) + `public` for client sections.
 */
import Link from 'next/link'
import { PublicPageWrapper } from '@/app/public-layout'
import { ResultsSheet } from '@/components/landing/results-sheet'
import { LandingHero } from '@/components/landing/landing-hero'
import { BentoGrid } from '@/components/landing/bento-grid'
import { ThemeIllustration } from '@/components/landing/theme-illustration'
import { DeviceShowcase } from '@/components/visuals'
import { UpcomingEventsStrip } from '@/components/events-feed/upcoming-strip'
import { LearnSection } from '@/components/landing/learn-section'
import { AnswerSummary, SPEAKABLE_SELECTORS } from '@/components/seo/answer-summary'
import { FaqSection } from '@/components/seo/faq-list'
import { JsonLd } from '@/components/seo/json-ld'
import { LANDING_FAQS } from '@/lib/seo/faq-content'
import { buildMetadata } from '@/lib/seo/metadata'
import { softwareApplicationJsonLd, webPageJsonLd } from '@/lib/seo/jsonld'
import { getSiteOrigin } from '@/lib/seo/settings'
import { SITE_NAME } from '@/lib/seo/site'
import type { Locale } from '@/lib/i18n/config'
import { localizedPath } from '@/lib/i18n/public-paths'
import { publicT } from '@/lib/i18n/public-server'
import { localizeFaqs, seoCopy } from '@/lib/i18n/public-page'
import type { LearnPostCard } from '@/lib/learn/types'
import type { PublicFeedEvent } from '@/lib/events-feed/types'

export function landingMetadata(locale: Locale) {
  const copy = seoCopy('/', locale)
  return buildMetadata({ title: `${SITE_NAME}: ${copy.title}`, description: copy.description, path: '/', kind: 'default', locale })
}

/** Featured first, then latest (max 3) — same rule the client strip used. */
async function landingPosts(): Promise<LearnPostCard[]> {
  // A DB error isn't cached; this request just renders without the strip.
  try {
    const { landingPostsCached } = await import('@/lib/cache/public-data')
    return await landingPostsCached()
  } catch {
    return []
  }
}

async function landingEvents(): Promise<PublicFeedEvent[]> {
  try {
    const { eventsFeedCached } = await import('@/lib/cache/public-data')
    return (await eventsFeedCached()).slice(0, 6)
  } catch {
    return []
  }
}

/* Shared button styles for marketing pages. Kept here rather than in
   components/ui/button so the dashboard's mint button stays untouched. */
const btnPrimary =
  'inline-flex h-12 items-center justify-center rounded-md bg-cs-accent px-6 text-[15px] font-semibold text-cs-accent-ink transition-[filter] hover:brightness-110'
const btnSecondary =
  'inline-flex h-12 items-center justify-center rounded-md border border-cs-ink/25 px-6 text-[15px] font-semibold text-cs-ink transition-colors hover:border-cs-ink'

const STEPS = [
  { art: 'step-build', n: 1 },
  { art: 'step-invite', n: 2 },
  { art: 'step-proctor', n: 3 },
  { art: 'step-review', n: 4 },
] as const

export async function LandingView({ locale }: { locale: Locale }) {
  const t = publicT(locale)
  const lp = (p: string) => localizedPath(p, locale)
  const copy = seoCopy('/', locale)
  const [site, posts, events] = await Promise.all([getSiteOrigin(), landingPosts(), landingEvents()])
  const steps = STEPS.map((s) => ({
    art: s.art,
    title: t.dyn(`landing.step${s.n}Title`, ''),
    body: t.dyn(`landing.step${s.n}Body`, ''),
  }))

  return (
    <PublicPageWrapper>
      <JsonLd
        data={[
          softwareApplicationJsonLd({ site }),
          webPageJsonLd({ site, path: lp('/'), name: `${SITE_NAME}: ${copy.title}`, description: copy.description, speakable: SPEAKABLE_SELECTORS, inLanguage: locale }),
        ]}
      />
      <LandingHero />

      {/* Answer-first definition for search snippets, answer engines and voice */}
      <section className="border-b border-cs-grid">
        <div className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6 lg:px-8">
          <AnswerSummary
            label={t('landing.whatIsLabel')}
            answer={t('landing.whatIsAnswer')}
            points={[t('landing.whatIsPoint1'), t('landing.whatIsPoint2'), t('landing.whatIsPoint3')]}
          />
        </div>
      </section>

      {/* Sample report — the interactive results sheet */}
      <section className="cs-graph relative border-b border-cs-grid">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-linear-to-b from-cs-paper to-cs-paper/0" />
        <div className="relative mx-auto max-w-[1200px] px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
          <div className="mb-10 grid items-end gap-6 lg:grid-cols-[1.2fr_1fr] lg:gap-16">
            <h2 className="cs-heading text-4xl sm:text-5xl">{t('landing.reportTitle')}</h2>
            <p className="max-w-[52ch] text-lg leading-relaxed text-cs-ink-soft">{t('landing.reportLead')}</p>
          </div>
          {/* Sample data (names, roles, scores) stays as is in every language. */}
          <div lang="en">
            <ResultsSheet />
          </div>
        </div>
      </section>

      {/* How a screening runs — a genuine sequence, so numbered */}
      <section className="border-b border-cs-grid">
        <div className="mx-auto max-w-[1200px] px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <h2 className="cs-heading max-w-[20ch] text-4xl sm:text-5xl">{t('landing.stepsTitle')}</h2>
          <ol className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
            {steps.map((step, i) => (
              <li key={step.art} className="border-t-2 border-cs-ink pt-5">
                <div className="flex items-start justify-between gap-4">
                  <span className="cs-display block text-5xl text-cs-accent-text" aria-hidden>
                    {i + 1}
                  </span>
                  <ThemeIllustration name={step.art} width={160} height={120} className="w-32" />
                </div>
                <h3 className="mt-4 text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 leading-relaxed text-cs-ink-soft">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Platform bento — every capability as one animated grid */}
      <section className="border-b border-cs-grid">
        <div className="mx-auto max-w-[1200px] px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="mb-12 grid gap-6 lg:grid-cols-[1.1fr_1fr] lg:items-end lg:gap-16">
            <h2 className="cs-heading max-w-[18ch] text-4xl sm:text-5xl">{t('landing.platformTitle')}</h2>
            <p className="max-w-[54ch] text-lg leading-relaxed text-cs-ink-soft">
              {t('landing.platformLead')} <strong className="font-semibold text-cs-ink">{t('landing.platformLeadStrong')}</strong>{t('landing.platformLeadEnd')}
            </p>
          </div>
          <BentoGrid />
        </div>
      </section>

      {/* Learn hub — latest / featured posts (hidden until something is published) */}
      <LearnSection initialPosts={posts} />

      {/* Upcoming events (lib/events-feed) — hidden when there are none */}
      <UpcomingEventsStrip initialEvents={events} />

      <FaqSection title={t('landing.faqTitle')} items={localizeFaqs(LANDING_FAQS, t)} id="home-faq" inLanguage={locale} />

      {/* Candidates — secondary audience */}
      <section className="border-b border-cs-grid bg-cs-sheet">
        <div className="mx-auto grid max-w-[1200px] items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_1.05fr] lg:gap-16 lg:px-8 lg:py-24">
          <div>
            <p className="text-sm font-semibold text-cs-accent-text">{t('landing.candidatesEyebrow')}</p>
            <h2 className="cs-heading mt-3 max-w-[16ch] text-4xl sm:text-5xl">{t('landing.candidatesTitle')}</h2>
            <p className="mt-5 max-w-[52ch] text-lg leading-relaxed text-cs-ink-soft">{t('landing.candidatesLead')}</p>
            <ul className="mt-8 space-y-3 text-[15px] text-cs-ink">
              {[t('landing.candidatesPoint1'), t('landing.candidatesPoint2'), t('landing.candidatesPoint3')].map((x) => (
                <li key={x} className="flex gap-3">
                  <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-cs-accent" />
                  {x}
                </li>
              ))}
            </ul>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/auth/signup" className={btnPrimary}>
                {t('landing.startPractising')}
              </Link>
              <Link href="/auth/login" className={btnSecondary}>
                {t('landing.signIn')}
              </Link>
            </div>
          </div>
          <DeviceShowcase variant="candidate" />
        </div>
      </section>

      {/* Closing CTA */}
      <section className="cs-graph relative">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-linear-to-r from-cs-paper via-cs-paper/85 to-cs-paper/40" />
        <div className="relative mx-auto grid max-w-[1200px] items-center gap-12 px-4 py-24 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:px-8 lg:py-32">
          <div>
          <h2 className="cs-display max-w-[16ch] text-5xl sm:text-6xl lg:text-7xl">{t('landing.ctaTitle')}</h2>
          <p className="mt-6 max-w-[56ch] text-lg leading-relaxed text-cs-ink-soft">{t('landing.ctaLead')}</p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Link href={lp('/contact')} className={btnPrimary}>
              {t('public.bookPilot')}
            </Link>
            <Link href={lp('/pricing')} className={btnSecondary}>
              {t('landing.seePricing')}
            </Link>
          </div>
          </div>
          {/* What a pilot ends in — the shortlist report on a laptop */}
          <DeviceShowcase variant="results" compact className="hidden lg:block" />
        </div>
      </section>
    </PublicPageWrapper>
  )
}

import Link from 'next/link'
import { Building2, Compass, MapPin, Scale, ShieldCheck, Users } from 'lucide-react'
import { PublicPageWrapper } from '@/app/public-layout'
import { BentoBody, BentoCard, BentoIcon, BentoShell, BentoTitle } from '@/components/landing/bento-grid'
import { DeviceShowcase, SoftGlow } from '@/components/visuals'
import { PageHero, btnPrimary, btnSecondary } from '@/components/landing/page-hero'
import { Scene } from '@/components/illustrations/scenes'
import { JsonLd } from '@/components/seo/json-ld'
import { Breadcrumbs } from '@/components/seo/breadcrumbs'
import { AnswerSummary, SPEAKABLE_SELECTORS } from '@/components/seo/answer-summary'
import { orgId, webPageJsonLd } from '@/lib/seo/jsonld'
import { PRODUCT_FACTS } from '@/lib/seo/llms'
import { getSeoSettings } from '@/lib/seo/settings'
import { resolveSiteUrl } from '@/lib/seo/site'
import type { Locale } from '@/lib/i18n/config'
import { localizedPath } from '@/lib/i18n/public-paths'
import { publicT } from '@/lib/i18n/public-server'
import { publicPageMetadata, seoCopy } from '@/lib/i18n/public-page'

/** /about body for every language (English: app/about/page.tsx, hi / te: app/[lang]/about). */
export const aboutMetadata = (locale: Locale) => publicPageMetadata('/about', locale)

/*
 * Company facts on this page come from the founder (AXISS Group, Hyderabad +
 * Princeton NJ, founder name). No invented team members or usage numbers —
 * add real figures here only when they can be stated publicly.
 */

const PRINCIPLES = [
  { icon: Scale, n: 1 },
  { icon: ShieldCheck, n: 2 },
  { icon: Compass, n: 3 },
] as const

export async function AboutView({ locale }: { locale: Locale }) {
  const seo = await getSeoSettings()
  const site = resolveSiteUrl(seo.site_url)
  const t = publicT(locale)
  const lp = (p: string) => localizedPath(p, locale)
  const route = seoCopy('/about', locale)
  const en = locale === 'en'
  // Entity facts for knowledge graphs: who makes CodeSpectra and who founded it (stated on this page).
  const aboutLd = {
    ...webPageJsonLd({ site, path: lp('/about'), name: route.title, description: route.description, speakable: SPEAKABLE_SELECTORS, type: 'AboutPage', inLanguage: locale }),
    about: { '@id': orgId(site) },
    mainEntity: {
      '@type': 'Organization',
      '@id': orgId(site),
      name: 'CodeSpectra',
      founder: { '@type': 'Person', name: 'Krishna Chintakayala' },
      parentOrganization: { '@type': 'Organization', name: 'AXISS Group' },
      areaServed: ['IN', 'US'],
      knowsAbout: ['Skills assessment', 'Technical hiring', 'Online proctoring', 'Hackathons', 'Coding interviews'],
    },
  }
  return (
    <PublicPageWrapper>
      <JsonLd data={aboutLd} />
      <PageHero
        title={t('marketing.aHeroTitle')}
        lead={
          <>
            {t('marketing.aHeroLead')} <strong className="font-semibold text-cs-ink">{t('marketing.aHeroLeadStrong')}</strong> {t('marketing.aHeroLeadEnd')}
          </>
        }
        art={<DeviceShowcase variant="results" compact />}
      />

      <section className="border-b border-cs-grid" aria-labelledby="facts-heading">
        <div className="mx-auto max-w-[1200px] space-y-8 px-4 py-12 sm:px-6 lg:px-8">
          <Breadcrumbs site={site} items={[{ name: t('public.footAbout'), path: lp('/about') }]} home={{ name: t('marketing.crumbHome'), path: lp('/') }} ariaLabel={t('marketing.crumbLabel')} />
          <AnswerSummary label={t('landing.whatIsLabel')} answer={en ? PRODUCT_FACTS.one_liner : t('marketing.aOneLiner')} />
          <h2 id="facts-heading" className="sr-only">{t('marketing.aGlance')}</h2>
          <dl className="grid gap-6 rounded-3xl border border-cs-grid bg-cs-sheet p-6 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-semibold text-cs-ink">{t('marketing.aWhatItIs')}</dt>
              <dd className="mt-1 text-[15px] leading-relaxed text-cs-ink-soft">{en ? `${PRODUCT_FACTS.category}.` : t('marketing.aCategory')}</dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-cs-ink">{t('marketing.aWhoFor')}</dt>
              <dd className="mt-1 text-[15px] leading-relaxed text-cs-ink-soft">
                <ul className="list-disc space-y-1 pl-5">{(en ? PRODUCT_FACTS.audiences : [t('marketing.aAudience1'), t('marketing.aAudience2'), t('marketing.aAudience3')]).map((a) => <li key={a}>{a}</li>)}</ul>
              </dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-cs-ink">{t('marketing.aWhoMakes')}</dt>
              <dd className="mt-1 text-[15px] leading-relaxed text-cs-ink-soft">{t('marketing.aWhoMakesBody')}</dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-cs-ink">{t('marketing.aContent')}</dt>
              <dd className="mt-1 text-[15px] leading-relaxed text-cs-ink-soft">
                {t('marketing.aContentBody')}{' '}
                <Link href="/editorial-policy" className="font-semibold text-cs-accent-text underline underline-offset-4">{t('marketing.aEditorialLink')}</Link>.
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="border-b border-cs-grid">
        <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <BentoShell>
            <BentoCard className="sm:col-span-2 lg:row-span-2">
              <BentoIcon><Users className="h-5 w-5" aria-hidden /></BentoIcon>
              <BentoTitle>{t('marketing.aWhyTitle')}</BentoTitle>
              <BentoBody className="max-w-[60ch]">{t('marketing.aWhyBody1')}</BentoBody>
              <BentoBody className="max-w-[60ch]">{t('marketing.aWhyBody2')}</BentoBody>
              <Scene name="hiring-team" className="mt-auto hidden w-full max-w-[420px] self-center pt-6 md:block" />
            </BentoCard>

            <BentoCard className="sm:col-span-2">
              <BentoIcon><Building2 className="h-5 w-5" aria-hidden /></BentoIcon>
              <BentoTitle>{t('marketing.aAxissTitle')}</BentoTitle>
              <BentoBody>{t('marketing.aAxissBody')}</BentoBody>
            </BentoCard>

            <BentoCard className="sm:col-span-2">
              <BentoIcon><MapPin className="h-5 w-5" aria-hidden /></BentoIcon>
              <BentoTitle>{t('marketing.aWhereTitle')}</BentoTitle>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="font-semibold text-cs-ink">{t('marketing.aHyderabad')}</p>
                  <p className="text-sm text-cs-ink-soft">{t('marketing.aIndia')}</p>
                </div>
                <div>
                  <p className="font-semibold text-cs-ink">{t('marketing.aPrinceton')}</p>
                  <p className="text-sm text-cs-ink-soft">{t('marketing.aUs')}</p>
                </div>
              </div>
            </BentoCard>
          </BentoShell>
        </div>
      </section>

      <section className="relative isolate border-b border-cs-grid">
        <SoftGlow />
        <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <h2 className="cs-heading mb-10 text-4xl sm:text-5xl">{t('marketing.aPrinciplesTitle')}</h2>
          <BentoShell className="lg:grid-cols-3">
            {PRINCIPLES.map(({ icon: Icon, n }) => (
              <BentoCard key={n}>
                <BentoIcon><Icon className="h-5 w-5" aria-hidden /></BentoIcon>
                <BentoTitle>{t.dyn(`marketing.aPrinciple${n}Title`, '')}</BentoTitle>
                <BentoBody>{t.dyn(`marketing.aPrinciple${n}Body`, '')}</BentoBody>
              </BentoCard>
            ))}
          </BentoShell>
        </div>
      </section>

      <section>
        <div className="mx-auto flex max-w-[1200px] flex-col items-start gap-6 px-4 py-16 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <div>
            <h2 className="cs-heading text-3xl sm:text-4xl">{t('marketing.aCtaTitle')}</h2>
            <p className="mt-2 text-cs-ink-soft">{t('marketing.aCtaBody')}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href={lp('/contact')} className={btnPrimary}>{t('public.bookPilot')}</Link>
            <Link href={lp('/features')} className={btnSecondary}>{t('marketing.aExplore')}</Link>
          </div>
        </div>
      </section>
    </PublicPageWrapper>
  )
}

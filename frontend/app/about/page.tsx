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
import { buildMetadata } from '@/lib/seo/metadata'
import { orgId, webPageJsonLd } from '@/lib/seo/jsonld'
import { PRODUCT_FACTS } from '@/lib/seo/llms'
import { publicRoute } from '@/lib/seo/public-routes'
import { getSeoSettings } from '@/lib/seo/settings'
import { resolveSiteUrl } from '@/lib/seo/site'

const route = publicRoute('/about')!
export const metadata = buildMetadata({ title: route.title, description: route.description, path: '/about' })

/*
 * Company facts on this page come from the founder (AXISS Group, Hyderabad +
 * Princeton NJ, founder name). No invented team members or usage numbers —
 * add real figures here only when they can be stated publicly.
 */

const PRINCIPLES = [
  {
    icon: Scale,
    title: 'Fair by design',
    body: 'Every candidate in a screening is scored the same way, with harder questions worth more, so nobody is penalised for the level they were assessed at.',
  },
  {
    icon: ShieldCheck,
    title: 'Evidence over suspicion',
    body: 'Proctoring logs events with timestamps instead of auto-rejecting people. A reviewer decides what a flag means.',
  },
  {
    icon: Compass,
    title: 'Beyond software',
    body: 'Hiring for a plant, a design office or a test team deserves the same rigour as hiring developers.',
  },
]

export default async function AboutPage() {
  const seo = await getSeoSettings()
  const site = resolveSiteUrl(seo.site_url)
  // Entity facts for knowledge graphs: who makes CodeSpectra and who founded it (stated on this page).
  const aboutLd = {
    ...webPageJsonLd({ site, path: '/about', name: route.title, description: route.description, speakable: SPEAKABLE_SELECTORS, type: 'AboutPage' }),
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
        title="We help teams hire on proven skills"
        lead={
          <>
            CodeSpectra is a skills-assessment and hackathon platform for companies and colleges. It turns a long list
            of applicants into a <strong className="font-semibold text-cs-ink">ranked shortlist</strong> backed by work
            each candidate actually did.
          </>
        }
        art={<DeviceShowcase variant="results" compact />}
      />

      <section className="border-b border-cs-grid" aria-labelledby="facts-heading">
        <div className="mx-auto max-w-[1200px] space-y-8 px-4 py-12 sm:px-6 lg:px-8">
          <Breadcrumbs site={site} items={[{ name: 'About', path: '/about' }]} />
          <AnswerSummary label="What is CodeSpectra?" answer={PRODUCT_FACTS.one_liner} />
          <h2 id="facts-heading" className="sr-only">CodeSpectra at a glance</h2>
          <dl className="grid gap-6 rounded-3xl border border-cs-grid bg-cs-sheet p-6 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-semibold text-cs-ink">What it is</dt>
              <dd className="mt-1 text-[15px] leading-relaxed text-cs-ink-soft">{PRODUCT_FACTS.category}.</dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-cs-ink">Who it is for</dt>
              <dd className="mt-1 text-[15px] leading-relaxed text-cs-ink-soft">
                <ul className="list-disc space-y-1 pl-5">{PRODUCT_FACTS.audiences.map((a) => <li key={a}>{a}</li>)}</ul>
              </dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-cs-ink">Who makes it</dt>
              <dd className="mt-1 text-[15px] leading-relaxed text-cs-ink-soft">AXISS Group, founded by Krishna Chintakayala. Offices in Hyderabad, India and Princeton, New Jersey.</dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-cs-ink">How content is written</dt>
              <dd className="mt-1 text-[15px] leading-relaxed text-cs-ink-soft">
                Learn posts are written by our learning bot from cited sources, pass automated quality checks, and are
                reviewed, corrected or withdrawn by our team. See the{' '}
                <Link href="/editorial-policy" className="font-semibold text-cs-accent-text underline underline-offset-4">editorial policy</Link>.
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
              <BentoTitle>Why we built it</BentoTitle>
              <BentoBody className="max-w-[60ch]">
                Résumés and keyword filters say little about whether someone can do the work. Interviews are expensive
                to spend on the wrong people. We built CodeSpectra so hiring teams can give every applicant the same
                practical test, then spend interview time on the strongest.
              </BentoBody>
              <BentoBody className="max-w-[60ch]">
                It started with coding assessments and grew to cover CAD and mechanical design, QA automation, aptitude
                and written answers, because most hiring isn’t only for developers.
              </BentoBody>
              <Scene name="hiring-team" className="mt-auto hidden w-full max-w-[420px] self-center pt-6 md:block" />
            </BentoCard>

            <BentoCard className="sm:col-span-2">
              <BentoIcon><Building2 className="h-5 w-5" aria-hidden /></BentoIcon>
              <BentoTitle>Part of AXISS Group</BentoTitle>
              <BentoBody>
                CodeSpectra is one of the products of AXISS Group, founded by Krishna Chintakayala, which builds hiring,
                education and workforce software for India and the US.
              </BentoBody>
            </BentoCard>

            <BentoCard className="sm:col-span-2">
              <BentoIcon><MapPin className="h-5 w-5" aria-hidden /></BentoIcon>
              <BentoTitle>Where we are</BentoTitle>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="font-semibold text-cs-ink">Hyderabad, India</p>
                  <p className="text-sm text-cs-ink-soft">India</p>
                </div>
                <div>
                  <p className="font-semibold text-cs-ink">Princeton, New Jersey</p>
                  <p className="text-sm text-cs-ink-soft">United States</p>
                </div>
              </div>
            </BentoCard>
          </BentoShell>
        </div>
      </section>

      <section className="relative isolate border-b border-cs-grid">
        <SoftGlow />
        <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <h2 className="cs-heading mb-10 text-4xl sm:text-5xl">What we hold to</h2>
          <BentoShell className="lg:grid-cols-3">
            {PRINCIPLES.map(({ icon: Icon, title, body }) => (
              <BentoCard key={title}>
                <BentoIcon><Icon className="h-5 w-5" aria-hidden /></BentoIcon>
                <BentoTitle>{title}</BentoTitle>
                <BentoBody>{body}</BentoBody>
              </BentoCard>
            ))}
          </BentoShell>
        </div>
      </section>

      <section>
        <div className="mx-auto flex max-w-[1200px] flex-col items-start gap-6 px-4 py-16 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <div>
            <h2 className="cs-heading text-3xl sm:text-4xl">Want to see it on one of your roles?</h2>
            <p className="mt-2 text-cs-ink-soft">We’ll set up a pilot assessment with you and show you the ranked shortlist.</p>
          </div>
          <div className="flex gap-3">
            <Link href="/contact" className={btnPrimary}>Book a pilot</Link>
            <Link href="/features" className={btnSecondary}>Explore features</Link>
          </div>
        </div>
      </section>
    </PublicPageWrapper>
  )
}

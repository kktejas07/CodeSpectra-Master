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
import { publicRoute } from '@/lib/seo/public-routes'
import { getSiteOrigin } from '@/lib/seo/settings'
import { SITE_NAME } from '@/lib/seo/site'
import type { LearnPostCard } from '@/lib/learn/types'
import type { PublicFeedEvent } from '@/lib/events-feed/types'

const route = publicRoute('/')!
export const metadata = { ...buildMetadata({ title: `${SITE_NAME}: ${route.title}`, description: route.description, path: '/', kind: 'default' }) }

/** Featured first, then latest (max 3) — same rule the client strip used. */
async function landingPosts(): Promise<LearnPostCard[]> {
  try {
    const { listPublished } = await import('@/lib/learn/queries')
    const [featured, latest] = await Promise.all([listPublished({ featured: true, limit: 3 }), listPublished({ limit: 3 })])
    const seen = new Set<string>()
    return [...featured.items, ...latest.items].filter((p) => !seen.has(p.slug) && seen.add(p.slug)).slice(0, 3)
  } catch {
    return []
  }
}

async function landingEvents(): Promise<PublicFeedEvent[]> {
  try {
    const { listPublishedFeed } = await import('@/lib/events-feed/query')
    return (await listPublishedFeed()).slice(0, 6)
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
  {
    art: 'step-build',
    title: 'Build the assessment',
    body: 'Pick the role and experience band. CodeSpectra assembles a question mix weighted to that level, and you can edit any question before it goes out.',
  },
  {
    art: 'step-invite',
    title: 'Invite candidates',
    body: 'Email invites to your applicant list and send reminders to anyone who hasn’t started. Each invite opens a timed, proctored session.',
  },
  {
    art: 'step-proctor',
    title: 'Candidates take it under proctoring',
    body: 'Fullscreen lock, tab-switch detection, webcam face matching and copy-paste blocking run during the test. Every event lands on the candidate’s report.',
  },
  {
    art: 'step-review',
    title: 'Review the shortlist',
    body: 'Candidates arrive ranked by difficulty-weighted points. Check flags, read answers, then release results or export them as CSV.',
  },
]




export default async function Home() {
  const [site, posts, events] = await Promise.all([getSiteOrigin(), landingPosts(), landingEvents()])

  return (
    <PublicPageWrapper>
      <JsonLd
        data={[
          softwareApplicationJsonLd({ site }),
          webPageJsonLd({ site, path: '/', name: `${SITE_NAME}: ${route.title}`, description: route.description, speakable: SPEAKABLE_SELECTORS }),
        ]}
      />
      <LandingHero />

      {/* Answer-first definition for search snippets, answer engines and voice */}
      <section className="border-b border-cs-grid">
        <div className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6 lg:px-8">
          <AnswerSummary
            label="What is CodeSpectra?"
            answer="CodeSpectra is a skills-assessment platform for hiring teams and colleges. It runs proctored, auto-scored tests for software, QA, CAD and aptitude roles and ranks every candidate on one shortlist, so reviewers only look at the strongest."
            points={[
              'Coding, multiple-choice, written and CAD questions in one timed test',
              'Proctoring flags (tab switches, face match, copy-paste) sit next to each score',
              'Free practice, mock tests and verifiable certificates for candidates',
            ]}
          />
        </div>
      </section>

      {/* Sample report — the interactive results sheet */}
      <section className="cs-graph relative border-b border-cs-grid">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-linear-to-b from-cs-paper to-cs-paper/0" />
        <div className="relative mx-auto max-w-[1200px] px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
          <div className="mb-10 grid items-end gap-6 lg:grid-cols-[1.2fr_1fr] lg:gap-16">
            <h2 className="cs-heading text-4xl sm:text-5xl">Every screening ends in a ranked report</h2>
            <p className="max-w-[52ch] text-lg leading-relaxed text-cs-ink-soft">
              Switch roles to see the same ranking applied to design and QA hiring. Shortlisted candidates are
              marked, and any integrity flag sits next to the score.
            </p>
          </div>
          <ResultsSheet />
        </div>
      </section>

      {/* How a screening runs — a genuine sequence, so numbered */}
      <section className="border-b border-cs-grid">
        <div className="mx-auto max-w-[1200px] px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <h2 className="cs-heading max-w-[20ch] text-4xl sm:text-5xl">How a screening runs</h2>
          <ol className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
            {STEPS.map((step, i) => (
              <li key={step.title} className="border-t-2 border-cs-ink pt-5">
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
            <h2 className="cs-heading max-w-[18ch] text-4xl sm:text-5xl">One platform for every screening</h2>
            <p className="max-w-[54ch] text-lg leading-relaxed text-cs-ink-soft">
              Build the test, proctor it, score it and rank it, for engineers, designers, testers and graduates
              alike. <strong className="font-semibold text-cs-ink">One score, one shortlist</strong>, whatever the role.
            </p>
          </div>
          <BentoGrid />
        </div>
      </section>

      {/* Learn hub — latest / featured posts (hidden until something is published) */}
      <LearnSection initialPosts={posts} />

      {/* Upcoming events (lib/events-feed) — hidden when there are none */}
      <UpcomingEventsStrip initialEvents={events} />

      <FaqSection title="Questions hiring teams ask" items={LANDING_FAQS} id="home-faq" />

      {/* Candidates — secondary audience */}
      <section className="border-b border-cs-grid bg-cs-sheet">
        <div className="mx-auto grid max-w-[1200px] items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_1.05fr] lg:gap-16 lg:px-8 lg:py-24">
          <div>
            <p className="text-sm font-semibold text-cs-accent-text">For candidates</p>
            <h2 className="cs-heading mt-3 max-w-[16ch] text-4xl sm:text-5xl">Taking a CodeSpectra assessment?</h2>
            <p className="mt-5 max-w-[52ch] text-lg leading-relaxed text-cs-ink-soft">
              Use the link from your invite. Before test day you can practise coding problems, try mock tests
              and earn certificates on your own free account.
            </p>
            <ul className="mt-8 space-y-3 text-[15px] text-cs-ink">
              {[
                'Run your code against sample tests before you submit',
                'Your answers save as you go',
                'Certificates anyone can verify online',
              ].map((t) => (
                <li key={t} className="flex gap-3">
                  <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-cs-accent" />
                  {t}
                </li>
              ))}
            </ul>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/auth/signup" className={btnPrimary}>
                Start practising
              </Link>
              <Link href="/auth/login" className={btnSecondary}>
                Sign in
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
          <h2 className="cs-display max-w-[16ch] text-5xl sm:text-6xl lg:text-7xl">
            Run your next screening on CodeSpectra.
          </h2>
          <p className="mt-6 max-w-[56ch] text-lg leading-relaxed text-cs-ink-soft">
            Start with a pilot on one open role. We set up the assessment with you and you see the ranked
            shortlist before you commit.
          </p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Link href="/contact" className={btnPrimary}>
              Book a pilot
            </Link>
            <Link href="/pricing" className={btnSecondary}>
              See pricing
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

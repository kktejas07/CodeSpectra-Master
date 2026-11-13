/**
 * Landing page sections above the sample report (server components, no
 * client JS apart from the hero buttons):
 *
 *   StatementHero   one-sentence headline beside the funnel illustration, four ways in, three counted stats
 *   PatternList     company practice patterns, each with a Practise link
 *   WhySection      three reasons, no buttons
 *   WaysIn          hiring teams / colleges / candidates, one action each
 *
 * Every number is counted from the code (PLATFORM_COUNTS) and every pattern
 * comes from the seeded list, so the page cannot claim more than the product.
 * Copy: landing.json (en / hi / te).
 */
import Link from 'next/link'
import { ArrowRight, ArrowUpRight } from 'lucide-react'
import { AssessmentIcon, ProctoringIcon, ContestIcon } from '@/components/icons/product-icons'
import { HeroCtas } from '@/components/landing/hero-ctas'
import { ThemeIllustration } from '@/components/landing/theme-illustration'
import { PLATFORM_COUNTS } from '@/components/landing/product-bento'
import { SEED_PATTERNS } from '@/lib/company-tests/seed-patterns'
import type { Locale } from '@/lib/i18n/config'
import { localizedPath } from '@/lib/i18n/public-paths'
import { publicT } from '@/lib/i18n/public-server'

const WRAP = 'mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8'
const FOCUS = 'outline-none focus-visible:ring-2 focus-visible:ring-cs-accent focus-visible:ring-offset-2 focus-visible:ring-offset-cs-paper'
/** How many practice patterns the landing page lists before "View all". */
const PATTERNS_SHOWN = 6
/** Left padding per hero entry link, by position (see StatementHero). */
const ENTRY_PAD = ['', 'sm:pl-6', 'lg:pl-6', 'sm:pl-6'] as const

export function StatementHero({ locale }: { locale: Locale }) {
  const t = publicT(locale)
  const lp = (p: string) => localizedPath(p, locale)
  const entries = [
    { n: 1, href: lp('/features') },
    { n: 2, href: lp('/contact') },
    { n: 3, href: '/auth/signup' },
    { n: 4, href: lp('/hackathons') },
  ]
  const stats = [
    { value: PLATFORM_COUNTS.questionTypes, label: t('landing.statsQuestionTypes') },
    { value: PLATFORM_COUNTS.companyPatterns, label: t('landing.statsPatterns') },
    { value: PLATFORM_COUNTS.contestFormats, label: t('landing.statsFormats') },
  ]
  return (
    <>
      <section className="border-b border-cs-grid">
        <div className={`${WRAP} pb-16 pt-16 sm:pt-20 lg:pb-20 lg:pt-28`}>
          <div className="grid items-center gap-x-12 gap-y-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <div>
              <h1 className="cs-display max-w-[15ch] text-[clamp(2.75rem,7.2vw,5.75rem)] text-cs-ink">{t('landing.heroTitle')}</h1>
              <p className="mt-7 max-w-[58ch] text-lg leading-relaxed text-cs-ink-soft sm:text-xl">{t('public.heroLead')}</p>
              <HeroCtas />
            </div>
            {/* The headline as a picture: 100 applicants → proctored assessment → top 20 (animated SVG,
                light and dark; its own reduced-motion rule stops the animation). Labels inside stay English. */}
            <ThemeIllustration name="hero-funnel" alt={t('landing.heroArtAlt')} width={480} height={420} priority className="mx-auto w-full max-w-[440px] lg:max-w-none" />
          </div>

          <nav aria-label={t('landing.heroWaysLabel')} className="mt-14 lg:mt-20">
            <ul className="grid border-t border-cs-ink sm:grid-cols-2 lg:grid-cols-4">
              {entries.map((e, i) => (
                <li key={e.n} className="border-b border-cs-grid sm:odd:border-r lg:border-r lg:last:border-r-0">
                  {/* Left padding only where a divider sits to the left: column 2 at sm (2 columns), columns 2-4 at lg (4 columns). */}
                  <Link href={e.href} className={`group flex h-full flex-col gap-1.5 py-6 sm:pr-6 ${ENTRY_PAD[i]} ${FOCUS}`}>
                    <span className="flex items-center justify-between gap-3 text-lg font-semibold text-cs-ink">
                      {t.dyn(`landing.heroEntry${e.n}Title`, '')}
                      <ArrowUpRight className="h-5 w-5 shrink-0 text-cs-accent-text transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
                    </span>
                    <span className="text-[15px] leading-relaxed text-cs-ink-soft">{t.dyn(`landing.heroEntry${e.n}Body`, '')}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </section>

      <section aria-label={t('landing.statsLabel')} className="border-b border-cs-grid bg-cs-sheet">
        <div className={`${WRAP} grid gap-x-12 gap-y-8 py-12 sm:grid-cols-2 lg:grid-cols-4 lg:py-14`}>
          {stats.map((s) => (
            <p key={s.label} className="flex flex-col">
              <span className="cs-display text-6xl text-cs-accent-text sm:text-7xl">{s.value}</span>
              <span className="mt-2 text-[15px] text-cs-ink-soft">{s.label}</span>
            </p>
          ))}
          <p className="self-end text-[13px] leading-relaxed text-cs-ink-soft">{t('landing.statsNote')}</p>
        </div>
      </section>
    </>
  )
}

export function PatternList({ locale }: { locale: Locale }) {
  const t = publicT(locale)
  const lp = (p: string) => localizedPath(p, locale)
  const shown = SEED_PATTERNS.slice(0, PATTERNS_SHOWN)
  return (
    <section className="border-b border-cs-grid">
      <div className={`${WRAP} py-20 lg:py-24`}>
        <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
          <div>
            <h2 className="cs-heading max-w-[18ch] text-4xl sm:text-5xl">{t('landing.patternsTitle')}</h2>
            <p className="mt-4 max-w-[52ch] text-lg leading-relaxed text-cs-ink-soft">{t('landing.patternsLead')}</p>
          </div>
          <Link href={lp('/companies')} className={`inline-flex min-h-11 items-center gap-1.5 text-[15px] font-semibold text-cs-accent-text hover:underline ${FOCUS}`}>
            {t('landing.patternsViewAll', { n: SEED_PATTERNS.length })}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
        {/* Company and exam names are proper nouns: same in every language. */}
        <ul lang="en" className="mt-10 border-t border-cs-ink">
          {shown.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3 border-b border-cs-grid py-5">
              <div className="min-w-0 flex-1 basis-64">
                <p className="text-lg font-semibold text-cs-ink">{p.examName}</p>
                <p className="text-[15px] text-cs-ink-soft">{p.companyName}</p>
              </div>
              <Link
                href={lp(`/companies/${p.companySlug}`)}
                aria-label={t('landing.patternsPractiseAria', { exam: p.examName })}
                lang={locale}
                className={`inline-flex h-11 items-center rounded-full border border-cs-ink/25 px-5 text-[15px] font-semibold text-cs-ink transition-colors hover:border-cs-ink ${FOCUS}`}
              >
                {t('landing.patternsPractise')}
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-5 max-w-[80ch] text-[13px] leading-relaxed text-cs-ink-soft">{t('landing.patternsNote')}</p>
      </div>
    </section>
  )
}

export function WhySection({ locale }: { locale: Locale }) {
  const t = publicT(locale)
  const items = [
    { n: 1, icon: <AssessmentIcon /> },
    { n: 2, icon: <ProctoringIcon /> },
    { n: 3, icon: <ContestIcon /> },
  ]
  return (
    <section className="border-b border-cs-grid bg-cs-sheet">
      <div className={`${WRAP} py-20 lg:py-24`}>
        <h2 className="cs-heading max-w-[20ch] text-4xl sm:text-5xl">{t('landing.whyTitle')}</h2>
        <ul className="mt-12 grid gap-x-10 gap-y-12 md:grid-cols-3">
          {items.map((it) => (
            <li key={it.n}>
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-cs-accent/25 bg-cs-accent/10 text-cs-accent-text [&_svg]:h-7 [&_svg]:w-7">
                {it.icon}
              </span>
              <h3 className="mt-5 text-xl font-semibold text-cs-ink">{t.dyn(`landing.why${it.n}Title`, '')}</h3>
              <p className="mt-2 max-w-[44ch] leading-relaxed text-cs-ink-soft">{t.dyn(`landing.why${it.n}Body`, '')}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

export function WaysIn({ locale }: { locale: Locale }) {
  const t = publicT(locale)
  const lp = (p: string) => localizedPath(p, locale)
  const primary = `inline-flex h-11 items-center rounded-full bg-cs-accent px-5 text-[15px] font-semibold text-cs-accent-ink transition-[filter] hover:brightness-110 ${FOCUS}`
  const secondary = `inline-flex h-11 items-center rounded-full border border-cs-ink/25 px-5 text-[15px] font-semibold text-cs-ink transition-colors hover:border-cs-ink ${FOCUS}`
  const cards = [
    { key: 'Teams', href: lp('/contact'), cta: t('public.bookPilot'), cls: primary },
    { key: 'Colleges', href: lp('/contact'), cta: t('landing.waysCollegesCta'), cls: secondary },
    { key: 'Candidates', href: '/auth/signup', cta: t('landing.startPractising'), cls: secondary },
  ]
  return (
    <section className="border-b border-cs-grid">
      <div className={`${WRAP} py-20 lg:py-24`}>
        <h2 className="cs-heading max-w-[18ch] text-4xl sm:text-5xl">{t('landing.waysTitle')}</h2>
        <div className="mt-12 grid gap-x-10 gap-y-12 md:grid-cols-3">
          {cards.map((c) => (
            <article key={c.key} className="flex flex-col border-t-2 border-cs-ink pt-6">
              <h3 className="text-2xl font-semibold text-cs-ink">{t.dyn(`landing.ways${c.key}Title`, '')}</h3>
              <ul className="mt-4 space-y-2.5 text-[15px] leading-relaxed text-cs-ink-soft">
                {[1, 2, 3].map((i) => (
                  <li key={i} className="flex gap-3">
                    <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-cs-accent" />
                    {t.dyn(`landing.ways${c.key}${i}`, '')}
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-7">
                <Link href={c.href} className={c.cls}>{c.cta}</Link>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

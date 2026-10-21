import Link from 'next/link'
import {
  BadgeCheck,
  BookOpen,
  Bot,
  ClipboardList,
  Code2,
  Cog,
  FileDown,
  GitCompare,
  Mic,
  ScanFace,
  ScanSearch,
  Swords,
  Timer,
  Trophy,
  Users,
} from 'lucide-react'
import { PublicPageWrapper } from '@/app/public-layout'
import { BentoBody, BentoCard, BentoIcon, BentoShell, BentoTitle } from '@/components/landing/bento-grid'
import { ThemeIllustration } from '@/components/landing/theme-illustration'
import { Illustration } from '@/components/illustrations/spot'
import { DeviceShowcase, SoftGlow } from '@/components/visuals'
import { PageHero, btnPrimary, btnSecondary } from '@/components/landing/page-hero'
import { AnswerSummary, SPEAKABLE_SELECTORS } from '@/components/seo/answer-summary'
import { FaqSection } from '@/components/seo/faq-list'
import { JsonLd } from '@/components/seo/json-ld'
import { ALL_SITE_FAQS } from '@/lib/seo/faq-content'
import { breadcrumbJsonLd, webPageJsonLd } from '@/lib/seo/jsonld'
import { getSiteUrl } from '@/lib/seo/site'
import type { Locale } from '@/lib/i18n/config'
import { localizedPath } from '@/lib/i18n/public-paths'
import { publicT } from '@/lib/i18n/public-server'
import { localizeFaqs, publicPageMetadata, seoCopy } from '@/lib/i18n/public-page'

/** /features body for every language (English: app/features/page.tsx, hi / te: app/[lang]/features). */
export const featuresMetadata = (locale: Locale) => publicPageMetadata('/features', locale)

const FEATURE_FAQS = [
  'What kinds of questions can an assessment include?',
  'What does proctoring check?',
  'Do you check for plagiarism?',
  'How do hackathons work?',
  'Can our organization use single sign-on?',
].map((q) => ALL_SITE_FAQS.find((f) => f.q === q)!).filter(Boolean)

function Group({ id, title, lead, children }: { id: string; title: string; lead: string; children: React.ReactNode }) {
  return (
    <section id={id} className="relative isolate scroll-mt-24 border-b border-cs-grid">
      <SoftGlow className="[mask-image:linear-gradient(to_bottom,#000,transparent_45%)]" />
      <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="mb-10 grid gap-4 lg:grid-cols-[1fr_1.2fr] lg:items-end lg:gap-16">
          <h2 className="cs-heading text-4xl sm:text-5xl">{title}</h2>
          <p className="max-w-[56ch] text-lg leading-relaxed text-cs-ink-soft">{lead}</p>
        </div>
        {children}
      </div>
    </section>
  )
}

export function FeaturesView({ locale }: { locale: Locale }) {
  const site = getSiteUrl()
  const t = publicT(locale)
  const lp = (p: string) => localizedPath(p, locale)
  const route = seoCopy('/features', locale)
  const JUMP = [
    ['#build', t('marketing.fBuild')],
    ['#run', t('marketing.fRun')],
    ['#decide', t('marketing.fDecide')],
    ['#candidates', t('marketing.fCandidates')],
  ] as const
  return (
    <PublicPageWrapper>
      <JsonLd
        data={[
          webPageJsonLd({ site, path: lp('/features'), name: route.title, description: route.description, speakable: SPEAKABLE_SELECTORS, inLanguage: locale }),
          breadcrumbJsonLd([{ name: t('marketing.crumbHome'), path: lp('/') }, { name: t('public.navFeatures'), path: lp('/features') }], site),
        ]}
      />
      <PageHero
        title={t('marketing.fHeroTitle')}
        lead={
          <>
            {t('marketing.fHeroLead')} <strong className="font-semibold text-cs-ink">{t('marketing.fHeroLeadStrong')}</strong>{t('marketing.fHeroLeadEnd')}
          </>
        }
        actions={
          <>
            <Link href={lp('/contact')} className={btnPrimary}>{t('public.bookPilot')}</Link>
            <Link href={lp('/pricing')} className={btnSecondary}>{t('landing.seePricing')}</Link>
          </>
        }
        art={<DeviceShowcase variant="analytics" compact />}
      />

      {/* jump links */}
      <nav aria-label={t('marketing.fGroups')} className="sticky top-16 z-30 border-b border-cs-grid bg-cs-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1200px] gap-1 overflow-x-auto px-4 py-2 sm:px-6 lg:px-8">
          {JUMP.map(([href, label]) => (
            <a key={href} href={href} className="whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold text-cs-ink-soft transition-colors hover:bg-cs-accent/10 hover:text-cs-accent-text">
              {label}
            </a>
          ))}
        </div>
      </nav>

      <div className="mx-auto max-w-[1200px] px-4 pt-12 sm:px-6 lg:px-8">
        <AnswerSummary
          label={t('marketing.fTakeaways')}
          answer={t('marketing.fTakeawaysAnswer')}
          points={[t('marketing.fTakeaway1'), t('marketing.fTakeaway2'), t('marketing.fTakeaway3')]}
        />
      </div>

      <Group id="build" title={t('marketing.fBuild')} lead={t('marketing.fBuildLead')}>
        <BentoShell>
          <BentoCard className="sm:col-span-2 lg:row-span-2">
            <BentoIcon><ClipboardList className="h-5 w-5" aria-hidden /></BentoIcon>
            <BentoTitle>{t('marketing.fAnyRoleTitle')}</BentoTitle>
            <BentoBody>{t('marketing.fAnyRoleBody')}</BentoBody>
            <div className="mt-auto pt-6">
              <DeviceShowcase variant="builder" compact />
            </div>
          </BentoCard>
          <BentoCard className="sm:col-span-2">
            <div className="grid h-full gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
              <div>
                <BentoIcon><Trophy className="h-5 w-5" aria-hidden /></BentoIcon>
                <BentoTitle>{t('marketing.fPointsTitle')}</BentoTitle>
                <BentoBody>{t('marketing.fPointsBody')}</BentoBody>
              </div>
              <Illustration name="leaderboard" className="hidden w-36 sm:block" />
            </div>
          </BentoCard>
          <BentoCard>
            <BentoIcon><Cog className="h-5 w-5" aria-hidden /></BentoIcon>
            <BentoTitle>{t('public.bentoCadTitle')}</BentoTitle>
            <BentoBody className="text-sm">{t('marketing.fCadBody')}</BentoBody>
          </BentoCard>
          <BentoCard>
            <BentoIcon><Users className="h-5 w-5" aria-hidden /></BentoIcon>
            <BentoTitle>{t('marketing.fSmeTitle')}</BentoTitle>
            <BentoBody className="text-sm">{t('marketing.fSmeBody')}</BentoBody>
          </BentoCard>
        </BentoShell>
      </Group>

      <Group id="run" title={t('marketing.fRun')} lead={t('marketing.fRunLead')}>
        <BentoShell>
          <BentoCard className="sm:col-span-2 lg:row-span-2">
            <BentoIcon><ScanFace className="h-5 w-5" aria-hidden /></BentoIcon>
            <BentoTitle>{t('marketing.fProctorTitle')}</BentoTitle>
            <BentoBody>{t('marketing.fProctorBody')}</BentoBody>
            <div className="mt-auto pt-6">
              <DeviceShowcase variant="proctor" compact />
            </div>
          </BentoCard>
          <BentoCard className="lg:col-span-2">
            <div className="grid h-full gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <BentoIcon><Timer className="h-5 w-5" aria-hidden /></BentoIcon>
                <BentoTitle>{t('marketing.fTimedTitle')}</BentoTitle>
                <BentoBody className="text-sm">{t('marketing.fTimedBody')}</BentoBody>
              </div>
              <Illustration name="mock-test" className="hidden w-32 lg:block" />
            </div>
          </BentoCard>
          <BentoCard className="lg:col-span-2">
            <div className="grid h-full gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <BentoIcon><GitCompare className="h-5 w-5" aria-hidden /></BentoIcon>
                <BentoTitle>{t('public.bentoPlagiarismTitle')}</BentoTitle>
                <BentoBody className="text-sm">{t('public.bentoPlagiarismBody')}</BentoBody>
              </div>
              <Illustration name="scanner" className="hidden w-32 lg:block" />
            </div>
          </BentoCard>
          <BentoCard className="sm:col-span-2 lg:col-span-4">
            <div className="grid h-full gap-6 md:grid-cols-[1fr_1.3fr] md:items-center">
              <div>
                <BentoIcon><Swords className="h-5 w-5" aria-hidden /></BentoIcon>
                <BentoTitle>{t('public.navHackathons')}</BentoTitle>
                <BentoBody>{t('marketing.fHackathonBody')}</BentoBody>
                <Link href="/hackathons" className="mt-4 inline-block text-sm font-semibold text-cs-accent-text hover:underline">{t('public.bentoHackathonCta')}</Link>
              </div>
              <ThemeIllustration name="hackathon-team" alt={t('public.bentoAltTeam')} width={420} height={210} className="w-full" />
            </div>
          </BentoCard>
        </BentoShell>
      </Group>

      <Group id="decide" title={t('marketing.fDecide')} lead={t('marketing.fDecideLead')}>
        <BentoShell>
          <BentoCard className="sm:col-span-2 lg:row-span-2">
            <BentoIcon><Trophy className="h-5 w-5" aria-hidden /></BentoIcon>
            <BentoTitle>{t('marketing.fRankedTitle')}</BentoTitle>
            <BentoBody>{t('marketing.fRankedBody')}</BentoBody>
            <div className="mt-auto pt-6">
              <DeviceShowcase variant="results" compact />
            </div>
          </BentoCard>
          <BentoCard className="sm:col-span-2">
            <div className="grid h-full gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
              <div>
                <BentoIcon><Bot className="h-5 w-5" aria-hidden /></BentoIcon>
                <BentoTitle>{t('marketing.fAiTitle')}</BentoTitle>
                <BentoBody>{t('marketing.fAiBody')}</BentoBody>
              </div>
              <Illustration name="ai" className="hidden w-36 sm:block" />
            </div>
          </BentoCard>
          <BentoCard>
            <BentoIcon><FileDown className="h-5 w-5" aria-hidden /></BentoIcon>
            <BentoTitle>{t('marketing.fCsvTitle')}</BentoTitle>
            <BentoBody className="text-sm">{t('marketing.fCsvBody')}</BentoBody>
          </BentoCard>
          <BentoCard>
            <BentoIcon><BadgeCheck className="h-5 w-5" aria-hidden /></BentoIcon>
            <BentoTitle>{t('marketing.fReleaseTitle')}</BentoTitle>
            <BentoBody className="text-sm">{t('marketing.fReleaseBody')}</BentoBody>
          </BentoCard>
        </BentoShell>
      </Group>

      <Group id="candidates" title={t('marketing.fCandidates')} lead={t('marketing.fCandidatesLead')}>
        <div className="grid gap-8 lg:grid-cols-[1.35fr_1fr] lg:items-start lg:gap-10">
        <BentoShell className="lg:grid-cols-2">
          {[
            [Code2, t('marketing.fCodingTitle'), t('marketing.fCodingBody')],
            [Timer, t('marketing.fMockTitle'), t('marketing.fMockBody')],
            [Mic, t('public.footInterviewPrep'), t('marketing.fInterviewBody')],
            [BookOpen, t('marketing.fCoursesTitle'), t('marketing.fCoursesBody')],
            [BadgeCheck, t('marketing.fCertsTitle'), t('marketing.fCertsBody')],
            [ScanSearch, t('marketing.fScannerTitle'), t('marketing.fScannerBody')],
          ].map(([Icon, title, body]) => {
            const I = Icon as typeof Code2
            return (
              <BentoCard key={title as string}>
                <BentoIcon><I className="h-5 w-5" aria-hidden /></BentoIcon>
                <BentoTitle>{title as string}</BentoTitle>
                <BentoBody className="text-sm">{body as string}</BentoBody>
              </BentoCard>
            )
          })}
          <BentoCard className="sm:col-span-2" href="/auth/signup" label={t('public.createFreeAccount')}>
            <BentoTitle>{t('public.createFreeAccount')}</BentoTitle>
            <BentoBody>{t('marketing.fFreeBody')}</BentoBody>
            <span className={`${btnPrimary} mt-auto self-start`}>{t('landing.startPractising')}</span>
          </BentoCard>
        </BentoShell>
        <DeviceShowcase variant="certificate" compact className="hidden lg:sticky lg:top-32 lg:block" />
        </div>
      </Group>
      <FaqSection title={t('marketing.fFaqTitle')} items={localizeFaqs(FEATURE_FAQS, t)} id="features-faq" inLanguage={locale} />
    </PublicPageWrapper>
  )
}

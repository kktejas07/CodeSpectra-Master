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
import { buildMetadata } from '@/lib/seo/metadata'
import { breadcrumbJsonLd, webPageJsonLd } from '@/lib/seo/jsonld'
import { publicRoute } from '@/lib/seo/public-routes'
import { getSiteUrl } from '@/lib/seo/site'

const route = publicRoute('/features')!
export const metadata = buildMetadata({ title: route.title, description: route.description, path: '/features' })

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

const JUMP = [
  ['#build', 'Build'],
  ['#run', 'Run'],
  ['#decide', 'Decide'],
  ['#candidates', 'For candidates'],
] as const

export default function FeaturesPage() {
  const site = getSiteUrl()
  return (
    <PublicPageWrapper>
      <JsonLd
        data={[
          webPageJsonLd({ site, path: '/features', name: route.title, description: route.description, speakable: SPEAKABLE_SELECTORS }),
          breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Features', path: '/features' }], site),
        ]}
      />
      <PageHero
        title="Everything a screening needs, in one place"
        lead={
          <>
            Build an assessment for any role, run it under proctoring, and get a ranked shortlist your team can trust.
            Candidates get <strong className="font-semibold text-cs-ink">practice, mock tests and certificates</strong> on the same platform.
          </>
        }
        actions={
          <>
            <Link href="/contact" className={btnPrimary}>Book a pilot</Link>
            <Link href="/pricing" className={btnSecondary}>See pricing</Link>
          </>
        }
        art={<DeviceShowcase variant="analytics" compact />}
      />

      {/* jump links */}
      <nav aria-label="Feature groups" className="sticky top-16 z-30 border-b border-cs-grid bg-cs-paper/90 backdrop-blur">
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
          label="Key takeaways"
          answer="CodeSpectra covers the whole screening: build a test for any role, run it under proctoring, and get a difficulty-weighted ranked shortlist with integrity flags beside each score."
          points={[
            'Build: coding with hidden tests, MCQ, written and CAD questions in one assessment',
            'Run: fullscreen lock, tab-switch and face-match proctoring, plagiarism checks',
            'Decide: one ranked list, CSV export, released scores; plus hackathons and free practice for candidates',
          ]}
        />
      </div>

      <Group id="build" title="Build" lead="Start from the role and experience band. Every question is weighted by difficulty and editable before it goes out.">
        <BentoShell>
          <BentoCard className="sm:col-span-2 lg:row-span-2">
            <BentoIcon><ClipboardList className="h-5 w-5" aria-hidden /></BentoIcon>
            <BentoTitle>Assessments for any role</BentoTitle>
            <BentoBody>
              Mix coding with hidden test cases, multiple choice, true or false, fill-in-the-blank, written answers and CAD
              design tasks in one test.
            </BentoBody>
            <div className="mt-auto pt-6">
              <DeviceShowcase variant="builder" compact />
            </div>
          </BentoCard>
          <BentoCard className="sm:col-span-2">
            <div className="grid h-full gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
              <div>
                <BentoIcon><Trophy className="h-5 w-5" aria-hidden /></BentoIcon>
                <BentoTitle>Difficulty-weighted points</BentoTitle>
                <BentoBody>Easy questions score 3, medium 4 and hard 5, so freshers and seniors are each assessed at the right level and still ranked fairly.</BentoBody>
              </div>
              <Illustration name="leaderboard" className="hidden w-36 sm:block" />
            </div>
          </BentoCard>
          <BentoCard>
            <BentoIcon><Cog className="h-5 w-5" aria-hidden /></BentoIcon>
            <BentoTitle>CAD design tasks</BentoTitle>
            <BentoBody className="text-sm">For mechanical and design roles: model a part, review a drawing.</BentoBody>
          </BentoCard>
          <BentoCard>
            <BentoIcon><Users className="h-5 w-5" aria-hidden /></BentoIcon>
            <BentoTitle>Subject-expert review</BentoTitle>
            <BentoBody className="text-sm">Send written and design answers to an expert reviewer for marking.</BentoBody>
          </BentoCard>
        </BentoShell>
      </Group>

      <Group id="run" title="Run" lead="Invite candidates by email, send reminders, and let proctoring run for the whole session.">
        <BentoShell>
          <BentoCard className="sm:col-span-2 lg:row-span-2">
            <BentoIcon><ScanFace className="h-5 w-5" aria-hidden /></BentoIcon>
            <BentoTitle>Live proctoring</BentoTitle>
            <BentoBody>Fullscreen lock, tab-switch detection, webcam face matching against the ID photo, copy-paste blocking and second-screen detection.</BentoBody>
            <div className="mt-auto pt-6">
              <DeviceShowcase variant="proctor" compact />
            </div>
          </BentoCard>
          <BentoCard className="lg:col-span-2">
            <div className="grid h-full gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <BentoIcon><Timer className="h-5 w-5" aria-hidden /></BentoIcon>
                <BentoTitle>Timed sessions</BentoTitle>
                <BentoBody className="text-sm">Each invite opens a timed attempt with a visible countdown.</BentoBody>
              </div>
              <Illustration name="mock-test" className="hidden w-32 lg:block" />
            </div>
          </BentoCard>
          <BentoCard className="lg:col-span-2">
            <div className="grid h-full gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <BentoIcon><GitCompare className="h-5 w-5" aria-hidden /></BentoIcon>
                <BentoTitle>Plagiarism check</BentoTitle>
                <BentoBody className="text-sm">Code answers are compared across everyone who took the test.</BentoBody>
              </div>
              <Illustration name="scanner" className="hidden w-32 lg:block" />
            </div>
          </BentoCard>
          <BentoCard className="sm:col-span-2 lg:col-span-4">
            <div className="grid h-full gap-6 md:grid-cols-[1fr_1.3fr] md:items-center">
              <div>
                <BentoIcon><Swords className="h-5 w-5" aria-hidden /></BentoIcon>
                <BentoTitle>Hackathons</BentoTitle>
                <BentoBody>Teams of up to five join with one link, claim problems and submit a repository. Judges score each entry out of 100 on a shared rubric, then release results.</BentoBody>
                <Link href="/hackathons" className="mt-4 inline-block text-sm font-semibold text-cs-accent-text hover:underline">See upcoming hackathons</Link>
              </div>
              <ThemeIllustration name="hackathon-team" alt="A team of five submits a repository that judges score out of 100" width={420} height={210} className="w-full" />
            </div>
          </BentoCard>
        </BentoShell>
      </Group>

      <Group id="decide" title="Decide" lead="Every candidate is scored the same way. Your team reviews a ranked shortlist instead of a pile of attempts.">
        <BentoShell>
          <BentoCard className="sm:col-span-2 lg:row-span-2">
            <BentoIcon><Trophy className="h-5 w-5" aria-hidden /></BentoIcon>
            <BentoTitle>Ranked shortlist</BentoTitle>
            <BentoBody>Candidates arrive ordered by points, with integrity flags beside each score.</BentoBody>
            <div className="mt-auto pt-6">
              <DeviceShowcase variant="results" compact />
            </div>
          </BentoCard>
          <BentoCard className="sm:col-span-2">
            <div className="grid h-full gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
              <div>
                <BentoIcon><Bot className="h-5 w-5" aria-hidden /></BentoIcon>
                <BentoTitle>AI-assisted grading</BentoTitle>
                <BentoBody>Grade written answers in bulk with AI, then review and adjust before releasing scores.</BentoBody>
              </div>
              <Illustration name="ai" className="hidden w-36 sm:block" />
            </div>
          </BentoCard>
          <BentoCard>
            <BentoIcon><FileDown className="h-5 w-5" aria-hidden /></BentoIcon>
            <BentoTitle>CSV export</BentoTitle>
            <BentoBody className="text-sm">Download results for your own hiring tools.</BentoBody>
          </BentoCard>
          <BentoCard>
            <BentoIcon><BadgeCheck className="h-5 w-5" aria-hidden /></BentoIcon>
            <BentoTitle>Release scores</BentoTitle>
            <BentoBody className="text-sm">Publish results to candidates when you’re ready.</BentoBody>
          </BentoCard>
        </BentoShell>
      </Group>

      <Group id="candidates" title="For candidates" lead="A free account gives candidates somewhere to prepare before test day, and somewhere to show what they can do after it.">
        <div className="grid gap-8 lg:grid-cols-[1.35fr_1fr] lg:items-start lg:gap-10">
        <BentoShell className="lg:grid-cols-2">
          {[
            [Code2, 'Coding practice', 'Problems and challenges with real test cases.'],
            [Timer, 'Mock tests', 'Timed practice tests in the same format as the real thing.'],
            [Mic, 'Interview prep', 'Practice interviews with feedback.'],
            [BookOpen, 'Courses and tracks', 'Structured lessons with progress tracking.'],
            [BadgeCheck, 'Certificates', 'Certificates for completed assessments that anyone can verify online.'],
            [ScanSearch, 'Code scanner', 'Scan your own projects and get AI-assisted fixes.'],
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
          <BentoCard className="sm:col-span-2" href="/auth/signup" label="Create a free account">
            <BentoTitle>Create a free account</BentoTitle>
            <BentoBody>Practise, take assessments you’re invited to, and keep your certificates in one place.</BentoBody>
            <span className={`${btnPrimary} mt-auto self-start`}>Start practising</span>
          </BentoCard>
        </BentoShell>
        <DeviceShowcase variant="certificate" compact className="hidden lg:sticky lg:top-32 lg:block" />
        </div>
      </Group>
      <FaqSection title="Feature questions" items={FEATURE_FAQS} id="features-faq" />
    </PublicPageWrapper>
  )
}

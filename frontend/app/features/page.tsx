'use client'

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
import { PageHero, btnPrimary, btnSecondary } from '@/components/landing/page-hero'

function Group({ id, title, lead, children }: { id: string; title: string; lead: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-b border-cs-grid">
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
  return (
    <PublicPageWrapper>
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
        art={<ThemeIllustration name="code-visor" alt="" width={240} height={200} priority className="mx-auto w-full max-w-[320px]" />}
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
              <ThemeIllustration name="step-build" alt="Questions stacked by difficulty, worth 3, 4 and 5 points" width={160} height={120} className="mx-auto w-full max-w-[360px]" />
            </div>
          </BentoCard>
          <BentoCard className="sm:col-span-2">
            <BentoIcon><Trophy className="h-5 w-5" aria-hidden /></BentoIcon>
            <BentoTitle>Difficulty-weighted points</BentoTitle>
            <BentoBody>Easy questions score 3, medium 4 and hard 5, so freshers and seniors are each assessed at the right level and still ranked fairly.</BentoBody>
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
          <BentoCard className="sm:col-span-2">
            <div className="grid h-full gap-6 sm:grid-cols-[1.1fr_1fr] sm:items-center">
              <div>
                <BentoIcon><ScanFace className="h-5 w-5" aria-hidden /></BentoIcon>
                <BentoTitle>Live proctoring</BentoTitle>
                <BentoBody>Fullscreen lock, tab-switch detection, webcam face matching against the ID photo, copy-paste blocking and second-screen detection.</BentoBody>
              </div>
              <ThemeIllustration name="step-proctor" alt="Webcam proctoring with face check" width={160} height={120} className="w-full" />
            </div>
          </BentoCard>
          <BentoCard>
            <BentoIcon><Timer className="h-5 w-5" aria-hidden /></BentoIcon>
            <BentoTitle>Timed sessions</BentoTitle>
            <BentoBody className="text-sm">Each invite opens a timed attempt with a visible countdown.</BentoBody>
          </BentoCard>
          <BentoCard>
            <BentoIcon><GitCompare className="h-5 w-5" aria-hidden /></BentoIcon>
            <BentoTitle>Plagiarism check</BentoTitle>
            <BentoBody className="text-sm">Code answers are compared across everyone who took the test.</BentoBody>
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
              <ThemeIllustration name="step-review" alt="Candidates sorted into a ranked shortlist" width={160} height={120} className="mx-auto w-full max-w-[360px]" />
            </div>
          </BentoCard>
          <BentoCard className="sm:col-span-2">
            <BentoIcon><Bot className="h-5 w-5" aria-hidden /></BentoIcon>
            <BentoTitle>AI-assisted grading</BentoTitle>
            <BentoBody>Grade written answers in bulk with AI, then review and adjust before releasing scores.</BentoBody>
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
        <BentoShell>
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
      </Group>
    </PublicPageWrapper>
  )
}

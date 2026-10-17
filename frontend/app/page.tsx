'use client'

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { useHasUserSession } from '@/hooks/use-has-user-session'
import { PublicPageWrapper, DASHBOARD_HREF } from '@/app/public-layout'
import { ResultsSheet } from '@/components/landing/results-sheet'
import { cn } from '@/lib/utils'

/* Shared button styles for marketing pages. Kept here rather than in
   components/ui/button so the dashboard's mint button stays untouched. */
const btnPrimary =
  'inline-flex h-12 items-center justify-center rounded-md bg-cs-blue px-6 text-[15px] font-semibold text-cs-blue-ink transition-[filter] hover:brightness-110'
const btnSecondary =
  'inline-flex h-12 items-center justify-center rounded-md border border-cs-ink/25 px-6 text-[15px] font-semibold text-cs-ink transition-colors hover:border-cs-ink'

const STEPS = [
  {
    title: 'Build the assessment',
    body: 'Pick the role and experience band. Code Spectra assembles a question mix weighted to that level, and you can edit any question before it goes out.',
  },
  {
    title: 'Invite candidates',
    body: 'Email invites to your applicant list and send reminders to anyone who hasn’t started. Each invite opens a timed, proctored session.',
  },
  {
    title: 'Candidates take it under proctoring',
    body: 'Fullscreen lock, tab-switch detection, webcam face matching and copy-paste blocking run during the test. Every event lands on the candidate’s report.',
  },
  {
    title: 'Review the shortlist',
    body: 'Candidates arrive ranked by difficulty-weighted points. Check flags, read answers, then release results or export them as CSV.',
  },
]

const DOMAINS = [
  {
    name: 'Software engineering',
    task: 'Write and run code in the browser against hidden test cases, plus MCQs and short written answers.',
    scoring: 'Auto-graded on test cases passed; plagiarism compared across the cohort.',
  },
  {
    name: 'Mechanical and CAD design',
    task: 'Model a part or assembly, such as a pump or valve component, and review engineering drawings.',
    scoring: 'Design tasks graded against a rubric, with subject-expert review where you want it.',
  },
  {
    name: 'QA and test automation',
    task: 'Write automation scripts and design test cases for a real feature spec.',
    scoring: 'Code answers auto-graded on test cases; test design marked by rubric.',
  },
  {
    name: 'Aptitude and written',
    task: 'Multiple choice, true or false, fill-in-the-blank and long-form answers for any discipline.',
    scoring: 'Objective questions auto-scored; written answers marked by rubric.',
  },
]

const WEIGHTS = [
  { level: 'Easy', points: 3 },
  { level: 'Medium', points: 4 },
  { level: 'Hard', points: 5 },
]

const RUBRIC = [
  { label: 'Correctness', weight: 40 },
  { label: 'Code quality', weight: 20 },
  { label: 'Efficiency', weight: 20 },
  { label: 'Documentation', weight: 10 },
  { label: 'Edge cases', weight: 10 },
]

export default function Home() {
  const hasSession = useHasUserSession()

  return (
    <PublicPageWrapper>
      {/* Hero — headline, then the product's real output: a ranked shortlist */}
      <section className="cs-graph relative border-b border-cs-grid">
        {/* fade the grid out behind the headline so type stays crisp */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[70%] bg-linear-to-b from-cs-paper via-cs-paper/90 to-cs-paper/0" />
        <div className="relative mx-auto max-w-[1200px] px-4 pt-16 pb-16 sm:px-6 sm:pt-20 lg:px-8 lg:pb-24">
          <h1 className="cs-display max-w-[19ch] text-[2.9rem] sm:text-7xl lg:text-[5.5rem]">
            Assess 100 applicants. Interview the 20 who can do the job.
          </h1>

          <div className="mt-8 flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <p className="max-w-[56ch] text-lg leading-relaxed text-cs-ink-soft">
              Code Spectra runs proctored skills assessments for software, CAD and mechanical design, QA and
              aptitude roles. Every candidate is scored the same way and ranked, so your team spends interview
              time only on the strongest.
            </p>
            <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
              <Link href="/contact" className={btnPrimary}>
                Book a pilot
              </Link>
              <Link href={hasSession ? DASHBOARD_HREF : '/auth/signup'} className={btnSecondary}>
                {hasSession ? 'Go to dashboard' : 'Create a free account'}
              </Link>
            </div>
          </div>

          <div className="mt-14 lg:mt-16">
            <ResultsSheet />
          </div>
        </div>
      </section>

      {/* How a screening runs — a genuine sequence, so numbered */}
      <section className="border-b border-cs-grid">
        <div className="mx-auto max-w-[1200px] px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <h2 className="cs-heading max-w-[20ch] text-4xl sm:text-5xl">How a screening runs</h2>
          <ol className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
            {STEPS.map((step, i) => (
              <li key={step.title} className="border-t-2 border-cs-ink pt-5">
                <span className="cs-display block text-5xl text-cs-blue" aria-hidden>
                  {i + 1}
                </span>
                <h3 className="mt-4 text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 leading-relaxed text-cs-ink-soft">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Domains — rows, because each has the same two attributes to compare */}
      <section className="border-b border-cs-grid">
        <div className="mx-auto max-w-[1200px] px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr] lg:gap-16">
            <h2 className="cs-heading max-w-[16ch] text-4xl sm:text-5xl">Assess the role, not only the code</h2>
            <p className="max-w-[60ch] text-lg leading-relaxed text-cs-ink-soft lg:pt-2">
              Hiring for a plant, a design office or a test team works the same way as hiring developers.
              Each role gets tasks that match the work, and the same ranking at the end.
            </p>
          </div>

          <div className="mt-12 border-t border-cs-ink">
            <div className="hidden grid-cols-[1fr_1.5fr_1.5fr] gap-8 py-3 text-sm text-cs-ink-soft md:grid">
              <span>Role family</span>
              <span>What candidates do</span>
              <span>How it is scored</span>
            </div>
            {DOMAINS.map((d) => (
              <div
                key={d.name}
                className="grid gap-2 border-t border-cs-grid py-6 md:grid-cols-[1fr_1.5fr_1.5fr] md:gap-8"
              >
                <h3 className="text-xl font-semibold">{d.name}</h3>
                <p className="leading-relaxed">{d.task}</p>
                <p className="leading-relaxed text-cs-ink-soft">{d.scoring}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Scoring + integrity — side by side on desktop */}
      <section className="border-b border-cs-grid bg-cs-sheet">
        <div className="mx-auto grid max-w-[1200px] gap-16 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:gap-20 lg:px-8 lg:py-28">
          <div>
            <h2 className="cs-heading text-4xl sm:text-5xl">Scored fairly for every level</h2>
            <p className="mt-5 max-w-[52ch] text-lg leading-relaxed text-cs-ink-soft">
              Harder questions are worth more. A fresher gets a set weighted towards easy and medium questions;
              a senior gets more hard ones. Both are ranked on points, so nobody is penalised for the level
              they were assessed at.
            </p>
            <dl className="mt-10 grid max-w-md grid-cols-3 border-t border-cs-ink">
              {WEIGHTS.map((w) => (
                <div key={w.level} className="border-r border-cs-grid pt-4 pr-4 last:border-r-0 [&:not(:first-child)]:pl-4">
                  <dt className="text-sm text-cs-ink-soft">{w.level}</dt>
                  <dd className="cs-display mt-1 text-6xl">
                    {w.points}
                    <span className="ml-1 text-base font-medium [font-stretch:100%] text-cs-ink-soft">points</span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div>
            <h2 className="cs-heading text-4xl sm:text-5xl">Integrity you can check</h2>
            <p className="mt-5 max-w-[52ch] text-lg leading-relaxed text-cs-ink-soft">
              Proctoring runs for the whole session. Anything unusual is logged with a timestamp on the
              candidate’s report, so a reviewer decides what it means.
            </p>
            <ul className="mt-10 divide-y divide-cs-grid border-y border-cs-grid">
              {[
                ['Fullscreen lock', 'Every exit from fullscreen is logged.'],
                ['Tab-switch detection', 'Each switch away from the test is counted.'],
                ['Webcam face matching', 'Snapshots are matched to the candidate’s ID photo; a missing face is flagged.'],
                ['Second-screen detection', 'Extra monitors are detected at the start of the session.'],
                ['Copy-paste blocking', 'Copy and paste are disabled, and every attempt is recorded.'],
                ['Plagiarism comparison', 'Code answers are compared across everyone who took the test.'],
              ].map(([title, desc]) => (
                <li key={title} className="grid gap-1 py-4 sm:grid-cols-[11rem_1fr] sm:gap-6">
                  <span className="font-semibold">{title}</span>
                  <span className="text-cs-ink-soft">{desc}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Hackathons */}
      <section className="border-b border-cs-grid">
        <div className="mx-auto max-w-[1200px] px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr] lg:gap-16">
            <div>
              <h2 className="cs-heading max-w-[18ch] text-4xl sm:text-5xl">Run hackathons on the same platform</h2>
              <p className="mt-5 max-w-[52ch] text-lg leading-relaxed text-cs-ink-soft">
                Teams of up to five join with a shared link, claim problems and submit their repository. Judges
                score every submission on one rubric and release results when they are ready.
              </p>
              <Link
                href="/hackathons"
                className="mt-8 inline-block font-semibold text-cs-blue underline decoration-2 underline-offset-4 hover:decoration-cs-blue/50"
              >
                See upcoming hackathons
              </Link>
            </div>

            <figure className="self-end">
              <figcaption className="mb-4 text-sm text-cs-ink-soft">Judging rubric, out of 100</figcaption>
              <div className="flex h-14 overflow-hidden rounded-sm" role="img" aria-label={RUBRIC.map((r) => `${r.label} ${r.weight}`).join(', ')}>
                {RUBRIC.map((r, i) => (
                  <div
                    key={r.label}
                    style={{ width: `${r.weight}%` }}
                    className={cn(
                      'flex items-center border-r-2 border-cs-paper px-3 font-semibold tabular-nums last:border-r-0',
                      i === 0 ? 'bg-cs-ink text-cs-paper' : i < 3 ? 'bg-cs-blue text-cs-blue-ink' : 'bg-cs-grid text-cs-ink',
                    )}
                  >
                    {r.weight}
                  </div>
                ))}
              </div>
              <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
                {RUBRIC.map((r) => (
                  <li key={r.label} className="flex justify-between gap-3 border-b border-cs-grid pb-2">
                    <span>{r.label}</span>
                    <span className="tabular-nums text-cs-ink-soft">{r.weight}</span>
                  </li>
                ))}
              </ul>
            </figure>
          </div>
        </div>
      </section>

      {/* Candidates — secondary audience */}
      <section className="border-b border-cs-grid bg-cs-sheet">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-4 py-14 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <div className="max-w-[60ch]">
            <h2 className="text-2xl font-semibold">Taking a Code Spectra assessment?</h2>
            <p className="mt-2 leading-relaxed text-cs-ink-soft">
              Use the link from your invite. Before test day you can practise coding problems, try mock tests
              and earn certificates on your own free account.
            </p>
          </div>
          <div className="flex shrink-0 gap-3">
            <Link href="/auth/login" className={btnSecondary}>
              Sign in
            </Link>
            <Link href="/auth/signup" className={btnSecondary}>
              Start practising
            </Link>
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="cs-graph relative">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-linear-to-r from-cs-paper via-cs-paper/85 to-cs-paper/40" />
        <div className="relative mx-auto max-w-[1200px] px-4 py-24 sm:px-6 lg:px-8 lg:py-32">
          <h2 className="cs-display max-w-[16ch] text-5xl sm:text-6xl lg:text-7xl">
            Run your next screening on Code Spectra.
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
      </section>
    </PublicPageWrapper>
  )
}

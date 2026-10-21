/**
 * /interview-report/[token] — a mock-interview report the learner chose to
 * share. Shows scores, feedback, model answers and study links only: never
 * the learner's answers, code, recording or name. Not indexed.
 *
 * Rendered per request with no data cache on purpose: turning sharing off
 * (or deleting the interview) must kill the link immediately, and tokens are
 * unguessable one-off keys, so a cache would only hold stale private data.
 */
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PublicPageWrapper } from '@/app/public-layout'
import { ReportView } from '@/components/interview-sim/report-view'
import { getSharedSession } from '@/lib/interview-sim/store'
import { publicReport } from '@/lib/interview-sim/engine'
import { levelLabel, roundLabel } from '@/lib/interview-sim/types'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Mock interview report',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

export default async function SharedInterviewReport({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const s = await getSharedSession(token)
  const pub = s ? publicReport(s) : null
  if (!pub) notFound()
  const { config, report, completed_at } = pub
  return (
    <PublicPageWrapper>
      <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-10 sm:px-6">
        <header className="space-y-1">
          <p className="text-sm text-muted-foreground">Mock interview report · shared by the candidate</p>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-[1.75rem]">{roundLabel(config.round)} · {config.role}</h1>
          <p className="text-[15px] text-muted-foreground">
            {config.company_name ? `${config.company_name}-style · ` : ''}{levelLabel(config.level)}{completed_at ? ` · ${new Date(completed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
          </p>
          <p className="text-xs text-muted-foreground">A practice session scored by CodeSpectra’s AI interviewer — not an assessment by the company named.</p>
        </header>
        <ReportView report={report} />
        <p className="text-sm text-muted-foreground">
          Want to practise too? <Link href="/dashboard/interview-sim" className="font-medium text-primary hover:underline">Try a mock interview</Link>.
        </p>
      </main>
    </PublicPageWrapper>
  )
}

'use client'
import { useLocaleDates } from '@/lib/i18n/use-dates'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Video, Calendar, Clock, ArrowRight, Bot, Brain } from 'lucide-react'
import { SkeletonList } from '@/components/ui/skeleton-boneyard'
import { usePageGuard } from '@/lib/use-page-guard'
import { useTour, autoPlayPageTour, type TourStep } from '@/components/tour/tour-context'
import { DIFFICULTY_LABELS, DIFFICULTY_COLORS, toDifficultyLevel } from '@/lib/difficulty-levels'
import { PageHeader, Panel } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { useT } from '@/lib/i18n/client'

interface Interview {
  id: string; title: string; type: string; role: string
  status: string; scheduled_at: string; duration_minutes: number
  interviewer_id: string; candidate_id: string
  questions: any[]; overall_score?: number
}

export default function InterviewsPage() {
  const { formatDateTime } = useLocaleDates()
  const { td, t } = useT()
  const gate = usePageGuard('user')
  const { startTour, setTourSeen } = useTour()

  const [interviews, setInterviews] = useState<Interview[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  // Past AI mock interviews (CORE-016): reports are saved on the server.
  const [practice, setPractice] = useState<Array<{ id: string; role: string; difficulty: string; status: string; started_at: string | null; overall_score: number | null; category: string | null }>>([])
  useEffect(() => {
    fetch('/api/interviews/ai-mock', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setPractice(Array.isArray(j?.sessions) ? j.sessions : []))
      .catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const res = await fetch('/api/interviews', { cache: 'no-store' })
      if (!res.ok) throw new Error(String(res.status))
      const j = await res.json()
      setInterviews(Array.isArray(j.items) ? (j.items as Interview[]) : [])
    } catch {
      setLoadError(true)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  // Initialize tour on first visit
  useEffect(() => {
    if (gate.ready) {
      const interviewsTour: TourStep[] = [
        {
          target: '[data-tour="interviews-header"]',
          title: t('career.yourInterviews'),
          description: t('career.viewAllYourScheduledAndPast371'),
          position: 'bottom',
        },
        {
          target: '[data-tour="interviews-schedule-btn"]',
          title: t('career.scheduleAnInterview'),
          description: t('career.clickHereToScheduleANewa66'),
          position: 'bottom',
        },
        {
          target: '[data-tour="interviews-list"]',
          title: t('career.interviewList'),
          description: t('career.browseYourInterviewsClickAnyCardbcc'),
          position: 'bottom',
        },
      ]
      autoPlayPageTour('interviews', interviewsTour)}
  }, [gate.ready, startTour, setTourSeen])

  if (!gate.ready) return null

  const statusColor: Record<string, string> = {
    scheduled: 'bg-primary/10 text-primary border-primary/20',
    in_progress: 'bg-green-500/10 text-green-700 dark:text-green-400',
    completed: 'bg-muted text-muted-foreground',
    cancelled: 'bg-destructive/10 text-destructive',
  }

  return (
    <div className="space-y-6">
      <div data-tour="interviews-header">
        <PageHeader
          illustration="interview"
          className="mb-0"
          icon={<Video aria-hidden />}
          title={t('career.interviews')}
          description={t('career.yourScheduledAndPastInterviewsPlus6c3')}
          actions={
            <Button asChild>
              <Link href="/dashboard/interviews/schedule" data-tour="interviews-schedule-btn">
                <Video className="mr-1 h-4 w-4" />{' '}{t('career.scheduleInterview')}</Link>
            </Button>
          }
        />
      </div>

      <Link href="/dashboard/interviews/ai-mock/setup" className="block rounded-3xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
        <Panel interactive className="group flex cursor-pointer items-center gap-4 p-5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 transition-colors group-hover:bg-primary">
            <Brain className="h-5 w-5 text-primary transition-colors group-hover:text-primary-foreground" aria-hidden />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-foreground">{t('career.startAnAiMockInterview')}</h3>
            <p className="text-sm text-muted-foreground">{t('career.practiceWithAiGeneratedQuestionsTailored742')}</p>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
        </Panel>
      </Link>

      {practice.length > 0 && (
        <section aria-labelledby="practice-history" className="space-y-3">
          <h2 id="practice-history" className="text-lg font-semibold text-foreground">{t('career.yourPracticeInterviews')}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {practice.slice(0, 10).map((p) => (
              <Link key={p.id} href={`/dashboard/interviews/ai-mock?session=${encodeURIComponent(p.id)}`} className="block rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                <Panel interactive className="flex items-center justify-between gap-3 rounded-2xl p-4">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{p.role || t('career.practiceInterview')}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">{p.difficulty}{p.started_at ? ` · ${formatDateTime(p.started_at)}` : ''}</p>
                  </div>
                  {p.status === 'completed' && p.overall_score !== null
                    ? <span className="shrink-0 text-lg font-semibold tabular-nums text-foreground">{Math.round(p.overall_score)}<span className="text-xs text-muted-foreground">/100</span></span>
                    : <Badge variant="outline">{p.status === 'completed' ? t('career.report') : t('career.notFinished')}</Badge>}
                </Panel>
              </Link>
            ))}
          </div>
        </section>
      )}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          <SkeletonList count={4} />
        </div>
      ) : loadError ? (
        <EmptyState
          illustration="error"
          title={t('career.couldntLoadInterviews')}
          description={t('career.checkYourConnectionAndTryAgain')}
          actionLabel={t('common.tryAgain')}
          onAction={() => void load()}
        />
      ) : interviews.length === 0 ? (
        <EmptyState illustration="interview"
          variant="sessions"
          title={t('career.noInterviewsYet')}
          description={t('career.scheduleOneAboveOrStartAn053')}
          actionLabel={t('career.startAnAiMockInterview')}
          actionHref="/dashboard/interviews/ai-mock/setup"
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2" data-tour="interviews-list">
          {interviews.map((iv) => (
            // One card, two separate links: the title link stretches over the
            // card; "View feedback" sits above it (no link inside a link).
            <Panel key={iv.id} interactive className="relative h-full p-5 space-y-3 focus-within:ring-2 focus-within:ring-ring">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-foreground">
                      <Link href={`/dashboard/interviews/${iv.id}`} className="after:absolute after:inset-0 after:rounded-3xl after:content-[''] focus-visible:outline-none">
                        {iv.title}
                      </Link>
                    </h3>
                    <p className="text-xs text-muted-foreground">{iv.role} · {iv.type}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {iv.type && (() => {
                      const dl = toDifficultyLevel(iv.type)
                      return dl ? (
                        <Badge variant="outline" className={`text-[10px] ${DIFFICULTY_COLORS[dl]}`}>
                          {td(`career.difficultyLabels:${dl}`, DIFFICULTY_LABELS[dl])}
                        </Badge>
                      ) : null
                    })()}
                    <Badge variant="outline" className={`capitalize ${statusColor[iv.status] || ''}`}>{String(iv.status ?? '').replace('_', ' ')}</Badge>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs tabular-nums text-muted-foreground">
                  <Calendar className="h-3 w-3" /> {formatDateTime(iv.scheduled_at)}
                  <Clock className="h-3 w-3 ml-2" /> {iv.duration_minutes} min
                </div>
                {iv.overall_score !== undefined && (
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${iv.overall_score}%` }} />
                    </div>
                    <span className="text-xs font-medium tabular-nums text-foreground">{Math.round(iv.overall_score)}%</span>
                  </div>
                )}
                {iv.questions?.length > 0 && (
                  <p className="text-xs text-muted-foreground tabular-nums">{iv.questions.length} {iv.questions.length === 1 ? t('career.question') : t('career.questions')}</p>
                )}
                {iv.status === 'completed' && (
                  <Link
                    href={`/dashboard/interviews/feedback?id=${iv.id}`}
                    className="relative z-10 inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1 rounded focus-visible:outline-2 focus-visible:outline-primary"
                  >{t('career.viewFeedback')}{' '}<ArrowRight className="h-3 w-3" aria-hidden />
                  </Link>
                )}
            </Panel>
          ))}
        </div>
      )}
    </div>
  )
}

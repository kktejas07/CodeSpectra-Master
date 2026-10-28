'use client'
import { useLocaleDates } from '@/lib/i18n/use-dates'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { usePageGuard } from '@/lib/use-page-guard'
import { useTour, autoPlayPageTour, type TourStep } from '@/components/tour/tour-context'
import { DIFFICULTY_LABELS, DIFFICULTY_COLORS, toDifficultyLevel } from '@/lib/difficulty-levels'
import { Trophy, BarChart3, CheckCircle, XCircle, FileText, BrainCircuit, Clock } from 'lucide-react'
import { SkeletonStats, SkeletonCard, SkeletonTable } from '@/components/ui/skeleton-boneyard'
import { PageHeader, Panel, StatCard } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { useT } from '@/lib/i18n/client'

interface Attempt {
  id: string
  exam_id: string
  title: string
  level: string
  score: number | null
  total_questions: number
  answered: number
  /** null until the organiser releases scores. */
  passed: boolean | null
  score_released?: boolean
  status: string
  submitted_at: string
  certificate_url?: string
}

interface AvailableExam {
  id: string
  title: string
  level: string
  subject?: string
  duration: number
  questions: number
  access_type: 'invite_only' | 'open'
  source: 'invite' | 'open'
  invite_status?: string
  target_url: string
}

export default function MyAssessmentsPage() {
  const { formatDate } = useLocaleDates()
  const { td, t } = useT()
  const gate = usePageGuard('user')
  const router = useRouter()
  const { startTour, setTourSeen } = useTour()
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [available, setAvailable] = useState<AvailableExam[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!gate.ready) return
    setLoading(true)
    setLoadError(false)
    fetch('/api/user/assessments', { credentials: 'include' })
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json() })
      .then(json => {
        if (json.attempts) setAttempts(json.attempts)
        if (Array.isArray(json.available)) setAvailable(json.available)
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }, [gate.ready, reloadKey])

  // Initialize tour on first visit
  useEffect(() => {
    if (gate.ready) {
      const assessmentsTour: TourStep[] = [
        {
          target: '[data-tour="assessments-header"]',
          title: t('practice.myAssessments'),
          description: t('practice.viewYourPastAssessmentAttemptsScores964'),
          position: 'bottom',
        },
        {
          target: '[data-tour="assessments-browse"]',
          title: t('practice.browseAssessments'),
          description: t('practice.exploreAvailableAssessmentsToTakeAnd3b1'),
          position: 'bottom',
        },
        {
          target: '[data-tour="assessments-kpis"]',
          title: t('practice.yourStats'),
          description: t('practice.seeYourTotalAttemptsPassRatec4e'),
          position: 'bottom',
        },
        {
          target: '[data-tour="assessments-ready"]',
          title: t('practice.readyToTake'),
          description: t('practice.assessmentsAssignedToYouOrOpenf6c'),
          position: 'bottom',
        },
        {
          target: '[data-tour="assessments-table"]',
          title: t('practice.attemptHistory'),
          description: t('practice.reviewYourDetailedAttemptHistoryAnde04'),
          position: 'bottom',
        },
      ]
      autoPlayPageTour('assessments', assessmentsTour)}
  }, [gate.ready, startTour, setTourSeen])

  if (!gate.ready) return null

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-muted/60 animate-pulse" />
          <div className="space-y-2">
            <div className="h-8 w-48 bg-muted/60 rounded animate-pulse" />
            <div className="h-4 w-64 bg-muted/40 rounded animate-pulse" />
          </div>
        </div>
        <SkeletonStats />
        <SkeletonCard />
        <SkeletonTable rows={5} />
      </div>
    )
  }

  const totalAttempts = attempts.length
  // Only released results count (unreleased rows carry no score).
  const releasedRows = attempts.filter(a => a.score != null)
  const passedCount = releasedRows.filter(a => a.passed === true).length
  const avgScore = releasedRows.length > 0
    ? Math.round(releasedRows.reduce((sum, a) => sum + (a.score ?? 0), 0) / releasedRows.length)
    : 0

  const columns: DataTableColumn<Attempt>[] = [
    {
      key: 'title',
      header: t('practice.assessment'),
      cell: (row) => (
        <div>
          <p className="font-medium text-foreground">{row.title}</p>
          <p className="text-xs text-muted-foreground">ID: {row.exam_id.slice(0, 8)}</p>
        </div>
      ),
    },
    {
      key: 'level',
      header: t('practice.level'),
      cell: (row) => {
        const dl = toDifficultyLevel(row.level)
        const label = dl ? td(`practice.difficultyLabels:${dl}`, DIFFICULTY_LABELS[dl]) : (row.level || '—')
        const color = dl ? DIFFICULTY_COLORS[dl] : 'bg-muted text-muted-foreground'
        return <Badge variant="outline" className={`text-xs ${color}`}>{label}</Badge>
      },
    },
    {
      key: 'score',
      header: t('practice.score'),
      cell: (row) => (
        <span className="font-semibold tabular-nums">
          {row.score != null ? `${row.score}%` : '—'}
        </span>
      ),
    },
    {
      key: 'passed',
      header: t('practice.status'),
      cell: (row) => row.passed === null || row.passed === undefined ? (
        <Badge variant="outline" className="text-xs gap-1 text-muted-foreground">
          <Clock className="h-3 w-3" />{t('practice.awaitingResults')}</Badge>
      ) : (
        <Badge variant="outline" className={`text-xs gap-1 ${
          row.passed ? 'text-green-600 border-green-500/30' : 'text-red-600 border-red-500/30'
        }`}>
          {row.passed ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
          {row.passed ? t('practice.pass') : t('practice.fail')}
        </Badge>
      ),
    },
    {
      key: 'submitted_at',
      header: t('practice.date'),
      cell: (row) => (
        <span className="text-xs text-muted-foreground">
          {row.submitted_at ? formatDate(row.submitted_at, undefined, {
            month: 'short', day: 'numeric', year: 'numeric',
          }) : '—'}
        </span>
      ),
    },
    {
      key: 'certificate_url',
      header: t('practice.certificate'),
      cell: (row) => (
        row.certificate_url ? (
          <a href={row.certificate_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">{t('practice.viewCertificate')}</a>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <div data-tour="assessments-header">
        <PageHeader
          illustration="assessment"
          title={t('practice.myAssessments')}
          description={t('practice.testsYoureInvitedToPlusYourceb')}
          icon={<FileText />}
          className="mb-0"
          actions={
            <Button variant="outline" size="sm" className="gap-2" asChild>
              <Link href="/dashboard/assessments" data-tour="assessments-browse">
                <BarChart3 className="h-4 w-4" />{' '}{t('practice.browseAssessments')}</Link>
            </Button>
          }
        />
      </div>

      {/* KPI Row */}
      <div className="grid gap-4 sm:grid-cols-3" data-tour="assessments-kpis">
        <StatCard label={t('practice.totalAttempts')} value={totalAttempts} icon={<BarChart3 />} />
        <StatCard label={t('practice.passed')} value={passedCount} icon={<CheckCircle />} />
        <StatCard label={t('practice.averageScore')} value={`${avgScore}%`} icon={<Trophy />} />
      </div>

      {/* AI Fluency Assessment Card */}
      <Panel className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
              <BrainCircuit className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-foreground">{t('practice.aiFluencyAssessment')}</p>
              <p className="text-xs text-muted-foreground">{t('practice.testYourPromptWritingAiOutput423')}</p>
            </div>
          </div>
          <Button size="sm" className="gap-1" asChild>
            <Link href="/dashboard/assessments/ai-fluency/setup">{t('practice.start')}{' '}<BarChart3 className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </Panel>

      {/* Assigned / Ready-to-take */}
      {available.length > 0 && (
        <div className="space-y-3" data-tour="assessments-ready">
          <h2 className="text-lg font-semibold text-foreground">{t('practice.readyToTake2')}</h2>
          {available.map(ex => (
            <Panel key={ex.id} interactive className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="font-medium text-foreground">{ex.title}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">{t('practice.levelValueDurationMinQuestionsQuestions', { value: (ex.level || '').toLowerCase(), duration: ex.duration, questions: ex.questions })}</p>
                  <Badge variant="outline" className={`text-xs ${
                    ex.source === 'invite' ? 'border-primary/40 text-primary' : 'text-muted-foreground'
                  }`}>
                    {ex.source === 'invite' ? t('practice.assignedToYou') : t('practice.openAssessment')}
                  </Badge>
                </div>
                <Button size="sm" onClick={() => router.push(ex.target_url)}>{t('practice.start')}</Button>
              </div>
            </Panel>
          ))}
        </div>
      )}

      {/* Attempts Table */}
      <div data-tour="assessments-table">
      {loadError ? (
        <Panel className="p-4">
          <EmptyState illustration="error"
            title={t('practice.couldntLoadYourAssessments')}
            description={t('practice.checkYourConnectionAndTryAgain')}
            actionLabel={t('common.tryAgain')}
            onAction={() => setReloadKey((k) => k + 1)}
          />
        </Panel>
      ) : attempts.length === 0 ? (
        <Panel className="p-4">
          <EmptyState illustration="assessment"
            title={t('practice.noAttemptsYet')}
            description={t('practice.whenYouFinishAnAssessmentYour542')}
            actionLabel={t('practice.tryAMockTest')}
            actionHref="/dashboard/mock-tests"
          />
        </Panel>
      ) : (
        <DataTable
          columns={columns}
          data={attempts.map(a => ({ ...a, id: a.id }))}
          searchPlaceholder={t('practice.searchAssessments')}
          searchKeys={['title', 'level']}
          pageSize={15}
          emptyMessage={t('practice.noAttemptsFound')}
        />
      )}
      </div>
    </div>
  )
}

'use client'
import { useLocaleDates } from '@/lib/i18n/use-dates'

import { useEffect, useState } from 'react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useTour, autoPlayPageTour, type TourStep } from '@/components/tour/tour-context'
import { Badge } from '@/components/ui/badge'
import { PageHeader, Panel, StatCard } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { Scene } from '@/components/illustrations/scenes'
import { SoftGlow } from '@/components/visuals'
import { OUTCOME_LABELS, OUTCOME_STATUSES, type OutcomeStatus } from '@/lib/hiring-outcomes'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from 'recharts'
import {
  Users, TrendingUp, AlertTriangle, Shield, Clock, Target, Loader, Eye,
  Download, ArrowUpDown,
} from 'lucide-react'
import { useT } from '@/lib/i18n/client'

interface Candidate {
  candidate_id: string
  interviews: number
  avgScore: number
  roles: string[]
  statuses: string[]
  latestInterview: string
}

interface InterviewRow {
  id: string
  title: string
  role: string
  type: string
  status: string
  overall_score?: number
  candidate_id: string
  created_at: string
  completed_at?: string
  proctorFlags: number
}

interface AnalyticsData {
  totalInterviews: number
  completedInterviews: number
  inProgressInterviews: number
  avgScore: number
  candidates: Candidate[]
  roleBreakdown: Record<string, number>
  typeBreakdown: Record<string, number>
  violationTypes: Record<string, number>
  flaggedSessions: number
  scoreDistribution: { range: string; count: number }[]
  recentInterviews: InterviewRow[]
}

// Primary (royal blue) leads; the rest stay distinguishable from it and from each other.
const COLORS = ['var(--color-primary)', '#F59E0B', '#06B6D4', '#EC4899', '#8B5CF6']
const TOOLTIP_STYLE = { backgroundColor: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: '12px', color: 'var(--color-card-foreground)' }

export default function RecruiterAnalyticsPage() {
  const { formatDate } = useLocaleDates()
  const { td, t } = useT()
  const gate = usePageGuard('tenant_admin')
  const { startTour, setTourSeen } = useTour()
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  /** Hiring outcomes recorded on assessment results pages (counts only). */
  const [outcomes, setOutcomes] = useState<{ counts: Record<OutcomeStatus, number>; total: number } | null>(null)

  useEffect(() => {
    fetch('/api/admin/hiring-outcomes?summary=1', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j && j.counts) setOutcomes(j) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetch('/api/recruiter/analytics')
      .then(r => r.json())
      .then(json => { if (!json.error) setData(json) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // First-visit guided tour (same pattern as the other dashboard pages).
  useEffect(() => {
    if (gate.ready) {
      const recruiterAnalyticsTour: TourStep[] = [
        {
          target: '[data-tour="recruiter-analytics-header"]',
          title: t('hiring.hiringInsightsHub'),
          description: t('hiring.trackCandidatePerformanceAndInterviewAct2aa'),
          position: 'bottom',
        },
        {
          target: '[data-tour="recruiter-analytics-kpis"]',
          title: t('hiring.keyHiringMetrics'),
          description: t('hiring.totalsAverageScoresCandidateCountsAnd44c'),
          position: 'bottom',
        },
        {
          target: '[data-tour="recruiter-analytics-ranking"]',
          title: t('hiring.rankEveryCandidate'),
          description: t('hiring.compareAverageScoresAndRolesSide4b3'),
          position: 'top',
        },
      ]
      autoPlayPageTour('recruiter-analytics', recruiterAnalyticsTour)}
  }, [gate.ready, startTour, setTourSeen])

  const exportCsv = () => {
    if (!data) return
    const headers = ['Rank', 'Candidate', 'Interviews', 'Avg score', 'Roles', 'Latest']
    const rows = data.candidates.map((c, i) => [
      i + 1,
      c.candidate_id.slice(0, 8),
      c.interviews,
      `${Math.round(c.avgScore)}%`,
      c.roles.join('; '),
      formatDate(c.latestInterview),
    ])
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `candidate-ranking-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!gate.ready) {
    return <div className="flex items-center justify-center py-20"><Loader className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }

  if (!data) {
    return (
      <div className="space-y-6">
        <div className="relative isolate">
          <SoftGlow className="-inset-y-6 [mask-image:radial-gradient(ellipse_at_75%_45%,#000_30%,transparent_72%)]" />
          <PageHeader
            className="mb-0"
            title={t('hiring.recruiterAnalytics')}
            description={t('hiring.candidatePerformanceAndInterviewInsights')}
            icon={<TrendingUp />}
          />
        </div>
        <div className="grid items-stretch gap-6 lg:grid-cols-2">
          <EmptyState illustration="interview"
            title={t('hiring.noInterviewDataYet')}
            description={t('hiring.createInterviewsAndInviteCandidatesScorec6a')}
            actionLabel={t('hiring.goToInterviews')}
            actionHref="/dashboard/interviews"
            className="h-full"
          />
          <div className="hidden items-center justify-center lg:flex">
            <Scene name="analytics-review" className="w-full max-w-[420px]" />
          </div>
        </div>
      </div>
    )
  }

  const rolePieData = Object.entries(data.roleBreakdown).map(([name, value]) => ({ name, value }))
  const typePieData = Object.entries(data.typeBreakdown).map(([name, value]) => ({ name, value }))
  const violationBarData = Object.entries(data.violationTypes)
    .map(([name, count]) => ({ name: name.replace(/_/g, ' '), count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)

  return (
    <div className="space-y-8">
      <div data-tour="recruiter-analytics-header" className="relative isolate">
        <SoftGlow className="-inset-y-6 [mask-image:radial-gradient(ellipse_at_75%_45%,#000_30%,transparent_72%)]" />
        <PageHeader
          illustration="analytics"
          className="mb-0"
          title={t('hiring.recruiterAnalytics')}
          description={t('hiring.candidatePerformanceAndInterviewInsightsfeb')}
          icon={<TrendingUp />}
          actions={data && data.candidates.length > 0 ? (
            <button
              onClick={exportCsv}
              className="flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors duration-200 hover:border-primary/40 hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary"
            >
              <Download className="h-4 w-4" />{t('hiring.exportCsv')}</button>
          ) : undefined}
        />
      </div>

      {/* KPI Cards */}
      <div className="cs-stagger grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5" data-tour="recruiter-analytics-kpis">
        <StatCard icon={<Users />} label={t('hiring.totalInterviews')} value={data.totalInterviews} hint={t('hiring.completedinterviewsCompleted', { completedInterviews: data.completedInterviews })} />
        <StatCard icon={<TrendingUp />} label={t('hiring.averageScore')} value={`${data.avgScore}%`} hint={t('hiring.acrossAllInterviews')} />
        <StatCard icon={<Target />} label={t('hiring.candidates')} value={data.candidates.length} hint={t('hiring.uniqueCandidatesAssessed')} />
        <StatCard
          icon={<AlertTriangle />}
          label={t('hiring.flaggedSessions')}
          value={data.flaggedSessions}
          hint={t('hiring.sessionsWithProctoringFlags')}
          className={data.flaggedSessions > 0 ? '[&>span:first-child]:border-red-500/20 [&>span:first-child]:bg-red-500/10 [&>span:first-child]:text-red-600 dark:[&>span:first-child]:text-red-400' : undefined}
        />
      </div>

      {outcomes && outcomes.total > 0 && (
        <Panel>
          <h2 className="mb-1 text-lg font-semibold text-foreground">{t('hiring.hiringOutcomes')}</h2>
          <p className="mb-4 text-sm text-muted-foreground">{t('hiring.recordedByYourTeamOnAssessment5e9')}</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {OUTCOME_STATUSES.map((st) => (
              <div key={st} className="rounded-2xl border border-border/70 p-3">
                <div className="text-2xl font-bold tabular-nums text-foreground">{outcomes.counts[st] ?? 0}</div>
                <div className="text-xs text-muted-foreground">{td(`hiring.outcomeLabels:${st}`, OUTCOME_LABELS[st])}</div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Interview Volume Trends */}
      {data.recentInterviews.length > 2 && (
        <Panel>
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
            <TrendingUp className="h-5 w-5 text-primary" />{t('hiring.scoresAndFlagsLatest20Interviews')}</h2>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.recentInterviews.slice().reverse().map((interview, i) => ({
                index: i + 1,
                score: interview.overall_score ?? 0,
                flags: interview.proctorFlags,
              }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="index" stroke="var(--color-muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={11} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Line type="monotone" dataKey="score" stroke="var(--color-primary)" strokeWidth={2} dot={{ r: 3 }} name="Score %" />
                <Line type="monotone" dataKey="flags" stroke="#EF4444" strokeWidth={2} strokeDasharray="4 3" dot={{ r: 3 }} name="Proctor flags" />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      )}

      {/* Charts Row */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Score Distribution */}
        <Panel className="lg:col-span-2">
          <h2 className="mb-4 text-lg font-semibold text-foreground">{t('hiring.scoreDistribution')}</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.scoreDistribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="range" stroke="var(--color-muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="count" fill="var(--color-primary)" radius={[6, 6, 0, 0]} name="Candidates" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        {/* Role Breakdown */}
        <Panel>
          <h2 className="mb-4 text-lg font-semibold text-foreground">{t('hiring.byRole')}</h2>
          {rolePieData.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={rolePieData} cx="50%" cy="50%" innerRadius={50} outerRadius={90} dataKey="value" label={({ name, percent }: any) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}>
                    {rolePieData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState illustration="analytics" title={t('hiring.noDataYet')} description={t('hiring.thisFillsInAsInterviewsAre42e')} className="border-0 bg-transparent py-4 md:py-6 [&_h3]:text-base" />
          )}
        </Panel>
      </div>

      {/* Proctor Violations & Interview Type */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Panel>
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
            <Shield className="h-5 w-5 text-red-500" />{t('hiring.proctoringFlagsByType')}</h2>
          {violationBarData.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={violationBarData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis type="number" stroke="var(--color-muted-foreground)" fontSize={12} />
                  <YAxis type="category" dataKey="name" stroke="var(--color-muted-foreground)" fontSize={11} width={120} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Bar dataKey="count" fill="#EF4444" radius={[0, 6, 6, 0]} name="Events" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState illustration="proctoring" title={t('hiring.noProctoringFlagsRecorded')} description={t('hiring.flagsFromProctoredInterviewsAreGrouped28d')} className="border-0 bg-transparent py-4 md:py-6 [&_h3]:text-base" />
          )}
        </Panel>

        <Panel>
          <h2 className="mb-4 text-lg font-semibold text-foreground">{t('hiring.byInterviewType')}</h2>
          {typePieData.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={typePieData} cx="50%" cy="50%" innerRadius={50} outerRadius={90} dataKey="value" label={({ name, percent }: any) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}>
                    {typePieData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState illustration="analytics" title={t('hiring.noDataYet')} description={t('hiring.thisFillsInAsInterviewsAre42e')} className="border-0 bg-transparent py-4 md:py-6 [&_h3]:text-base" />
          )}
        </Panel>
      </div>

      {/* Candidate Comparison Table with Ranking */}
      <Panel data-tour="recruiter-analytics-ranking">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
          <ArrowUpDown className="h-5 w-5 text-primary" />{t('hiring.candidateRanking')}</h2>
        {data.candidates.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground w-12">#</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">{t('hiring.candidate')}</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">{t('hiring.interviews')}</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">{t('hiring.avgScore')}</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">{t('hiring.roles')}</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">{t('hiring.latest')}</th>
                </tr>
              </thead>
              <tbody>
                {data.candidates.map((c, i) => (
                  <tr key={i} className="border-b border-border/40 hover:bg-muted/30">
                    <td className="py-3 px-3">
                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                        i === 0 ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400' :
                        i === 1 ? 'bg-slate-400/15 text-slate-600 dark:text-slate-300' :
                        i === 2 ? 'bg-orange-500/15 text-orange-700 dark:text-orange-400' :
                        'bg-muted text-muted-foreground'
                      }`}>
                        {i + 1}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono text-xs">{c.candidate_id.slice(0, 8)}…</td>
                    <td className="py-3 px-3 tabular-nums">{c.interviews}</td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-16 rounded-full bg-muted">
                          <div
                            className={`h-2 rounded-full ${
                              c.avgScore >= 70 ? 'bg-green-500' : c.avgScore >= 40 ? 'bg-amber-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${c.avgScore}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium tabular-nums">{Math.round(c.avgScore)}%</span>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex flex-wrap gap-1">
                        {c.roles.map(r => <Badge key={r} variant="secondary" className="text-xs">{r}</Badge>)}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-xs text-muted-foreground">
                      {formatDate(c.latestInterview)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState illustration="team" title={t('hiring.noCandidatesYet')} description={t('hiring.candidatesAreRankedHereOnceThey2e6')} className="border-0 bg-transparent py-4 md:py-6 [&_h3]:text-base" />
        )}
      </Panel>

      {/* Recent Interviews */}
      <Panel>
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
          <Clock className="h-5 w-5 text-primary" />{t('hiring.recentInterviews')}</h2>
        {data.recentInterviews.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">{t('hiring.title')}</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">{t('hiring.role')}</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">{t('hiring.type')}</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">{t('hiring.status')}</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">{t('hiring.score')}</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">{t('hiring.flags')}</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">{t('hiring.date')}</th>
                </tr>
              </thead>
              <tbody>
                {data.recentInterviews.map((interview) => (
                  <tr key={interview.id} className="border-b border-border/40 hover:bg-muted/30">
                    <td className="py-3 px-3 font-medium">{interview.title}</td>
                    <td className="py-3 px-3"><Badge variant="secondary">{interview.role}</Badge></td>
                    <td className="py-3 px-3 text-xs">{interview.type}</td>
                    <td className="py-3 px-3">
                      <Badge variant={
                        interview.status === 'completed' ? 'default' :
                        interview.status === 'in_progress' ? 'outline' : 'secondary'
                      }>
                        {interview.status.replace(/_/g, ' ')}
                      </Badge>
                    </td>
                    <td className="py-3 px-3">
                      {typeof interview.overall_score === 'number' ? (
                        <span className={`font-medium ${
                          interview.overall_score >= 70 ? 'text-green-600 dark:text-green-400' :
                          interview.overall_score >= 40 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'
                        }`}>
                          {Math.round(interview.overall_score)}%
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      {interview.proctorFlags > 0 ? (
                        <span className="flex items-center gap-1 text-xs tabular-nums text-red-600 dark:text-red-400">
                          <AlertTriangle className="h-3 w-3" />
                          {interview.proctorFlags}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">0</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-xs text-muted-foreground">
                      {formatDate(interview.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState illustration="interview" variant="sessions" title={t('hiring.noInterviewsYet')} description={t('hiring.yourMostRecentInterviewsWillBeabe')} className="border-0 bg-transparent py-4 md:py-6 [&_h3]:text-base" />
        )}
      </Panel>
    </div>
  )
}

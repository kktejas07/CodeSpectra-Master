'use client'

import { useEffect, useState } from 'react'
import { Activity, CheckCircle2, Clock, Sparkles, Target, TrendingUp, Users, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePageGuard } from '@/lib/use-page-guard'
import { useTour, autoPlayPageTour, type TourStep } from '@/components/tour/tour-context'
import { SkeletonStats, SkeletonCard, SkeletonTable } from '@/components/ui/skeleton-boneyard'
import { PageHeader, Panel, StatCard } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'

interface SkillData {
  user?: { email?: string; id?: string } | null
  totals?: {
    submissions?: number
    accepted?: number
    accuracy_pct?: number
    avg_score?: number
    avg_time_ms?: number
    top_skill?: string
    top_score?: number
  } | null
  by_language?: Record<string, number> | null
  by_difficulty?: Record<string, number> | null
  recent?: Array<{
    problem: string
    difficulty: string
    passed?: number | null
    total?: number | null
    time_ms?: number | null
    language?: string | null
    score?: number | null
  }> | null
  ai_insights?: {
    strengths?: string[]
    weak_topics?: string[]
    recommended_problems?: string[]
    speed_assessment?: string
    accuracy_assessment?: string
    growth_plan?: string[]
  } | null
}

export default function SkillAnalyticsPage() {
  const gate = usePageGuard('user')
  const { startTour, setTourSeen } = useTour()

  const [data, setData] = useState<SkillData | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    setLoading(true)
    setErr(null)
    fetch('/api/analytics/skills', { cache: 'no-store' })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(j.error || (r.status === 429 ? 'Too many requests. Wait a moment and try again.' : `Something went wrong (${r.status}). Please try again.`))
        return j as SkillData
      })
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : 'Please try again.'))
      .finally(() => setLoading(false))
  }, [reloadKey])

  // First-visit guided tour (same pattern as the other dashboard pages).
  useEffect(() => {
    if (gate.ready) {
      const skillAnalyticsTour: TourStep[] = [
        {
          target: '[data-tour="skill-analytics-header"]',
          title: 'Skill fingerprint',
          description: 'Your problem-solving fingerprint, built from every submission.',
          position: 'bottom',
        },
        {
          target: '[data-tour="skill-analytics-kpis"]',
          title: 'Headline metrics',
          description: 'Submissions, accuracy, scores, and run time at a glance.',
          position: 'bottom',
        },
        {
          target: '[data-tour="skill-analytics-recent"]',
          title: 'Recent submissions',
          description: 'Per-problem tests, scores, and timing for your latest work.',
          position: 'top',
        },
      ]
      autoPlayPageTour('skill-analytics', skillAnalyticsTour)}
  }, [gate.ready, startTour, setTourSeen])

  if (!gate.ready) return null

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="h-7 w-40 bg-muted/60 rounded animate-pulse" />
          <div className="h-4 w-56 bg-muted/40 rounded animate-pulse" />
        </div>
        <SkeletonStats />
        <SkeletonCard />
        <div className="grid lg:grid-cols-2 gap-4">
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <SkeletonTable rows={5} />
      </div>
    )
  }
  if (err) {
    return (
      <EmptyState illustration="error"
        title="Couldn't load your skill analytics"
        description={err}
        actionLabel="Try again"
        onAction={() => setReloadKey((k) => k + 1)}
      />
    )
  }
  if (!data || !data.totals) {
    return (
      <EmptyState illustration="analytics"
        title="No skill data yet"
        description="Solve a few problems and your skill fingerprint will build up here."
        actionLabel="Go to problems"
        actionHref="/dashboard/problems"
      />
    )
  }

  const cards = [
    {
      icon: Activity,
      label: 'Submissions',
      value: data.totals.submissions ?? 0,
      hint: `${data.totals.accepted ?? 0} accepted`,
      testid: 'kpi-submissions',
    },
    {
      icon: CheckCircle2,
      label: 'Accuracy',
      value: typeof data.totals.accuracy_pct === 'number' ? `${data.totals.accuracy_pct}%` : '—',
      hint: 'Accepted / total',
      testid: 'kpi-accuracy',
    },
    {
      icon: TrendingUp,
      label: 'Avg score',
      value: typeof data.totals.avg_score === 'number' ? data.totals.avg_score.toLocaleString() : '—',
      hint: 'Across submissions',
      testid: 'kpi-avg-score',
    },
    {
      icon: Users,
      label: 'Top skill',
      value: data.totals.top_skill || '—',
      hint: data.totals.top_skill
        ? (typeof data.totals.top_score === 'number' ? `${data.totals.top_score}% proficiency` : 'Your strongest area')
        : 'No data yet',
      testid: 'kpi-top-skill',
    },
    {
      icon: Clock,
      label: 'Avg run time',
      value: typeof data.totals.avg_time_ms === 'number' ? `${data.totals.avg_time_ms}ms` : '—',
      hint: 'Across submissions',
      testid: 'kpi-time',
    },
  ]

  const userEmail = (data && data.user && data.user.email) || 'Problem Solver'
  const recentList = data.recent || []

  return (
    <div className="space-y-6" data-testid="skill-analytics-page">
      <div data-tour="skill-analytics-header">
        <PageHeader
          illustration="analytics"
          className="mb-0"
          icon={<Activity />}
          title="Skill analytics"
          description={<>{userEmail} — your problem-solving fingerprint, built from every submission.</>}
        />
      </div>

      {/* KPIs */}
      <div className="cs-stagger grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5" data-tour="skill-analytics-kpis">
        {cards.map((c) => (
          <div key={c.testid} data-testid={c.testid} className="min-w-0">
            <StatCard
              className="h-full"
              icon={<c.icon />}
              label={c.label}
              value={<span className="block truncate">{c.value}</span>}
              hint={c.hint}
            />
          </div>
        ))}
      </div>

      {/* AI Insights */}
      {data.ai_insights ? (
        <section
          className="rounded-3xl border border-primary/25 bg-primary/5 p-6"
          data-testid="ai-insights-block"
        >
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden />
            <h2 className="text-base font-semibold text-foreground">
              Your AI growth plan
            </h2>
          </div>
          <div className="grid lg:grid-cols-3 gap-4 text-sm">
            <Block title="Strengths" items={data.ai_insights.strengths || []} icon={Zap} />
            <Block title="Weak topics" items={data.ai_insights.weak_topics || []} icon={TrendingUp} />
            <Block
              title="Recommended"
              items={data.ai_insights.recommended_problems || []}
              icon={Target}
            />
          </div>
          {data.ai_insights.growth_plan && data.ai_insights.growth_plan.length > 0 && (
            <div className="mt-4 rounded-2xl border border-border/70 bg-card p-4 text-sm text-foreground">
              <div className="mb-1.5 font-semibold">Next steps</div>
              <ol className="list-decimal pl-4 space-y-1">
                {data.ai_insights.growth_plan.map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
              </ol>
            </div>
          )}
          <div className="mt-3 grid gap-3 text-sm text-foreground sm:grid-cols-2">
            {data.ai_insights.speed_assessment && (
              <div className="rounded-2xl border border-border/70 bg-card p-4">
                <div className="mb-1 text-xs font-medium text-muted-foreground">Speed</div>
                {data.ai_insights.speed_assessment}
              </div>
            )}
            {data.ai_insights.accuracy_assessment && (
              <div className="rounded-2xl border border-border/70 bg-card p-4">
                <div className="mb-1 text-xs font-medium text-muted-foreground">Accuracy</div>
                {data.ai_insights.accuracy_assessment}
              </div>
            )}
          </div>
        </section>
      ) : (
        <div className="rounded-3xl border border-dashed border-border bg-muted/30 p-5 text-sm text-muted-foreground">
          Submit at least 3 problems on the{' '}
          <a href="/dashboard/problems" className="font-medium text-primary underline-offset-4 hover:underline">
            Problems page
          </a>{' '}
          to unlock your AI growth plan.
        </div>
      )}

      {/* Breakdowns */}
      <div className="grid gap-4 lg:grid-cols-2 lg:gap-5">
        <KvCard title="By language" data={data.by_language || {}} testid="by-lang" />
        <KvCard title="By difficulty" data={data.by_difficulty || {}} testid="by-diff" />
      </div>

      {/* Recent submissions */}
      <Panel className="overflow-hidden p-0" data-tour="skill-analytics-recent">
        <div className="border-b border-border/70 px-6 py-4 text-base font-semibold text-foreground">
          Recent submissions
        </div>
        <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] md:min-w-0 text-sm">
          <thead className="bg-muted/40 text-left text-xs font-medium text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Problem</th>
              <th className="px-4 py-2.5 font-medium">Difficulty</th>
              <th className="px-4 py-2.5 font-medium">Language</th>
              <th className="px-4 py-2.5 text-right font-medium">Tests</th>
              <th className="px-4 py-2.5 text-right font-medium">Score</th>
              <th className="px-4 py-2.5 text-right font-medium">Time</th>
            </tr>
          </thead>
          <tbody>
            {(data.recent || []).map((r, i) => (
              <tr key={i} className="border-t border-border/50 text-foreground">
                <td className="px-4 py-2.5 font-mono text-xs">{r.problem}</td>
                <td className="px-4 py-2.5 capitalize">{r.difficulty}</td>
                <td className="px-4 py-2.5">{r.language || '—'}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {r.passed ?? '—'}/{r.total ?? '—'}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">{r.score ?? '—'}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{r.time_ms ?? '—'}ms</td>
              </tr>
            ))}
            {(data.recent || []).length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  No submissions yet. Solve a problem and it will show up here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </Panel>
    </div>
  )
}

function KvCard({
  title,
  data,
  testid,
}: {
  title: string
  data: Record<string, number>
  testid: string
}) {
  const safeData = data || {}
  const total = Object.values(safeData).reduce((a, b) => a + b, 0)
  const items = Object.entries(safeData).sort((a, b) => b[1] - a[1])
  return (
    <Panel data-testid={testid}>
      <div className="mb-4 text-base font-semibold text-foreground">{title}</div>
      <div className="space-y-3 text-sm">
        {items.length === 0 && <div className="text-muted-foreground">No data yet.</div>}
        {items.map(([k, v]) => {
          const pct = total === 0 ? 0 : Math.round((v / total) * 100)
          return (
            <div key={k}>
              <div className="flex items-center justify-between mb-0.5">
                <span className="capitalize text-foreground">{k}</span>
                <span className="tabular-nums text-muted-foreground">
                  {v} ({pct}%)
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn('h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none')}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

function Block({
  title,
  items,
  icon: Icon,
}: {
  title: string
  items: string[]
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-4">
      <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
        <Icon className="h-3.5 w-3.5 text-primary" /> {title}
      </div>
      <ul className="space-y-1.5 text-sm text-foreground">
        {items.length === 0 && <li className="text-muted-foreground">—</li>}
        {items.map((x, i) => (
          <li key={i} className="flex gap-1.5">
            <span className="text-primary">•</span>
            {x}
          </li>
        ))}
      </ul>
    </div>
  )
}


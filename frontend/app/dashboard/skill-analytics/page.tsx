'use client'

import { useEffect, useState } from 'react'
import { Activity, CheckCircle2, Clock, Sparkles, Target, TrendingUp, Users, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePageGuard } from '@/lib/use-page-guard'
import { useTour, autoPlayPageTour, type TourStep } from '@/components/tour/tour-context'
import { SkeletonStats, SkeletonCard, SkeletonTable } from '@/components/ui/skeleton-boneyard'

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

  useEffect(() => {
    fetch('/api/analytics/skills', { cache: 'no-store' })
      .then(async (r) => {
        const j = await r.json()
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
        return j as SkillData
      })
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [])

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
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        {err}
      </div>
    )
  }
  if (!data || !data.totals) {
    return (
      <div className="rounded-lg border border-border/60 bg-card/40 p-4 text-sm text-muted-foreground">
        No skill analytics data available yet. Start solving problems to build your fingerprint.
      </div>
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
      label: 'Avg Score',
      value: typeof data.totals.avg_score === 'number' ? data.totals.avg_score.toLocaleString() : '—',
      hint: 'Across submissions',
      testid: 'kpi-avg-score',
    },
    {
      icon: Users,
      label: 'Top Skill',
      value: data.totals.top_skill || 'Problem Solving',
      hint: data.totals.top_skill ? `${data.totals.top_score ?? 80}% proficiency` : 'No data yet',
      testid: 'kpi-top-skill',
    },
    {
      icon: Clock,
      label: 'Avg Run Time',
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
        <h1 className="text-2xl font-bold">Skill Analytics</h1>
        <p className="text-sm text-muted-foreground">
          {userEmail} — your problem-solving fingerprint.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3" data-tour="skill-analytics-kpis">
        {cards.map((c) => (
          <div
            key={c.testid}
            className="rounded-lg border border-border/60 bg-card/40 p-4"
            data-testid={c.testid}
          >
            <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wide">
              <c.icon className="h-3.5 w-3.5" /> {c.label}
            </div>
            <div className="mt-2 text-2xl font-bold">{c.value}</div>
            <div className="text-xs text-muted-foreground">{c.hint}</div>
          </div>
        ))}
      </div>

      {/* AI Insights */}
      {data.ai_insights ? (
        <section
          className="rounded-xl border border-primary/30 bg-primary/5 p-5"
          data-testid="ai-insights-block"
        >
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-primary">
              AI Growth Plan
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
            <div className="mt-4 rounded-lg border border-border/60 bg-card/40 p-3 text-xs">
              <div className="font-semibold mb-1.5">Next steps:</div>
              <ol className="list-decimal pl-4 space-y-1">
                {data.ai_insights.growth_plan.map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
              </ol>
            </div>
          )}
          <div className="mt-3 grid sm:grid-cols-2 gap-3 text-xs">
            {data.ai_insights.speed_assessment && (
              <div className="rounded border border-border/60 bg-card/40 p-3">
                <div className="text-muted-foreground mb-1">Speed</div>
                {data.ai_insights.speed_assessment}
              </div>
            )}
            {data.ai_insights.accuracy_assessment && (
              <div className="rounded border border-border/60 bg-card/40 p-3">
                <div className="text-muted-foreground mb-1">Accuracy</div>
                {data.ai_insights.accuracy_assessment}
              </div>
            )}
          </div>
        </section>
      ) : (
        <div className="rounded-lg border border-border/60 bg-card/40 p-4 text-sm text-muted-foreground">
          Submit at least 3 problems on the{' '}
          <a href="/dashboard/problems" className="text-primary underline">
            Problems page
          </a>{' '}
          to unlock your AI growth plan.
        </div>
      )}

      {/* Breakdowns */}
      <div className="grid lg:grid-cols-2 gap-4">
        <KvCard title="By language" data={data.by_language || {}} testid="by-lang" />
        <KvCard title="By difficulty" data={data.by_difficulty || {}} testid="by-diff" />
      </div>

      {/* Recent submissions */}
      <div className="rounded-xl border border-border/60 bg-card/40 overflow-hidden" data-tour="skill-analytics-recent">
        <div className="border-b border-border/60 px-4 py-3 text-sm font-semibold">
          Recent submissions
        </div>
        <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] md:min-w-0 text-xs">
          <thead className="text-left text-muted-foreground bg-card/20">
            <tr>
              <th className="px-3 py-2">Problem</th>
              <th className="px-3 py-2">Difficulty</th>
              <th className="px-3 py-2">Language</th>
              <th className="px-3 py-2 text-right">Tests</th>
              <th className="px-3 py-2 text-right">Score</th>
              <th className="px-3 py-2 text-right">Time</th>
            </tr>
          </thead>
          <tbody>
            {(data.recent || []).map((r, i) => (
              <tr key={i} className="border-t border-border/40">
                <td className="px-3 py-2 font-mono">{r.problem}</td>
                <td className="px-3 py-2 capitalize">{r.difficulty}</td>
                <td className="px-3 py-2">{r.language || '—'}</td>
                <td className="px-3 py-2 text-right">
                  {r.passed ?? '—'}/{r.total ?? '—'}
                </td>
                <td className="px-3 py-2 text-right">{r.score ?? '—'}</td>
                <td className="px-3 py-2 text-right">{r.time_ms ?? '—'}ms</td>
              </tr>
            ))}
            {(data.recent || []).length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  No submissions yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
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
    <div className="rounded-xl border border-border/60 bg-card/40 p-4" data-testid={testid}>
      <div className="text-sm font-semibold mb-3">{title}</div>
      <div className="space-y-2 text-xs">
        {items.length === 0 && <div className="text-muted-foreground">No data yet.</div>}
        {items.map(([k, v]) => {
          const pct = total === 0 ? 0 : Math.round((v / total) * 100)
          return (
            <div key={k}>
              <div className="flex items-center justify-between mb-0.5">
                <span className="capitalize">{k}</span>
                <span className="text-muted-foreground">
                  {v} ({pct}%)
                </span>
              </div>
              <div className="h-1.5 rounded bg-muted/60 overflow-hidden">
                <div
                  className={cn('h-full bg-primary')}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
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
    <div className="rounded-lg border border-border/60 bg-background/50 p-3">
      <div className="flex items-center gap-1.5 mb-2 text-xs text-muted-foreground uppercase tracking-wide">
        <Icon className="h-3 w-3" /> {title}
      </div>
      <ul className="space-y-1 text-xs">
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


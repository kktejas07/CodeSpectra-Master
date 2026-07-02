'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { BarChart3, HelpCircle, TrendingUp, Users, Activity, Code2, ListOrdered } from 'lucide-react'
import { useRoleGate } from '@/lib/use-role-gate'

type Metrics = {
  totalUsers: number
  activeNow: number
  challengesCount: number
  submissionsCount: number
  leaderboardRows: number
}

export default function Analytics() {
  const gate = useRoleGate({ require: 'superadmin' })
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!gate.ready) return
    const run = async () => {
      const res = await fetch('/api/admin/metrics', { credentials: 'include' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        const detail =
          typeof json.error === 'string'
            ? json.error
            : res.status === 503
              ? 'Server is missing the database service key (.env).'
              : 'Could not load metrics'
        setError(detail)
        return
      }
      setMetrics({
        totalUsers: json.totalUsers,
        activeNow: json.activeNow,
        challengesCount: json.challengesCount,
        submissionsCount: json.submissionsCount,
        leaderboardRows: json.leaderboardRows,
      })
    }
    void run()
  }, [gate.ready])

  const stats = metrics
    ? [
        { label: 'Total users', value: String(metrics.totalUsers), icon: Users, hint: 'Registered accounts' },
        { label: 'Active (15m)', value: String(metrics.activeNow), icon: Activity, hint: 'Users with recent in-app activity' },
        { label: 'Challenges', value: String(metrics.challengesCount), icon: Code2, hint: 'Total published challenges' },
        { label: 'Submissions', value: String(metrics.submissionsCount), icon: ListOrdered, hint: 'All-time code submissions' },
        { label: 'Leaderboard', value: String(metrics.leaderboardRows), icon: TrendingUp, hint: 'Ranked leaderboard entries' },
      ]
    : []

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h1 className="text-3xl font-bold">Insights</h1>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent side="right">
              <p className="text-xs max-w-[250px]">High-level KPIs from the database. For charts and audit context, see Operations overview.</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {error && (
        <Card className="border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{error}</Card>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <Card key={stat.label} className="p-6">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          <p className="text-xs max-w-[200px]">{stat.hint}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <p className="mt-2 text-3xl font-bold tabular-nums">{stat.value}</p>
                </div>
                <Icon className="h-8 w-8 shrink-0 text-primary/50" />
              </div>
            </Card>
          )
        })}
      </div>

      <Card className="p-6">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Analysis detail</h2>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="right">
                <p className="text-xs max-w-[250px]">Trend lines, role distribution, and submission histograms live on the Operations overview to keep this view lightweight.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          See Operations overview for trend charts, role distribution, and histograms.
        </p>
      </Card>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { BarChart3, TrendingUp, Users, Activity, Code2, ListOrdered } from 'lucide-react'
import { supabase } from '@/lib/supabase-client'
import { getDefaultDashboard, isSuperAdmin, normalizeUserRole } from '@/lib/rbac'

type Metrics = {
  totalUsers: number
  activeNow: number
  challengesCount: number
  submissionsCount: number
  leaderboardRows: number
}

export default function Analytics() {
  const router = useRouter()
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const run = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth/login')
        return
      }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      const meta = (user.user_metadata as { role?: string } | undefined)?.role
      const role = normalizeUserRole(profile?.role ?? meta)
      if (!isSuperAdmin(role)) {
        router.replace(getDefaultDashboard(role))
        return
      }

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
  }, [router])

  const stats = metrics
    ? [
        { label: 'Total users', value: String(metrics.totalUsers), icon: Users, hint: 'Registered accounts' },
        { label: 'Active (15m)', value: String(metrics.activeNow), icon: Activity, hint: 'Recent in-app activity' },
        { label: 'Challenges', value: String(metrics.challengesCount), icon: Code2, hint: 'Published challenges' },
        { label: 'Submissions', value: String(metrics.submissionsCount), icon: ListOrdered, hint: 'All-time submissions' },
        { label: 'Leaderboard rows', value: String(metrics.leaderboardRows), icon: TrendingUp, hint: 'Ranked entries' },
      ]
    : []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Insights</h1>
        <p className="mt-1 text-muted-foreground">
          High-level KPIs from the database. For charts and audit context, open{' '}
          <strong>Operations overview</strong> (`/dashboard/admin/system`).
        </p>
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
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="mt-2 text-3xl font-bold tabular-nums">{stat.value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{stat.hint}</p>
                </div>
                <Icon className="h-8 w-8 shrink-0 text-primary/50" />
              </div>
            </Card>
          )
        })}
      </div>

      <Card className="p-6">
        <h2 className="mb-2 flex items-center gap-2 font-semibold">
          <BarChart3 className="h-5 w-5 text-primary" />
          Deeper analytics
        </h2>
        <p className="text-sm text-muted-foreground">
          Trend lines, role distribution, and submission histograms are on the operations overview page so we keep this
          view lightweight and avoid duplicating the same charts in three places.
        </p>
      </Card>
    </div>
  )
}

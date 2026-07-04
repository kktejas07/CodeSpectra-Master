'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ContributionGraph } from '@/components/dashboard/contribution-graph'
import {
  Users,
  Activity,
  Trophy,
  TrendingUp,
  Loader,
  ArrowLeft,
  Flame,
  Search,
  Code2,
  Zap,
  FolderGit2,
} from 'lucide-react'
import Link from 'next/link'
import { usePageGuard } from '@/lib/use-page-guard'

interface DayData {
  date: string
  count: number
  types: { scan: number; review: number; fix: number; challenge: number }
}

interface UserStat {
  userId: string
  name: string
  email: string
  scans: number
  reviews: number
  fixes: number
  submissions: number
  total: number
}

interface ActivityEvent {
  ts: string
  type: string
  title: string
  meta: string
  detail: string
  userId: string
}

export default function TeamActivityPage() {
  const gate = usePageGuard('tenant_admin')
  const [loading, setLoading] = useState(true)
  const [heatmap, setHeatmap] = useState<{
    cells: number[][] | null
    dayLabels: string[]
    monthLabels: Array<{ label: string; colIndex: number }>
    tooltipData: Record<string, { date: string; count: number; activeUsers: number }>
    totalContributions: number
    totalActiveDays: number
  } | null>(null)
  const [userStats, setUserStats] = useState<UserStat[]>([])
  const [recentActivity, setRecentActivity] = useState<ActivityEvent[]>([])
  const [totalMembers, setTotalMembers] = useState(0)

  useEffect(() => {
    if (!gate.ready) return
    fetch('/api/admin/teams/activity?weeks=12', { credentials: 'include' })
      .then(r => r.json())
      .then(json => {
        if (!json.error) {
          setHeatmap({
            cells: json.cells,
            dayLabels: json.dayLabels ?? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
            monthLabels: json.monthLabels ?? [],
            tooltipData: json.tooltipData ?? {},
            totalContributions: json.totalContributions ?? 0,
            totalActiveDays: json.totalActiveDays ?? 0,
          })
          setUserStats(json.userStats ?? [])
          setRecentActivity(json.recentActivity ?? [])
          setTotalMembers(json.totalMembers ?? 0)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [gate.ready])

  if (!gate.ready) return (
    <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
      <Loader className="mr-2 h-5 w-5 animate-spin" />Loading…
    </div>
  )

  if (loading) return (
    <div className="flex justify-center py-20">
      <Loader className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  )

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/admin/team">
            <Button variant="outline" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Team Activity</h1>
            <p className="text-muted-foreground mt-1">Track your team&apos;s contribution activity</p>
          </div>
        </div>
        <Badge variant="outline" className="gap-1.5 px-3 py-1.5">
          <Users className="h-4 w-4" />
          <span className="text-sm font-medium">{totalMembers} members</span>
        </Badge>
      </div>

      <ContributionGraph
        cells={heatmap?.cells ?? null}
        dayLabels={heatmap?.dayLabels}
        monthLabels={heatmap?.monthLabels}
        tooltipData={heatmap?.tooltipData as any}
        totalContributions={heatmap?.totalContributions ?? 0}
        totalActiveDays={heatmap?.totalActiveDays ?? 0}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border/60 p-6">
          <div className="mb-4 flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Top contributors</h2>
          </div>
          {userStats.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No activity data yet</p>
          ) : (
            <div className="space-y-3">
              {userStats.slice(0, 10).map((user, idx) => (
                <div key={user.userId} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                      idx === 0 ? 'bg-amber-500/20 text-amber-600' :
                      idx === 1 ? 'bg-slate-400/20 text-slate-500' :
                      idx === 2 ? 'bg-orange-400/20 text-orange-500' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {idx + 1}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-foreground">{user.name}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Activity className="h-3 w-3" />{user.scans}
                    </span>
                    <span className="flex items-center gap-1">
                      <Code2 className="h-3 w-3" />{user.reviews}
                    </span>
                    <span className="flex items-center gap-1">
                      <Zap className="h-3 w-3" />{user.fixes}
                    </span>
                    <Badge variant="secondary" className="ml-1 text-xs">
                      {user.total} total
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="border-border/60 p-6">
          <div className="mb-4 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Recent team activity</h2>
          </div>
          {recentActivity.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No recent activity</p>
          ) : (
            <div className="relative space-y-0 border-l border-border pl-5">
              {recentActivity.slice(0, 8).map((event, idx) => (
                <div key={idx} className="relative pb-4 last:pb-0">
                  <span className={`absolute -left-[21px] top-1 flex h-3 w-3 rounded-full border-2 border-background ${
                    event.type === 'scan' ? 'bg-blue-500' :
                    event.type === 'review' ? 'bg-green-500' :
                    'bg-purple-500'
                  }`} />
                  <p className="font-medium text-foreground text-sm">{event.title}</p>
                  <p className="text-xs text-muted-foreground">{event.meta}</p>
                  <p className="text-xs text-muted-foreground/80 truncate">{event.detail}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
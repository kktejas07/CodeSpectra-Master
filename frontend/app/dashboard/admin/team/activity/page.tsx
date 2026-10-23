'use client'

import { useEffect, useState } from 'react'
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
import { SkeletonList, SkeletonStats, SkeletonText } from '@/components/ui/skeleton-boneyard'
import { PageHeader, Panel } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { useAdminT } from '@/lib/i18n/admin'

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
  const { t } = useAdminT()

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
    <div className="space-y-8">
      <SkeletonText lines={2} />
      <SkeletonStats />
      <SkeletonList count={3} />
    </div>
  )

  if (loading) return (
    <div className="space-y-8">
      <SkeletonText lines={2} />
      <SkeletonStats />
      <SkeletonList count={3} />
    </div>
  )

  return (
    <div className="space-y-6">
      <PageHeader
        illustration="team"
        title={t('teamActivity.title')}
        description={t('teamActivity.description')}
        icon={<Activity />}
        actions={
          <>
            <Badge variant="outline" className="gap-1.5 px-3 py-1.5">
              <Users className="h-4 w-4" aria-hidden />
              <span className="text-sm font-medium tabular-nums">{t('teamActivity.members', { count: totalMembers })}</span>
            </Badge>
            <Button variant="outline" size="sm" className="gap-1.5" title={t('teamActivity.back')} asChild>
              <Link href="/dashboard/admin/team">
                <ArrowLeft className="h-4 w-4" aria-hidden /> {t('teamActivity.backToTeam')}
              </Link>
            </Button>
          </>
        }
      />

      <ContributionGraph
        cells={heatmap?.cells ?? null}
        dayLabels={heatmap?.dayLabels}
        monthLabels={heatmap?.monthLabels}
        tooltipData={heatmap?.tooltipData as any}
        totalContributions={heatmap?.totalContributions ?? 0}
        totalActiveDays={heatmap?.totalActiveDays ?? 0}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel>
          <div className="mb-4 flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">{t('teamActivity.topContributors')}</h2>
          </div>
          {userStats.length === 0 ? (
            <EmptyState illustration="team" title={t('teamActivity.noActivity')} description={t('teamActivity.noActivityDesc')} className="border-0 bg-transparent py-6 md:py-8" />
          ) : (
            <div className="space-y-3">
              {userStats.slice(0, 10).map((user, idx) => (
                <div key={user.userId} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                      idx === 0 ? 'bg-amber-500/20 text-amber-700 dark:text-amber-400' :
                      idx === 1 ? 'bg-muted-foreground/15 text-muted-foreground' :
                      idx === 2 ? 'bg-orange-400/20 text-orange-700 dark:text-orange-400' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {idx + 1}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-foreground">{user.name}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs tabular-nums text-muted-foreground">
                    <span className="flex items-center gap-1" title={t('teamActivity.scans')}>
                      <Activity className="h-3 w-3" aria-hidden />{user.scans}
                    </span>
                    <span className="flex items-center gap-1" title={t('teamActivity.reviews')}>
                      <Code2 className="h-3 w-3" aria-hidden />{user.reviews}
                    </span>
                    <span className="flex items-center gap-1" title={t('teamActivity.fixes')}>
                      <Zap className="h-3 w-3" aria-hidden />{user.fixes}
                    </span>
                    <Badge variant="secondary" className="ml-1 text-xs">
                      {t('teamActivity.total', { n: user.total })}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel>
          <div className="mb-4 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">{t('teamActivity.recent')}</h2>
          </div>
          {recentActivity.length === 0 ? (
            <EmptyState variant="notifications" title={t('teamActivity.noRecent')} description={t('teamActivity.noRecentDesc')} className="border-0 bg-transparent py-6 md:py-8" />
          ) : (
            <div className="relative space-y-0 border-l border-border pl-5">
              {recentActivity.slice(0, 8).map((event, idx) => (
                <div key={idx} className="relative pb-4 last:pb-0">
                  <span className={`absolute -left-[21px] top-1 flex h-3 w-3 rounded-full border-2 border-background ${
                    event.type === 'scan' ? 'bg-primary' :
                    event.type === 'review' ? 'bg-primary/50' :
                    'bg-muted-foreground'
                  }`} />
                  <p className="font-medium text-foreground text-sm">{event.title}</p>
                  <p className="text-xs text-muted-foreground">{event.meta}</p>
                  <p className="text-xs text-muted-foreground/80 truncate">{event.detail}</p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}


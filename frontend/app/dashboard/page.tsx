'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TrendingUp, Activity, Code, Trophy, BookOpen, Zap, CheckCircle, ArrowRight, Clock, Target, Flame, Star, Layers, Calendar, Users, ExternalLink, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/lib/toast-context'
import { DailyChallengeWidget } from '@/components/dashboard/daily-challenge-widget'
import { ContributionGraph } from '@/components/dashboard/contribution-graph'
import { ActivityTimeline } from '@/components/dashboard/activity-timeline'
import { getDefaultDashboard, normalizeUserRole, isSuperAdmin, isTenantAdmin } from '@/lib/rbac'
import { usePageGuard } from '@/lib/use-page-guard'

interface ActivityItem {
  ts: string
  type: string
  title: string
  meta: string
  detail: string
}

export default function DashboardPage() {
  const gate = usePageGuard('user')
  const router = useRouter()
  const { user: fbUser, loading: isPending } = useAuth()
  const addToast = useToast()
  const [role, setRole] = useState<string | null>(null)
  if (!gate.ready) return null
  const [stats, setStats] = useState({ scans: 0, reviews: 0, fixes: 0, challenges: 0, dailyChallenges: 0, streak: 0, xp: 0 })
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [myTeams, setMyTeams] = useState<any[]>([])
  const [heatmap, setHeatmap] = useState<{
    cells: number[][] | null
    dayLabels: string[]
    monthLabels: Array<{ label: string; colIndex: number }>
    tooltipData: Record<string, { date: string; count: number; types: { scan: number; review: number; fix: number; challenge: number } }>
    totalContributions: number
    totalActiveDays: number
  } | null>(null)

  useEffect(() => {
    if (isPending) return
    if (!fbUser) { router.push('/auth/login'); return }

    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        const userRole = data?.user?.role || 'user'
        setRole(userRole)
        const r = normalizeUserRole(userRole)
        if (isSuperAdmin(r)) { router.replace('/dashboard/admin/system'); return }
      })
      .catch(() => setRole('user'))
  }, [router, isPending, fbUser?.uid])

  useEffect(() => {
    Promise.all([
      fetch('/api/user/stats', { credentials: 'include' }).then(r => r.json()).catch(() => null),
      fetch('/api/user/activity?limit=10', { credentials: 'include' }).then(r => r.json()).catch(() => null),
      fetch('/api/user/heatmap?weeks=52', { credentials: 'include' }).then(r => r.json()).catch(() => null),
      fetch('/api/hackathons/my-teams', { credentials: 'include' }).then(r => r.json()).catch(() => null),
    ]).then(([statsData, activityData, heatmapData, teamsData]) => {
      if (statsData && !statsData.error) {
        setStats({
          scans: statsData.scans ?? 0,
          reviews: statsData.reviews ?? 0,
          fixes: statsData.fixes ?? 0,
          challenges: statsData.challenges ?? 0,
          dailyChallenges: statsData.dailyChallenges ?? 0,
          streak: statsData.streak ?? 0,
          xp: statsData.xp ?? 0,
        })
      }
      if (activityData?.data) setActivities(activityData.data)
      if (heatmapData?.cells) {
        setHeatmap({
          cells: heatmapData.cells,
          dayLabels: heatmapData.dayLabels ?? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
          monthLabels: heatmapData.monthLabels ?? [],
          tooltipData: heatmapData.tooltipData ?? {},
          totalContributions: heatmapData.totalContributions ?? 0,
          totalActiveDays: heatmapData.totalActiveDays ?? 0,
        })
      }
      if (teamsData?.teams) setMyTeams(teamsData.teams)
    })
  }, [])

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Welcome back! Here&apos;s your activity overview.</p>
        </div>
        {stats.streak > 0 && (
          <Badge variant="outline" className="gap-1.5 px-3 py-1.5">
            <Flame className="h-4 w-4 text-orange-500" />
            <span className="text-sm font-medium">{stats.streak} day streak</span>
          </Badge>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-border/60 p-4 hover:border-primary/30 transition-colors">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-500/10">
              <Activity className="h-6 w-6 text-blue-500" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Code Scans</p>
              <p className="text-2xl font-bold text-foreground">{stats.scans}</p>
            </div>
          </div>
        </Card>
        <Card className="border-border/60 p-4 hover:border-primary/30 transition-colors">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-500/10">
              <Code className="h-6 w-6 text-green-500" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Challenges</p>
              <p className="text-2xl font-bold text-foreground">{stats.challenges}</p>
            </div>
          </div>
        </Card>
        <Card className="border-border/60 p-4 hover:border-primary/30 transition-colors">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-500/10">
              <Zap className="h-6 w-6 text-purple-500" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Fixes Applied</p>
              <p className="text-2xl font-bold text-foreground">{stats.fixes}</p>
            </div>
          </div>
        </Card>
        <DailyChallengeWidget />
      </div>

      <ContributionGraph
        cells={heatmap?.cells ?? null}
        dayLabels={heatmap?.dayLabels}
        monthLabels={heatmap?.monthLabels}
        tooltipData={heatmap?.tooltipData}
        totalContributions={heatmap?.totalContributions ?? 0}
        totalActiveDays={heatmap?.totalActiveDays ?? 0}
      />

      {myTeams.length > 0 && (
        <Card className="border-border/60 p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">My Events</h2>
            </div>
            <Link href="/dashboard/hackathons">
              <Button variant="ghost" size="sm" className="gap-1 text-sm">
                View all <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {myTeams.map((t: any) => {
              const h = t.hackathon
              if (!h) return null
              const now = new Date()
              const start = new Date(h.starts_at)
              const end = new Date(h.ends_at)
              const isActive = now >= start && now <= end
              const isUpcoming = now < start
              return (
                <Link key={t.hackathon_id} href={`/hackathons/${h.slug}/workspace`}>
                  <div className="rounded-lg border border-border/60 bg-muted/20 p-4 transition-all hover:border-primary/40 hover:bg-primary/5">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-medium text-foreground text-sm truncate">{h.name}</h3>
                      <Badge variant={isActive ? 'default' : isUpcoming ? 'secondary' : 'outline'} className="text-[10px]">
                        {isActive ? 'Live' : isUpcoming ? 'Upcoming' : 'Ended'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Users className="h-3 w-3" />
                      <span>{t.members?.length || 0} {t.members?.length === 1 ? 'member' : 'members'}</span>
                      <span className="text-border">|</span>
                      <span>{t.name}</span>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="border-border/60 p-6 lg:col-span-2">
          <div className="mb-4 flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Quick actions</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Link href="/dashboard/scanner?mode=manual">
              <div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-center transition-all hover:border-primary/40 hover:bg-primary/5">
                <Activity className="mx-auto h-6 w-6 text-blue-500" />
                <p className="mt-2 text-sm font-medium text-foreground">Run Scan</p>
              </div>
            </Link>
            <Link href="/dashboard/challenges">
              <div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-center transition-all hover:border-primary/40 hover:bg-primary/5">
                <Trophy className="mx-auto h-6 w-6 text-amber-500" />
                <p className="mt-2 text-sm font-medium text-foreground">Challenges</p>
              </div>
            </Link>
            <Link href="/dashboard/problems">
              <div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-center transition-all hover:border-primary/40 hover:bg-primary/5">
                <Code className="mx-auto h-6 w-6 text-green-500" />
                <p className="mt-2 text-sm font-medium text-foreground">Problems</p>
              </div>
            </Link>
            <Link href="/dashboard/arena">
              <div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-center transition-all hover:border-primary/40 hover:bg-primary/5">
                <Target className="mx-auto h-6 w-6 text-red-500" />
                <p className="mt-2 text-sm font-medium text-foreground">Arena</p>
              </div>
            </Link>
            <Link href="/dashboard/tracks">
              <div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-center transition-all hover:border-primary/40 hover:bg-primary/5">
                <Layers className="mx-auto h-6 w-6 text-purple-500" />
                <p className="mt-2 text-sm font-medium text-foreground">Tracks</p>
              </div>
            </Link>
            <Link href="/dashboard/achievements">
              <div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-center transition-all hover:border-primary/40 hover:bg-primary/5">
                <Star className="mx-auto h-6 w-6 text-yellow-500" />
                <p className="mt-2 text-sm font-medium text-foreground">Achievements</p>
              </div>
            </Link>
          </div>
        </Card>

        <ActivityTimeline
          activities={activities}
          limit={6}
          showViewAll={true}
          title="Recent activity"
          subtitle="Your latest contributions"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border/60 p-6">
          <div className="mb-4 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Your stats</h2>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Scans</span>
              <span className="text-sm font-medium text-foreground">{stats.scans}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Challenges completed</span>
              <span className="text-sm font-medium text-foreground">{stats.challenges}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Daily challenges</span>
              <span className="text-sm font-medium text-foreground">{stats.dailyChallenges}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Reviews</span>
              <span className="text-sm font-medium text-foreground">{stats.reviews}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Fixes applied</span>
              <span className="text-sm font-medium text-foreground">{stats.fixes}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Current streak</span>
              <span className="text-sm font-medium text-foreground flex items-center gap-1">
                <Flame className="h-3 w-3 text-orange-500" /> {stats.streak} days
              </span>
            </div>
          </div>
        </Card>

        <Card className="border-border/60 p-6">
          <div className="mb-4 flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Learning progress</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">Track your learning journey across tech stacks.</p>
          <Link href="/dashboard/tracks">
            <Button variant="outline" className="w-full gap-2">
              <Layers className="h-4 w-4" />
              Browse learning tracks
            </Button>
          </Link>
        </Card>
      </div>
    </div>
  )
}


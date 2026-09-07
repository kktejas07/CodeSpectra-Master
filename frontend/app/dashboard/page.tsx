'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TrendingUp, Activity, Code, Trophy, BookOpen, Zap, CheckCircle, ArrowRight, Clock, Target, Flame, Star, Layers, Calendar, Users, ExternalLink, Loader2, Crown, FileText } from 'lucide-react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/lib/toast-context'
import { DailyChallengeWidget } from '@/components/dashboard/daily-challenge-widget'
import { ContributionGraph } from '@/components/dashboard/contribution-graph'
import { ActivityTimeline } from '@/components/dashboard/activity-timeline'
import { getDefaultDashboard, normalizeUserRole, isSuperAdmin, isTenantAdmin } from '@/lib/rbac'
import { usePageGuard } from '@/lib/use-page-guard'
import { OrganizationDashboard } from '@/components/dashboard/organization-dashboard'
import { useTour } from '@/components/tour/tour-context'
import { WELCOME_TOUR_STEPS } from '@/lib/tour-driver'
import {
  DeveloperRankBanner,
  IsometricScanChip,
  IsometricProblemCube,
  IsometricFixEngine,
} from '@/components/dashboard/dashboard-vectors'

interface ActivityItem {
  ts: string
  type: string
  title: string
  meta: string
  detail: string
}

export default function DashboardPage() {
  const gate = usePageGuard('user')
  const { startTour, setTourSeen } = useTour()

  // Auto-start welcome tour on first visit
  useEffect(() => {
    if (typeof window !== 'undefined' && !window.localStorage.getItem('has_seen_welcome_tour')) {
      startTour(WELCOME_TOUR_STEPS, 'welcome')
      setTourSeen('welcome')
    }
  }, [startTour, setTourSeen])
  const router = useRouter()
  const { user: fbUser, loading: isPending } = useAuth()
  const addToast = useToast()
  const [role, setRole] = useState<string | null>(null)
  const [stats, setStats] = useState({ scans: 0, reviews: 0, fixes: 0, challenges: 0, dailyChallenges: 0, streak: 0, xp: 0 })
  const [plan, setPlan] = useState<string | null>(null)
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
      fetch('/api/billing/me', { credentials: 'include' }).then(r => r.json()).catch(() => null),
    ]).then(([statsData, activityData, heatmapData, teamsData, billingData]) => {
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
      if (billingData?.subscription) {
        setPlan(billingData.subscription.plan_id || null)
      }
    })
  }, [])

  if (!gate.ready) return null

  if (role && isTenantAdmin(normalizeUserRole(role))) {
    return <OrganizationDashboard />
  }

  return (
    <div className="space-y-8">
      {/* Developer Rank & XP Hero Banner */}
      <DeveloperRankBanner
        name={fbUser?.displayName || fbUser?.email?.split('@')[0]}
        role={role || undefined}
        stats={stats}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" data-tour="dashboard-overview">
        <Card className="border-border/60 p-4 hover:border-emerald-500/40 transition-all duration-300 group hover:shadow-lg hover:shadow-emerald-950/20">
          <div className="flex items-center gap-4">
            <IsometricScanChip />
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground font-mono">Code Scans</p>
              <p className="text-2xl font-black text-foreground tracking-tight">{stats.scans}</p>
            </div>
          </div>
        </Card>

        <Card className="border-border/60 p-4 hover:border-emerald-500/40 transition-all duration-300 group hover:shadow-lg hover:shadow-emerald-950/20">
          <div className="flex items-center gap-4">
            <IsometricProblemCube />
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground font-mono">Challenges</p>
              <p className="text-2xl font-black text-foreground tracking-tight">{stats.challenges}</p>
            </div>
          </div>
        </Card>

        <Card className="border-border/60 p-4 hover:border-cyan-500/40 transition-all duration-300 group hover:shadow-lg hover:shadow-cyan-950/20">
          <div className="flex items-center gap-4">
            <IsometricFixEngine />
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground font-mono">Fixes Applied</p>
              <p className="text-2xl font-black text-foreground tracking-tight">{stats.fixes}</p>
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
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-border/60 p-5" data-tour="quick-actions">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" /> Quick actions
              </h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Link href="/dashboard/arena" className="group" data-tour="practice-arena">
                <div className="rounded-xl border border-slate-800/80 bg-linear-to-b from-[#0c1420] to-[#060a12] p-3.5 text-center transition-all duration-300 group-hover:border-emerald-500/50 group-hover:shadow-md group-hover:shadow-emerald-950/40 group-hover:-translate-y-0.5">
                  <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20 group-hover:bg-emerald-500/20 transition-colors">
                    <FileText className="h-4.5 w-4.5 text-emerald-400" />
                  </div>
                  <p className="mt-2 text-xs font-semibold text-foreground">Assessments</p>
                  <p className="text-[10px] text-muted-foreground">Test skills</p>
                </div>
              </Link>

              <Link href="/dashboard/problems" className="group">
                <div className="rounded-xl border border-slate-800/80 bg-linear-to-b from-[#0c1420] to-[#060a12] p-3.5 text-center transition-all duration-300 group-hover:border-emerald-500/50 group-hover:shadow-md group-hover:shadow-emerald-950/40 group-hover:-translate-y-0.5">
                  <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20 group-hover:bg-emerald-500/20 transition-colors">
                    <Code className="h-4.5 w-4.5 text-emerald-400" />
                  </div>
                  <p className="mt-2 text-xs font-semibold text-foreground">Problems</p>
                  <p className="text-[10px] text-muted-foreground">Algorithm lab</p>
                </div>
              </Link>

              <Link href="/dashboard/assessments" className="group" data-tour="assessments">
                <div className="rounded-xl border border-slate-800/80 bg-linear-to-b from-[#0c1420] to-[#060a12] p-3.5 text-center transition-all duration-300 group-hover:border-red-500/50 group-hover:shadow-md group-hover:shadow-red-950/40 group-hover:-translate-y-0.5">
                  <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg bg-red-500/10 border border-red-500/20 group-hover:bg-red-500/20 transition-colors">
                    <Target className="h-4.5 w-4.5 text-red-400" />
                  </div>
                  <p className="mt-2 text-xs font-semibold text-foreground">Arena</p>
                  <p className="text-[10px] text-muted-foreground">Live 1v1</p>
                </div>
              </Link>

              <Link href="/dashboard/scanner?mode=manual" className="group" data-tour="scanner-tool">
                <div className="rounded-xl border border-slate-800/80 bg-linear-to-b from-[#0c1420] to-[#060a12] p-3.5 text-center transition-all duration-300 group-hover:border-cyan-500/50 group-hover:shadow-md group-hover:shadow-cyan-950/40 group-hover:-translate-y-0.5">
                  <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/10 border border-cyan-500/20 group-hover:bg-cyan-500/20 transition-colors">
                    <Activity className="h-4.5 w-4.5 text-cyan-400" />
                  </div>
                  <p className="mt-2 text-xs font-semibold text-foreground">Run Scan</p>
                  <p className="text-[10px] text-muted-foreground">AST Engine</p>
                </div>
              </Link>

              <Link href="/dashboard/tracks" className="group">
                <div className="rounded-xl border border-slate-800/80 bg-linear-to-b from-[#0c1420] to-[#060a12] p-3.5 text-center transition-all duration-300 group-hover:border-cyan-500/50 group-hover:shadow-md group-hover:shadow-cyan-950/40 group-hover:-translate-y-0.5">
                  <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/10 border border-cyan-500/20 group-hover:bg-cyan-500/20 transition-colors">
                    <Layers className="h-4.5 w-4.5 text-cyan-400" />
                  </div>
                  <p className="mt-2 text-xs font-semibold text-foreground">Tracks</p>
                  <p className="text-[10px] text-muted-foreground">Curriculums</p>
                </div>
              </Link>

              <Link href="/dashboard/achievements" className="group">
                <div className="rounded-xl border border-slate-800/80 bg-linear-to-b from-[#0c1420] to-[#060a12] p-3.5 text-center transition-all duration-300 group-hover:border-amber-500/50 group-hover:shadow-md group-hover:shadow-amber-950/40 group-hover:-translate-y-0.5">
                  <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10 border border-amber-500/20 group-hover:bg-amber-500/20 transition-colors">
                    <Star className="h-4.5 w-4.5 text-amber-400" />
                  </div>
                  <p className="mt-2 text-xs font-semibold text-foreground">Achievements</p>
                  <p className="text-[10px] text-muted-foreground">Trophies</p>
                </div>
              </Link>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <ActivityTimeline
            activities={activities}
            limit={5}
            showViewAll={true}
            title="Recent activity"
            subtitle="Your latest contributions"
          />

          <Card className="border-border/60 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Learning progress</h2>
            </div>
            <p className="text-xs text-muted-foreground">Track your learning journey across tech stacks.</p>
            <Link href="/dashboard/tracks">
              <Button variant="outline" size="sm" className="w-full gap-2 text-xs">
                <Layers className="h-3.5 w-3.5" />
                Browse learning tracks
              </Button>
            </Link>
          </Card>
        </div>
      </div>
    </div>
  )
}


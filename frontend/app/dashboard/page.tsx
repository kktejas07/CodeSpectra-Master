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
import { WELCOME_TOUR_STEPS, autoPlayPageTour, startPageHints, type TourHint } from '@/lib/tour-driver'
import {
  DeveloperRankBanner,
  IsometricScanChip,
  IsometricProblemCube,
  IsometricFixEngine,
} from '@/components/dashboard/dashboard-vectors'

// Quick actions — each tile links to the page it names (Assessments/Arena were swapped before).
const QUICK_ACTIONS = [
  { href: '/dashboard/assessments', label: 'Assessments', hint: 'Tests you’re invited to', icon: FileText, tour: 'assessments' },
  { href: '/dashboard/problems', label: 'Problems', hint: 'Coding practice', icon: Code, tour: undefined },
  { href: '/dashboard/arena', label: 'Arena', hint: 'Live 1-v-1 matches', icon: Target, tour: 'practice-arena' },
  { href: '/dashboard/scanner?mode=manual', label: 'Run a scan', hint: 'Check your own code', icon: Activity, tour: 'scanner-tool' },
  { href: '/dashboard/tracks', label: 'Tracks', hint: 'Structured courses', icon: Layers, tour: undefined },
  { href: '/dashboard/achievements', label: 'Achievements', hint: 'Badges you’ve earned', icon: Star, tour: undefined },
] as const

interface ActivityItem {
  ts: string
  type: string
  title: string
  meta: string
  detail: string
}

export default function DashboardPage() {
  const gate = usePageGuard('user')
  const { startTour, setTourSeen, isTourSeen } = useTour()

  // Auto-play welcome tour on first visit. autoPlayPageTour registers steps
  // on every mount (so Guide can replay) but only plays when unseen.
  useEffect(() => {
    autoPlayPageTour('welcome', WELCOME_TOUR_STEPS)
  }, [startTour, setTourSeen])

  // Feature hints (pulsing beacons) for returning users — the welcome tour
  // covers first-timers, so hints only appear once the tour has been seen.
  // Dismissals persist per hint; driver.js skips missing elements.
  useEffect(() => {
    if (!gate.ready || !isTourSeen('welcome')) return
    const homeHints: TourHint[] = [
      {
        id: 'daily-challenge',
        target: '[data-hint="daily-challenge"]',
        title: 'Daily Challenge',
        description: 'A fresh challenge every day. Solve it to keep your streak alive and earn bonus XP.',
        position: 'bottom',
      },
      {
        id: 'contributions',
        target: '[data-hint="contribution-graph"]',
        title: 'Your Activity Graph',
        description: 'Every scan, solution, and fix fills this in. Consistency beats intensity.',
        position: 'top',
      },
    ]
    startPageHints('home', homeHints)
  }, [gate.ready, isTourSeen])
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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 [&:not(:has(>[data-hint=daily-challenge]>*))]:xl:grid-cols-3" data-tour="dashboard-overview">
        <Card className="group rounded-3xl border-border/70 p-5 transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_18px_40px_-20px_rgba(47,91,231,0.35)] motion-reduce:hover:translate-y-0">
          <div className="flex items-center gap-4">
            <IsometricScanChip />
            <div>
              <p className="text-sm font-medium text-muted-foreground">Code scans</p>
              <p className="text-3xl font-bold tabular-nums text-foreground tracking-tight">{stats.scans}</p>
            </div>
          </div>
        </Card>

        <Card className="group rounded-3xl border-border/70 p-5 transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_18px_40px_-20px_rgba(47,91,231,0.35)] motion-reduce:hover:translate-y-0">
          <div className="flex items-center gap-4">
            <IsometricProblemCube />
            <div>
              <p className="text-sm font-medium text-muted-foreground">Challenges</p>
              <p className="text-3xl font-bold tabular-nums text-foreground tracking-tight">{stats.challenges}</p>
            </div>
          </div>
        </Card>

        <Card className="group rounded-3xl border-border/70 p-5 transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_18px_40px_-20px_rgba(47,91,231,0.35)] motion-reduce:hover:translate-y-0">
          <div className="flex items-center gap-4">
            <IsometricFixEngine />
            <div>
              <p className="text-sm font-medium text-muted-foreground">Fixes applied</p>
              <p className="text-3xl font-bold tabular-nums text-foreground tracking-tight">{stats.fixes}</p>
            </div>
          </div>
        </Card>

        <div data-hint="daily-challenge" className="min-w-0">
          <DailyChallengeWidget />
        </div>
      </div>

      <div data-hint="contribution-graph">
      <ContributionGraph
        cells={heatmap?.cells ?? null}
        dayLabels={heatmap?.dayLabels}
        monthLabels={heatmap?.monthLabels}
        tooltipData={heatmap?.tooltipData}
        totalContributions={heatmap?.totalContributions ?? 0}
        totalActiveDays={heatmap?.totalActiveDays ?? 0}
      />
      </div>

      {myTeams.length > 0 && (
        <Card className="rounded-3xl border-border/70 p-6">
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
          <Card className="rounded-3xl border-border/70 p-6" data-tour="quick-actions">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
                <BookOpen className="h-4 w-4 text-primary" aria-hidden /> Quick actions
              </h2>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {QUICK_ACTIONS.map(({ href, label, hint, icon: Icon, tour }) => (
                <Link
                  key={href}
                  href={href}
                  data-tour={tour}
                  className="group rounded-2xl border border-border/70 bg-card p-4 transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_14px_30px_-18px_rgba(47,91,231,0.45)] focus-visible:outline-2 focus-visible:outline-primary motion-reduce:hover:translate-y-0"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <p className="mt-3 text-sm font-semibold text-foreground">{label}</p>
                  <p className="text-xs text-muted-foreground">{hint}</p>
                </Link>
              ))}
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

          <Card className="space-y-3 rounded-3xl border-border/70 p-6">
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


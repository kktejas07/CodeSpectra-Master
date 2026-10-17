'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TrendingUp, Activity, Code, Trophy, BookOpen, Zap, CheckCircle, ArrowRight, Clock, Target, Flame, Star, Layers, Calendar, Users, ExternalLink, Loader2, Crown, FileText, ScanFace } from 'lucide-react'
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
import { BentoGrid, Panel, StatCard } from '@/components/app/page-kit'
import { AppBanner, BannerChip, bannerBtnPrimary, bannerBtnSecondary } from '@/components/visuals'

// Quick actions — each tile links to the page it names (Assessments/Arena were swapped before).
const QUICK_ACTIONS = [
  { href: '/dashboard/assessments', label: 'Assessments', hint: 'Tests you’re invited to', icon: FileText, tour: 'assessments' },
  { href: '/dashboard/problems', label: 'Problems', hint: 'Coding practice', icon: Code, tour: undefined },
  { href: '/dashboard/arena', label: 'Arena', hint: 'Live 1-v-1 matches', icon: Target, tour: 'practice-arena' },
  { href: '/dashboard/scanner?mode=manual', label: 'Run a scan', hint: 'Check your own code', icon: Activity, tour: 'scanner-tool' },
  { href: '/dashboard/tracks', label: 'Tracks', hint: 'Structured courses', icon: Layers, tour: undefined },
  { href: '/dashboard/achievements', label: 'Achievements', hint: 'Badges you’ve earned', icon: Star, tour: undefined },
] as const

function greetingFor(d: Date): string {
  const h = d.getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

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
        title: 'Daily challenge',
        description: 'A fresh challenge every day. Solve it to keep your streak alive and earn bonus XP.',
        position: 'bottom',
      },
      {
        id: 'contributions',
        target: '[data-hint="contribution-graph"]',
        title: 'Your activity graph',
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
  const [statsLoaded, setStatsLoaded] = useState(false)
  // Face enrolment from the session (the auth context doesn't carry it yet).
  const [faceEnrolled, setFaceEnrolled] = useState<boolean | null>(null)
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
      fetch('/api/auth/session', { credentials: 'include' }).then(r => r.json()).catch(() => null),
    ]).then(([statsData, activityData, heatmapData, teamsData, billingData, sessionData]) => {
      if (typeof sessionData?.user?.has_enrolled_face === 'boolean') setFaceEnrolled(sessionData.user.has_enrolled_face)
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
        setStatsLoaded(true)
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

  const firstName = (fbUser?.displayName || '').trim().split(/\s+/)[0] || ''

  if (role && isTenantAdmin(normalizeUserRole(role))) {
    return <OrganizationDashboard />
  }

  return (
    <div className="space-y-8">
      <AppBanner
        eyebrow={greetingFor(new Date())}
        title={firstName ? `Welcome back, ${firstName}` : 'Welcome back'}
        description={
          statsLoaded && stats.streak > 0
            ? `You're on a ${stats.streak}-day streak. Solve one problem today to keep it going.`
            : 'Your practice, assessments and certificates in one place. One problem a day is a good start.'
        }
        actions={
          <div data-tour="quick-actions" className="flex flex-wrap gap-2.5">
            {QUICK_ACTIONS.map(({ href, label, icon: Icon, tour }, i) => (
              <Link key={href} href={href} data-tour={tour} className={i === 0 ? bannerBtnPrimary : bannerBtnSecondary}>
                <Icon className="h-4 w-4" aria-hidden /> {label}
              </Link>
            ))}
          </div>
        }
        art={
          <div className="flex flex-col items-end gap-3">
            {faceEnrolled === true ? (
              <BannerChip icon={<ScanFace />} label="Face enrolled" sub="Ready for proctored tests" />
            ) : faceEnrolled === false ? (
              <BannerChip icon={<ScanFace />} label="Face not enrolled" sub="Set it up in settings" />
            ) : (
              <BannerChip icon={<Code />} label="Practice" sub="Problems and tracks" />
            )}
            {statsLoaded && stats.streak > 0 ? (
              <BannerChip icon={<Flame />} label={`${stats.streak}-day streak`} sub="Keep it going" className="mr-8" delay="0.6s" />
            ) : (
              <BannerChip icon={<FileText />} label="Mock tests" sub="Practise before the real one" className="mr-8" delay="0.6s" />
            )}
          </div>
        }
      />

      <div data-tour="dashboard-overview">
      <BentoGrid className="[&:not(:has(>[data-hint=daily-challenge]>*))]:lg:grid-cols-3">
        <StatCard label="Code scans" value={stats.scans} icon={<Activity />} />
        <StatCard label="Challenges" value={stats.challenges} icon={<Code />} />
        <StatCard label="Fixes applied" value={stats.fixes} icon={<CheckCircle />} />
        <div data-hint="daily-challenge" className="min-w-0">
          <DailyChallengeWidget />
        </div>
      </BentoGrid>
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
              <h2 className="text-lg font-semibold text-foreground">My events</h2>
            </div>
            <Button variant="ghost" size="sm" className="gap-1 text-sm" asChild>
              <Link href="/dashboard/hackathons">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
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
        <div className="min-w-0 lg:col-span-2">
          <ActivityTimeline
            activities={activities}
            limit={5}
            showViewAll={true}
            title="Recent activity"
            subtitle="Your latest contributions"
          />
        </div>

        <div className="space-y-6">
          <Panel className="space-y-3">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              <h2 className="text-base font-semibold text-foreground">Learning progress</h2>
            </div>
            <p className="text-xs text-muted-foreground">Track your learning journey across tech stacks.</p>
            <Button variant="outline" size="sm" className="w-full gap-2 text-xs" asChild>
              <Link href="/dashboard/tracks">
                <Layers className="h-3.5 w-3.5" />
                Browse learning tracks
              </Link>
            </Button>
          </Panel>
        </div>
      </div>
    </div>
  )
}


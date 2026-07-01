'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  TrendingUp, Activity, Code, Trophy, BookOpen, Zap, CheckCircle,
  ArrowRight, Clock, Target, Flame, Star, Layers
} from 'lucide-react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/lib/toast-context'
import { DailyChallengeWidget } from '@/components/dashboard/daily-challenge-widget'
import { getDefaultDashboard, normalizeUserRole, isSuperAdmin, isTenantAdmin } from '@/lib/rbac'

export default function DashboardPage() {
  const router = useRouter()
  const { user: fbUser, loading: isPending } = useAuth()
  const addToast = useToast()
  const [role, setRole] = useState<string | null>(null)
  const [stats, setStats] = useState({ scans: 0, reviews: 0, fixes: 0, challenges: 0, streak: 0, xp: 0 })
  const [recentActivity, setRecentActivity] = useState<Array<{ type: string; label: string; time: string }>>([])

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
        if (isTenantAdmin(r)) { router.replace('/dashboard/admin/team'); return }
      })
      .catch(() => setRole('user'))
  }, [router, isPending, fbUser?.uid])

  useEffect(() => {
    fetch('/api/user/stats', { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (!data.error) {
          setStats({
            scans: data.scans ?? 0,
            reviews: data.reviews ?? 0,
            fixes: data.fixes ?? 0,
            challenges: data.challenges ?? 0,
            streak: data.streak ?? 0,
            xp: data.xp ?? 0,
          })
        }
      })
      .catch(() => {})
    fetch('/api/user/activity?limit=5', { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data.activities)) setRecentActivity(data.activities)
      })
      .catch(() => {})
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
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">XP Earned</p>
              <p className="text-2xl font-bold text-foreground">{stats.xp}</p>
            </div>
          </div>
        </Card>
        <DailyChallengeWidget />
      </div>

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

        <Card className="border-border/60 p-6">
          <div className="mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Recent activity</h2>
          </div>
          {recentActivity.length > 0 ? (
            <div className="space-y-3">
              {recentActivity.map((a, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground truncate">{a.label}</span>
                  <span className="text-xs text-muted-foreground/60 ml-2 shrink-0">{a.time}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No recent activity. Start coding!</p>
          )}
          <div className="mt-4 pt-4 border-t border-border/60">
            <Link href="/dashboard/profile">
              <Button variant="outline" size="sm" className="w-full gap-2">
                <ArrowRight className="h-4 w-4" />
                View full profile
              </Button>
            </Link>
          </div>
        </Card>
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

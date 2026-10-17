'use client'
import { formatDate } from '@/lib/format-datetime'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { Loader2, ArrowLeft, Trophy, Code2, CheckCircle2, XCircle, LogIn, User, Clock, Eye, Edit2, MapPin } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { usePageGuard } from '@/lib/use-page-guard'
import { useAuth } from '@/lib/auth-context'
import { ContributionGraph } from '@/components/dashboard/contribution-graph'
import { UserAvatar } from '@/components/ui/user-avatar'
import { SkeletonAvatar, SkeletonList, SkeletonText } from '@/components/ui/skeleton-boneyard'
import { Illustration } from '@/components/illustrations/spot'

type Difficulty = 'easy' | 'medium' | 'hard'

interface ProfileResponse {
  user: {
    id: string
    slug: string
    name: string
    preferredLanguage: string
    joinedAt: string | null
  }
  stats: {
    xp: number
    totalSubmissions: number
    solved: number
    byDifficulty: Record<Difficulty, number>
  }
  recent: Array<{
    id: string
    status: string
    score: number
    language: string
    created_at: string
    problem: { slug: string; title: string; difficulty: Difficulty } | null
  }>
}

const DIFF_TONE: Record<Difficulty, string> = {
  easy: 'border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400',
  medium: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  hard: 'border-destructive/40 bg-destructive/10 text-destructive',
}

// Real heatmap state — loaded from /api/user/heatmap (same endpoint + params +
// response shape as dashboard/profile). Supports ?userId for other users'
// public heatmaps (counts only, no PII); on API error keeps the honest empty
// state (cells=null).
interface HeatmapState {
  cells: number[][] | null
  tooltipData: Record<string, { date: string; count: number; types: { scan: number; review: number; fix: number; challenge: number } }>
  totalContributions: number
}

export default function UserProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = use(params)
  // Disable gate checking if it's preview mode, but we still need auth to see others profiles?
  // User requested ?preview=true to see how others see them.
  const isPreview = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('preview') === 'true'
  
  const gate = usePageGuard('user')
  const { user: authUser } = useAuth()
  const [data, setData] = useState<ProfileResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [heatmap, setHeatmap] = useState<HeatmapState>({ cells: null, tooltipData: {}, totalContributions: 0 })

  // Owner check uses the id the API resolved, not the email.
  const isOwner = Boolean(authUser && data && authUser.uid === data.user.id)

  useEffect(() => {
    let cancelled = false
    async function run() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/users/${encodeURIComponent(slug)}`, {
          cache: 'no-store',
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Failed to load profile')
        if (!cancelled) setData(json as ProfileResponse)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [slug])

  useEffect(() => {
    if (!data || !authUser) return
    // /api/user/heatmap supports ?userId for public activity — fetch the
    // profile owner's heatmap. On API error the state stays at the honest
    // empty default (0 contributions, no cells).
    let cancelled = false
    fetch(`/api/user/heatmap?weeks=52&userId=${encodeURIComponent(data.user.id)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((json) => {
        if (cancelled || !json || json.error || !json.cells) return
        setHeatmap({
          cells: json.cells,
          tooltipData: json.tooltipData ?? {},
          totalContributions: json.totalContributions ?? 0,
        })
      })
      .catch(() => { /* keep honest empty state */ })
    return () => {
      cancelled = true
    }
  }, [data, authUser, slug])

  if (!gate.ready) {
    return (
      <div className="min-h-screen space-y-6 bg-background p-6">
        <div className="flex items-center gap-4">
          <SkeletonAvatar />
          <div className="flex-1"><SkeletonText lines={2} /></div>
        </div>
        <SkeletonList count={2} />
      </div>
    )
  }

  if (!gate.allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Card className="max-w-sm w-full p-8 text-center border-primary/20">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 mx-auto mb-4">
            <Code2 className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-xl font-bold mb-2">Sign in required</h1>
          <p className="text-sm text-muted-foreground mb-6">
            Please sign in to view user profiles.
          </p>
          <div className="flex flex-col gap-2">
            <Button className="w-full gap-2" asChild>
              <Link href={`/auth/login?redirect=${encodeURIComponent(`/users/${slug}`)}`}><LogIn className="h-4 w-4" /> Sign in</Link>
            </Button>
            <Button variant="outline" className="w-full" asChild>
              <Link href="/auth/signup">Create account</Link>
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen space-y-6 bg-background p-6">
        <div className="flex items-center gap-4">
          <SkeletonAvatar />
          <div className="flex-1"><SkeletonText lines={2} /></div>
        </div>
        <SkeletonList count={2} />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background p-10">
        <Link href="/dashboard/leaderboard" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to leaderboard
        </Link>
        <Card className="border-destructive/40 bg-destructive/5 p-6 text-center text-destructive">
          <Illustration name="not-found" className="mx-auto mb-3 w-36" />
          {error || 'Profile unavailable'}
        </Card>
      </div>
    )
  }

  const { user, stats, recent } = data
  const memberDate = user.joinedAt ? formatDate(user.joinedAt, undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : null
  const level = Math.floor(stats.xp / 1000) + 1

  return (
    <div className="min-h-screen bg-background w-full">
      {isPreview && (
        <div className="bg-primary text-primary-foreground px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-sm sticky top-0 z-50">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 opacity-80" />
            <span className="font-medium">This is how others see your profile. Some buttons are turned off in preview.</span>
          </div>
          <Button size="sm" variant="ghost" className="h-8 text-primary-foreground hover:text-primary-foreground hover:bg-white/15" asChild>
            <Link href="/dashboard/profile">Exit preview</Link>
          </Button>
        </div>
      )}

      {/* Full Width Banner */}
      <div className="w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 mt-4">
        <div className="h-48 lg:h-64 w-full rounded-3xl relative overflow-hidden shadow-sm bg-linear-to-r from-[#1E3FB8] via-primary to-[#3A4FC4]">
          <div className="absolute inset-0 opacity-30 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-size-[24px_24px]" />
          <div className="absolute left-0 right-0 top-0 -z-1 m-auto h-77.5 w-77.5 rounded-full bg-white opacity-20 blur-[100px]" />
        </div>
      </div>

      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8 pb-20">
        <div className="mt-6 grid gap-8 lg:grid-cols-[360px_1fr]">
          
          {/* Left Sidebar */}
          <aside className="space-y-6 -mt-24 relative z-10">
            <Card className="rounded-3xl border-border/70 p-6 text-center shadow-sm dark:shadow-none bg-card relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/15 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none opacity-70" />
              
              <div className="relative mx-auto w-fit rounded-full bg-linear-to-br from-primary to-[#6E8CF5] p-0.75 shadow-lg">
                <div className="rounded-full bg-background p-1">
                  <UserAvatar seed={user.id} name={user.name} className="h-28 w-28" />
                </div>
              </div>
              
              <h1 className="mt-5 text-2xl font-extrabold text-foreground tracking-tight">{user.name}</h1>
              <p className="mt-1 text-sm text-muted-foreground font-medium">@{user.slug || slug}</p>
              
              <div className="mt-6 flex justify-center gap-6 text-sm">
                <div className="flex flex-col items-center p-3 rounded-xl bg-muted/30 min-w-20">
                  <span className="font-bold text-foreground text-xl tabular-nums">{level}</span>
                  <span className="text-xs text-muted-foreground font-medium mt-1">Level</span>
                </div>
                <div className="flex flex-col items-center p-3 rounded-xl bg-muted/30 min-w-20">
                  <span className="font-bold text-foreground text-xl tabular-nums">{stats.xp.toLocaleString()}</span>
                  <span className="text-xs text-muted-foreground font-medium mt-1">XP</span>
                </div>
              </div>
              
              {isOwner && !isPreview && (
                <Button size="sm" className="mt-6 w-full gap-2 rounded-xl h-10 font-bold bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground transition-all" asChild>
                  <Link href="/dashboard/profile">
                    <Edit2 className="h-4 w-4" /> Edit profile
                  </Link>
                </Button>
              )}
            </Card>

            <Card className="rounded-3xl border-border/70 p-5 bg-card">
              <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-foreground">
                <Trophy className="h-4 w-4 text-primary" /> Stats
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground font-medium">Total points</span>
                  <span className="font-bold tabular-nums">{stats.xp}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground font-medium">Problems solved</span>
                  <span className="font-bold tabular-nums">{stats.solved}</span>
                </div>
              </div>
            </Card>

          </aside>

          {/* Right Main Content */}
          <div className="space-y-6 min-w-0">
            
            {/* Streaks / Heatmap Section */}
            <Card className="rounded-3xl border-border/70 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-foreground tracking-tight">Activity</h2>
              </div>
              <div className="bg-card w-full overflow-x-auto">
                <div className="min-w-[800px]">
                  <ContributionGraph cells={heatmap.cells} tooltipData={heatmap.tooltipData} totalContributions={heatmap.totalContributions} />
                </div>
              </div>
            </Card>

            {/* Skills & Stats */}
            <div className="grid gap-4 sm:grid-cols-3">
              {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
                <Card key={d} className="rounded-2xl p-5 bg-card border-border/70">
                  <p className="text-sm font-medium capitalize text-muted-foreground">{d}</p>
                  <p className="mt-1 text-3xl font-bold tabular-nums text-foreground">{stats.byDifficulty[d]}</p>
                  <p className="text-xs text-muted-foreground">unique problems solved</p>
                </Card>
              ))}
            </div>

            {/* Recent Activity */}
            <Card className="rounded-3xl border-border/70 overflow-hidden">
              <div className="border-b border-border/60 px-6 py-5 bg-muted/20">
                <h2 className="text-lg font-bold text-foreground tracking-tight">Recent activity</h2>
                <p className="text-xs text-muted-foreground mt-1">Last {recent.length} submissions</p>
              </div>
              <div className="divide-y divide-border/40">
                {recent.length === 0 && (
                  <div className="px-6 py-12 text-center text-sm text-muted-foreground">
                    <Illustration name="coding" className="mx-auto mb-3 w-32" />
                    No submissions yet. Solved problems will show up here.
                  </div>
                )}
                {recent.map((r) => (
                  <div key={r.id} className="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-muted/30">
                    {r.status === 'accepted' ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                    ) : (
                      <XCircle className="h-5 w-5 text-destructive" />
                    )}
                    <div className="flex-1 min-w-0">
                      {r.problem ? (
                        <Link href={`/dashboard/problems/${r.problem.slug}`} className={`font-semibold text-foreground truncate block ${isPreview ? 'pointer-events-none' : 'hover:underline'}`}>
                          {r.problem.title}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground font-medium">Deleted problem</span>
                      )}
                      <p className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-2">
                        <span>{r.language}</span>
                        <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                        <span className={`capitalize ${r.status === 'accepted' ? 'text-green-700 dark:text-green-400 font-semibold' : ''}`}>{r.status}</span>
                        <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                        <span>{formatDate(r.created_at)}</span>
                      </p>
                    </div>
                    {r.problem && (
                      <Badge variant="outline" className={`${DIFF_TONE[r.problem.difficulty]} ml-auto`}>
                        {r.problem.difficulty}
                      </Badge>
                    )}
                    <span className="tabular-nums text-sm font-bold ml-2">{r.score}%</span>
                  </div>
                ))}
              </div>
            </Card>

          </div>
        </div>
      </div>
    </div>
  )
}

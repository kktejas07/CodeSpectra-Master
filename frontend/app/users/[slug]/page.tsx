'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { Loader2, ArrowLeft, Trophy, Code2, CheckCircle2, XCircle, LogIn, User, Clock, Eye, Edit2, MapPin, Building2, Link as LinkIcon, Briefcase, GraduationCap } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { usePageGuard } from '@/lib/use-page-guard'
import { useAuth } from '@/lib/auth-context'
import { ContributionGraph } from '@/components/dashboard/contribution-graph'

type Difficulty = 'easy' | 'medium' | 'hard'

interface ProfileResponse {
  user: {
    id: string
    slug: string
    name: string
    email: string
    role: string
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
  easy: 'border-primary/40 bg-primary/10 text-primary',
  medium: 'border-amber-400/40 bg-amber-400/10 text-amber-400',
  hard: 'border-destructive/40 bg-destructive/10 text-destructive',
}

// Mock heatmap data for the streaks view
const mockHeatmapCells = Array.from({ length: 52 }).map(() =>
  Array.from({ length: 7 }).map(() => Math.floor(Math.random() * 4))
)

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

  const isOwner = authUser && authUser.email && (authUser.email.split('@')[0] === slug || authUser.uid === slug)

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

  if (!gate.ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…
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
            <Link href={`/auth/login?redirect=${encodeURIComponent(`/users/${slug}`)}`}>
              <Button className="w-full gap-2"><LogIn className="h-4 w-4" /> Sign in</Button>
            </Link>
            <Link href="/auth/signup">
              <Button variant="outline" className="w-full">Create account</Button>
            </Link>
          </div>
        </Card>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading profile…
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background p-10">
        <Link href="/dashboard/leaderboard" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to leaderboard
        </Link>
        <Card className="border-destructive/40 bg-destructive/5 p-6 text-destructive">
          {error || 'Profile unavailable'}
        </Card>
      </div>
    )
  }

  const { user, stats, recent } = data
  const avatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user.email || user.id)}`
  const memberDate = user.joinedAt ? new Date(user.joinedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null
  const level = Math.floor(stats.xp / 1000) + 1

  return (
    <div className="min-h-screen bg-background w-full">
      {isPreview && (
        <div className="bg-slate-900 text-slate-100 px-4 py-3 flex items-center justify-between text-sm sticky top-0 z-50">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-slate-400" />
            <span className="font-medium">This is how your profile will be visible to others. Some buttons are disabled as you cannot access them in Preview Mode.</span>
          </div>
          <Link href="/dashboard/profile">
            <Button size="sm" variant="ghost" className="h-8 text-slate-300 hover:text-white hover:bg-slate-800">Exit Preview</Button>
          </Link>
        </div>
      )}

      {/* Full Width Banner */}
      <div className="w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 mt-4">
        <div className="h-48 lg:h-64 w-full rounded-2xl relative overflow-hidden shadow-sm bg-linear-to-r from-blue-700 via-blue-600 to-indigo-800">
          <div className="absolute inset-0 opacity-30 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-size-[24px_24px]" />
          <div className="absolute left-0 right-0 top-0 -z-1 m-auto h-[310px] w-[310px] rounded-full bg-white opacity-20 blur-[100px]" />
        </div>
      </div>

      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8 pb-20">
        <div className="mt-6 grid gap-8 lg:grid-cols-[360px_1fr]">
          
          {/* Left Sidebar */}
          <aside className="space-y-6 -mt-24 relative z-10">
            <Card className="border-border/60 p-6 text-center shadow-2xl bg-card/70 backdrop-blur-xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/20 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none opacity-70" />
              <div className="absolute bottom-0 left-0 w-32 h-32 bg-purple-500/20 rounded-full blur-3xl -ml-10 -mb-10 pointer-events-none opacity-70" />
              
              <div className="relative mx-auto w-fit rounded-full bg-linear-to-br from-blue-500 to-purple-500 p-[3px] shadow-lg">
                <div className="rounded-full bg-background p-1">
                  <img src={avatar} alt={user.name} className="h-28 w-28 rounded-full object-cover bg-muted/20" />
                </div>
              </div>
              
              <h1 className="mt-5 text-2xl font-extrabold text-foreground tracking-tight">{user.name}</h1>
              <p className="mt-1 text-sm text-muted-foreground font-medium">@{user.email?.split('@')[0] || slug}</p>
              
              {/* Fake organization/location for demonstration like Unstop */}
              <div className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Building2 className="w-4 h-4" />
                <span>AI Axiss Inc</span>
              </div>
              
              <div className="mt-6 flex justify-center gap-6 text-sm">
                <div className="flex flex-col items-center p-3 rounded-xl bg-muted/30 min-w-20">
                  <span className="font-bold text-foreground text-xl">Lvl {level}</span>
                  <span className="text-[10px] uppercase text-muted-foreground tracking-wider font-bold mt-1">Level</span>
                </div>
                <div className="flex flex-col items-center p-3 rounded-xl bg-muted/30 min-w-20">
                  <span className="font-bold text-foreground text-xl">{stats.xp.toLocaleString()}</span>
                  <span className="text-[10px] uppercase text-emerald-500 tracking-wider font-bold mt-1">XP</span>
                </div>
              </div>
              
              {isOwner && !isPreview && (
                <Link href="/dashboard/profile">
                  <Button size="sm" className="mt-6 w-full gap-2 rounded-xl h-10 font-bold bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground transition-all">
                    <Edit2 className="h-4 w-4" /> Edit Profile
                  </Button>
                </Link>
              )}
            </Card>

            <Card className="border-border/60 p-5 shadow-sm bg-card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-foreground">Rankings</h3>
                <span className="text-xs font-medium text-blue-500 hover:underline cursor-pointer">How it works?</span>
              </div>
              
              <div className="rounded-xl bg-linear-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 p-5 text-center border border-blue-100 dark:border-blue-900/50 relative overflow-hidden">
                <p className="text-xs font-medium text-muted-foreground text-left">Global Rank</p>
                <div className="mt-2 flex items-center gap-3">
                  <Trophy className="h-7 w-7 text-amber-500 drop-shadow-sm" />
                  <span className="text-3xl font-extrabold text-foreground tracking-tight">1</span>
                </div>
              </div>
              
              <div className="mt-5 space-y-3 pt-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground font-medium">Total Points</span>
                  <span className="font-bold">{stats.xp}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground font-medium">Total Badges</span>
                  <span className="font-bold">1</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground font-medium">Problems Solved</span>
                  <span className="font-bold">{stats.solved}</span>
                </div>
              </div>
            </Card>

            {/* Social Links */}
            <Card className="border-border/60 p-5 shadow-sm bg-card">
              <h3 className="font-semibold text-foreground mb-4">Connect</h3>
              <div className="flex gap-3">
                <Button variant="outline" size="icon" className="rounded-full w-10 h-10 bg-muted/30" disabled={isPreview}>
                  <Briefcase className="w-4 h-4 text-blue-600" />
                </Button>
                <Button variant="outline" size="icon" className="rounded-full w-10 h-10 bg-muted/30" disabled={isPreview}>
                  <Code2 className="w-4 h-4 text-foreground" />
                </Button>
                <Button variant="outline" size="icon" className="rounded-full w-10 h-10 bg-muted/30" disabled={isPreview}>
                  <LinkIcon className="w-4 h-4 text-muted-foreground" />
                </Button>
              </div>
            </Card>
          </aside>

          {/* Right Main Content */}
          <div className="space-y-6 min-w-0">
            
            {/* About Section */}
            <Card className="border-border/60 p-6 shadow-sm">
              <h2 className="text-lg font-bold text-foreground tracking-tight mb-3">About</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                As a dedicated professional, I'm always on the lookout for opportunities to grow and develop in my field. My goal is to discover a role that matches my expertise, experience, and career goals.
              </p>
            </Card>

            {/* Streaks / Heatmap Section */}
            <Card className="border-border/60 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-foreground tracking-tight">Streaks</h2>
              </div>
              <div className="bg-card w-full overflow-x-auto">
                <div className="min-w-[800px]">
                  <ContributionGraph cells={mockHeatmapCells} totalContributions={stats.totalSubmissions || 45} />
                </div>
              </div>
              <div className="mt-4 flex items-center gap-4 text-sm font-medium">
                <div className="text-muted-foreground">Current Streak <strong className="text-foreground">1 Days</strong></div>
                <div className="text-muted-foreground">Max Streak <strong className="text-foreground">12 Days</strong></div>
              </div>
            </Card>

            {/* Skills & Stats */}
            <div className="grid gap-4 sm:grid-cols-3">
              {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
                <Card key={d} className="p-5 bg-card/40 border-border/60">
                  <p className="text-xs uppercase text-muted-foreground">{d}</p>
                  <p className="mt-1 text-3xl font-bold tabular-nums text-foreground">{stats.byDifficulty[d]}</p>
                  <p className="text-xs text-muted-foreground">unique problems solved</p>
                </Card>
              ))}
            </div>

            {/* Experience & Education placeholders like Unstop */}
            <div className="grid gap-6 md:grid-cols-2">
              <Card className="border-border/60 p-6 shadow-sm">
                <h2 className="text-lg font-bold text-foreground tracking-tight mb-4 flex items-center gap-2">
                  <Briefcase className="w-5 h-5 text-blue-500" /> Work Experience
                </h2>
                <div className="space-y-4">
                  <div className="relative pl-6 border-l-2 border-muted">
                    <div className="absolute w-3 h-3 bg-blue-500 rounded-full -left-[7px] top-1.5 ring-4 ring-background" />
                    <h4 className="font-semibold text-sm">Senior Developer</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">AI Axiss Inc · 2022 - Present</p>
                  </div>
                  <div className="relative pl-6 border-l-2 border-muted">
                    <div className="absolute w-3 h-3 bg-muted-foreground rounded-full -left-[7px] top-1.5 ring-4 ring-background" />
                    <h4 className="font-semibold text-sm">Software Engineer</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">TechCorp · 2019 - 2022</p>
                  </div>
                </div>
              </Card>

              <Card className="border-border/60 p-6 shadow-sm">
                <h2 className="text-lg font-bold text-foreground tracking-tight mb-4 flex items-center gap-2">
                  <GraduationCap className="w-5 h-5 text-purple-500" /> Education
                </h2>
                <div className="space-y-4">
                  <div className="relative pl-6 border-l-2 border-muted">
                    <div className="absolute w-3 h-3 bg-purple-500 rounded-full -left-[7px] top-1.5 ring-4 ring-background" />
                    <h4 className="font-semibold text-sm">B.S. Computer Science</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">University of Technology · 2015 - 2019</p>
                  </div>
                </div>
              </Card>
            </div>

            {/* Recent Activity */}
            <Card className="border-border/60 shadow-sm overflow-hidden">
              <div className="border-b border-border/60 px-6 py-5 bg-muted/10">
                <h2 className="text-lg font-bold text-foreground tracking-tight">Recent activity</h2>
                <p className="text-xs text-muted-foreground mt-1">Last {recent.length} submissions</p>
              </div>
              <div className="divide-y divide-border/40">
                {recent.length === 0 && (
                  <div className="px-6 py-12 text-center text-sm text-muted-foreground">
                    No submissions yet.
                  </div>
                )}
                {recent.map((r) => (
                  <div key={r.id} className="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-muted/30">
                    {r.status === 'accepted' ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-500" />
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
                      <p className="text-xs uppercase tracking-wider text-muted-foreground mt-1 flex items-center gap-2">
                        <span>{r.language}</span>
                        <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                        <span className={r.status === 'accepted' ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : ''}>{r.status}</span>
                        <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                        <span>{new Date(r.created_at).toLocaleDateString()}</span>
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

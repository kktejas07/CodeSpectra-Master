'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import type { LucideIcon } from 'lucide-react'
import {
  Edit2,
  Trophy,
  Target,
  Flame,
  Shield,
  Zap,
  Crosshair,
  Cloud,
  Clock,
  BookOpen,
  GitCommit,
  GitPullRequest,
  FolderGit2,
  Sparkles,
  Calendar,
} from 'lucide-react'

const PINNED = [
  { name: 'CodeSpectra-Master', visibility: 'Public' as const, lang: 'TypeScript', desc: 'Quality & learning platform' },
  { name: 'practice-dsa', visibility: 'Public' as const, lang: 'Python', desc: 'Interview prep kit' },
  { name: 'scanner-service', visibility: 'Private' as const, lang: 'Go', desc: 'Worker for static analysis' },
  { name: 'design-system', visibility: 'Public' as const, lang: 'TypeScript', desc: 'Shared UI tokens' },
]

const ACTIVITY = [
  { type: 'commit' as const, title: 'Completed module: RBAC deep dive', meta: 'Learning · 2h ago', detail: 'Security track' },
  { type: 'pr' as const, title: 'Opened practice PR on CodeSpectra-Master', meta: 'Arena · Yesterday', detail: '2 comments' },
  { type: 'commit' as const, title: 'Finished challenge: Two Sum', meta: 'Arena · Apr 16', detail: 'JavaScript' },
  { type: 'repo' as const, title: 'Created repository scanner-service', meta: 'Apr 6', detail: 'Go · Private' },
]

const ACHIEVEMENTS: Array<{ label: string; tone: string; icon: LucideIcon }> = [
  { label: 'Streak 7', tone: 'from-emerald-500/90 to-teal-600/90', icon: Flame },
  { label: 'Top 5% learner', tone: 'from-sky-500/90 to-blue-600/90', icon: Trophy },
  { label: 'Scanner pro', tone: 'from-violet-500/90 to-purple-600/90', icon: Shield },
  { label: 'Arena 12', tone: 'from-amber-500/90 to-orange-600/90', icon: Zap },
]

function LearningHeatmap() {
  const cells = useMemo(() => {
    const pattern = [0, 1, 2, 1, 3, 2, 4, 1, 0, 2, 3, 1, 2, 0]
    const weeks = 14
    const days = 7
    const out: number[][] = []
    for (let w = 0; w < weeks; w++) {
      const row: number[] = []
      for (let d = 0; d < days; d++) {
        row.push(pattern[(w + d * 3) % pattern.length] ?? 0)
      }
      out.push(row)
    }
    return out
  }, [])

  const level = (n: number) => {
    const base = 'rounded-sm border border-border/40 '
    const tones = [
      'bg-muted/40',
      'bg-primary/15',
      'bg-primary/35',
      'bg-primary/55',
      'bg-primary/80',
    ]
    return base + (tones[n] ?? tones[0])
  }

  return (
    <Card className="border-border/60 p-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Learning activity</h2>
          <p className="text-sm text-muted-foreground">Time on platform (mock) — last 14 weeks</p>
        </div>
        <Badge variant="secondary" className="font-normal">
          <Calendar className="mr-1 h-3.5 w-3.5" />
          2026
        </Badge>
      </div>
      <div className="flex gap-1 overflow-x-auto pb-1">
        {cells.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            {week.map((n, di) => (
              <div key={di} className={`h-3.5 w-3.5 shrink-0 ${level(n)}`} title={`Level ${n}`} />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-end gap-2 text-xs text-muted-foreground">
        <span>Less</span>
        <div className="flex gap-1">
          {[0, 1, 2, 3, 4].map((n) => (
            <div key={n} className={`h-3.5 w-3.5 rounded-sm ${level(n)}`} />
          ))}
        </div>
        <span>More</span>
      </div>
    </Card>
  )
}

export default function ProfilePage() {
  const [userStats] = useState({
    name: 'Alex Sterling',
    handle: 'alex.codes',
    role: 'Senior engineer',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alex',
    level: 42,
    currentXP: 85420,
    maxXP: 100000,
    globalRank: '#1,204',
    rankImprovement: '+12 positions',
    contributions: '4.8k',
    learningMinutesWeek: 312,
    streakDays: 5,
  })

  const competencies = [
    { name: 'Security architecture', percentage: 94 },
    { name: 'System performance', percentage: 88 },
    { name: 'Concurrency', percentage: 76 },
    { name: 'AI-assisted delivery', percentage: 62 },
  ]

  const mastery: Array<{ name: string; description: string; icon: LucideIcon }> = [
    { name: 'Security focus', description: 'Top decile vulnerability reviews', icon: Shield },
    { name: 'Fast refactors', description: 'Consistent cleanup velocity', icon: Zap },
    { name: 'Quality bar', description: '100+ critical fixes shipped', icon: Crosshair },
    { name: 'Cloud paths', description: 'Deployments & reliability', icon: Cloud },
  ]

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,280px)_1fr]">
      {/* Sidebar */}
      <aside className="space-y-6">
        <Card className="border-border/60 p-6 text-center">
          <div className="relative mx-auto w-fit">
            <img
              src={userStats.avatar}
              alt=""
              className="h-36 w-36 rounded-xl border border-border object-cover"
            />
            <Badge className="absolute bottom-2 right-2 bg-primary text-primary-foreground">Lvl {userStats.level}</Badge>
          </div>
          <h1 className="mt-4 text-xl font-bold text-foreground">{userStats.name}</h1>
          <p className="text-sm text-muted-foreground">@{userStats.handle}</p>
          <p className="mt-1 text-sm text-primary">{userStats.role}</p>
          <Button variant="outline" size="sm" className="mt-4 w-full gap-2">
            <Edit2 className="h-4 w-4" />
            Edit profile
          </Button>
        </Card>

        <Card className="border-border/60 p-5 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Followers</span>
            <span className="font-medium text-foreground">1</span>
          </div>
          <Separator className="my-3" />
          <div className="flex justify-between text-muted-foreground">
            <span>Following</span>
            <span className="font-medium text-foreground">0</span>
          </div>
          <Separator className="my-3" />
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="h-4 w-4 shrink-0" />
            <span>Local · demo time</span>
          </div>
        </Card>

        <div>
          <h2 className="mb-3 text-sm font-semibold text-foreground">Achievements</h2>
          <div className="grid grid-cols-2 gap-2">
            {ACHIEVEMENTS.map((a) => {
              const Icon = a.icon
              return (
                <div
                  key={a.label}
                  className={`flex aspect-square flex-col items-center justify-center rounded-full bg-linear-to-br ${a.tone} p-2 text-center text-[10px] font-semibold text-white shadow-sm`}
                >
                  <Icon className="mb-1 h-5 w-5 opacity-95" strokeWidth={1.75} aria-hidden />
                  {a.label}
                </div>
              )
            })}
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="min-w-0 space-y-8">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="border-border/60 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Learning this week</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{userStats.learningMinutesWeek}m</p>
            <p className="text-xs text-muted-foreground">Time on platform (sample)</p>
          </Card>
          <Card className="border-border/60 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Streak</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{userStats.streakDays} days</p>
            <p className="text-xs text-muted-foreground">Practice & lessons</p>
          </Card>
          <Card className="border-border/60 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Global rank</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{userStats.globalRank}</p>
            <p className="text-xs text-green-600 dark:text-green-400">{userStats.rankImprovement}</p>
          </Card>
          <Card className="border-border/60 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Contributions</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{userStats.contributions}</p>
            <p className="text-xs text-muted-foreground">Scans & fixes (sample)</p>
          </Card>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-foreground">Pinned</h2>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/dashboard/scanner?mode=github">Customize</Link>
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {PINNED.map((repo) => (
              <Card key={repo.name} className="border-border/60 p-4 transition-colors hover:border-primary/40">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <FolderGit2 className="h-4 w-4 shrink-0 text-primary" />
                      <span className="truncate font-medium text-foreground">{repo.name}</span>
                      <Badge variant="outline" className="text-[10px] font-normal">
                        {repo.visibility}
                      </Badge>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{repo.desc}</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="h-2 w-2 rounded-full bg-primary/70" />
                  {repo.lang}
                </div>
              </Card>
            ))}
          </div>
        </div>

        <LearningHeatmap />

        <Card className="border-border/60 p-6">
          <div className="mb-4 flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Recent activity</h2>
          </div>
          <div className="relative space-y-0 border-l border-border pl-5">
            {ACTIVITY.map((item, idx) => (
              <div key={idx} className="relative pb-6 last:pb-0">
                <span className="absolute -left-[21px] top-1 flex h-3 w-3 rounded-full border-2 border-background bg-primary" />
                <div className="flex flex-wrap items-center gap-2">
                  {item.type === 'commit' ? (
                    <GitCommit className="h-4 w-4 text-muted-foreground" />
                  ) : item.type === 'pr' ? (
                    <GitPullRequest className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Sparkles className="h-4 w-4 text-muted-foreground" />
                  )}
                  <p className="font-medium text-foreground">{item.title}</p>
                </div>
                <p className="text-xs text-muted-foreground">{item.meta}</p>
                <p className="text-xs text-muted-foreground/80">{item.detail}</p>
              </div>
            ))}
          </div>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="border-border/60 p-6">
            <div className="mb-4 flex items-center gap-2">
              <Trophy className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">Mastery</h2>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {mastery.map((m) => {
                const I = m.icon
                return (
                  <div
                    key={m.name}
                    className="rounded-lg border border-border/60 bg-muted/20 p-3 text-center transition-colors hover:border-primary/40"
                  >
                    <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg border border-border/60 bg-background text-primary">
                      <I className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                    </div>
                    <p className="mt-2 text-xs font-semibold text-foreground">{m.name}</p>
                    <p className="text-[10px] text-muted-foreground">{m.description}</p>
                  </div>
                )
              })}
            </div>
          </Card>

          <Card className="border-border/60 p-6">
            <div className="mb-4 flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">Competency map</h2>
            </div>
            <div className="space-y-4">
              {competencies.map((comp) => (
                <div key={comp.name}>
                  <div className="mb-2 flex justify-between text-sm">
                    <span className="font-medium text-foreground">{comp.name}</span>
                    <span className="font-bold text-primary">{comp.percentage}%</span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-muted">
                    <div
                      className="h-2.5 rounded-full bg-linear-to-r from-primary to-primary/50 transition-all"
                      style={{ width: `${comp.percentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

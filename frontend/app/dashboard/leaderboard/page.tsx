'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Trophy, Medal, Award, Loader2, CheckCircle2, HelpCircle, BarChart3, Globe, Users, Beaker, Briefcase, GraduationCap, Puzzle, Tent, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { LeaderboardEntryDTO } from '@/lib/leaderboard-types'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { usePageGuard } from '@/lib/use-page-guard'
import { useAuth } from '@/lib/auth-context'
import { useTour, autoPlayPageTour, type TourStep } from '@/components/tour/tour-context'
import { UserAvatar } from '@/components/ui/user-avatar'
import { PageHeader, Panel } from '@/components/app/page-kit'
import { SoftGlow } from '@/components/visuals'
import { EmptyState } from '@/components/ui/empty-state'

type Category = 'Global' | 'Female' | 'Arts & Science' | 'Engineering' | 'Management' | 'Quiz' | 'Hackathon'

const categories: { id: Category; icon: any }[] = [
  { id: 'Global', icon: Globe },
  { id: 'Female', icon: Users },
  { id: 'Arts & Science', icon: Beaker },
  { id: 'Engineering', icon: GraduationCap },
  { id: 'Management', icon: Briefcase },
  { id: 'Quiz', icon: Puzzle },
  { id: 'Hackathon', icon: Tent },
]

export default function LeaderboardPage() {
  const gate = usePageGuard('user')
  const { user } = useAuth()
  const { startTour, setTourSeen } = useTour()

  const [activeTab, setActiveTab] = useState<'Live' | 'Previous'>('Live')
  const [activeCategory, setActiveCategory] = useState<Category>('Global')
  const [entries, setEntries] = useState<LeaderboardEntryDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [myPoints, setMyPoints] = useState(0)
  const [myRank, setMyRank] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // We map 'view' to 'global' for the API for now, since the backend might not support the new categories yet.
      const res = await fetch(`/api/leaderboard?scope=global&limit=80`, { credentials: 'include' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(json.error || `Request failed (${res.status})`)
      }
      setEntries(Array.isArray(json.entries) ? json.entries : [])
      setMyPoints(Number(json.currentUser?.points) || 0)
      setMyRank(typeof json.currentUser?.rank === 'number' ? json.currentUser.rank : null)
    } catch (e) {
      setEntries([])
      setError(e instanceof Error ? e.message : 'Failed to load leaderboard')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Initialize tour on first visit
  useEffect(() => {
    if (gate.ready) {
      const leaderboardTour: TourStep[] = [
        {
          target: '[data-tour="leaderboard-header"]',
          title: 'Leaderboard',
          description: 'See where you rank against other developers. Compete for the top spot!',
          position: 'bottom',
        },
        {
          target: '[data-tour="leaderboard-tabs"]',
          title: 'Live vs previous',
          description: 'Toggle between live rankings and past leaderboard results.',
          position: 'bottom',
        },
        {
          target: '[data-tour="leaderboard-categories"]',
          title: 'Categories',
          description: 'Filter the leaderboard by category: Global, Female, Engineering, and more.',
          position: 'right',
        },
        {
          target: '[data-tour="leaderboard-podium"]',
          title: 'Top performers',
          description: 'The top 3 performers are highlighted here. Can you reach the podium?',
          position: 'bottom',
        },
        {
          target: '[data-tour="leaderboard-my-rank"]',
          title: 'Your rank',
          description: 'See your current global rank and points. Keep climbing!',
          position: 'bottom',
        },
        {
          target: '[data-tour="leaderboard-table"]',
          title: 'Full rankings',
          description: 'Browse all developers ranked by points. Search to find specific users.',
          position: 'top',
        },
      ]
      autoPlayPageTour('leaderboard', leaderboardTour)}
  }, [gate.ready, startTour, setTourSeen])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return entries
    return entries.filter(
      (e) =>
        (e.name || '').toLowerCase().includes(q) ||
        (e.title || '').toLowerCase().includes(q)
    )
  }, [entries, search])

  const top3 = filtered.slice(0, 3)
  // Podium mapping: Rank 2, Rank 1, Rank 3 for layout visually
  const podiumOrder = top3.length === 3 ? [top3[1], top3[0], top3[2]] : top3

  if (!gate.ready) return null

  return (
    <div className="flex flex-col md:flex-row gap-8">
      {/* Left Sidebar */}
      <div className="w-full md:w-64 shrink-0 space-y-6">
        <div className="flex border-b border-border" data-tour="leaderboard-tabs">
          <button
            onClick={() => setActiveTab('Live')}
            className={cn('flex-1 pb-3 text-sm font-semibold transition-all border-b-2', activeTab === 'Live' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}
          >
            Live
          </button>
          <button
            onClick={() => setActiveTab('Previous')}
            className={cn('flex-1 pb-3 text-sm font-semibold transition-all border-b-2', activeTab === 'Previous' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}
          >
            Previous
          </button>
        </div>

        <div className="flex flex-col gap-1 p-2 bg-muted/40 rounded-2xl" data-tour="leaderboard-categories">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              aria-pressed={activeCategory === cat.id}
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary',
                activeCategory === cat.id ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              )}
            >
              <cat.icon className="w-4 h-4" />
              {cat.id}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 min-w-0 space-y-6 pb-12" data-tour="leaderboard-header">
        <div className="relative isolate">
          <SoftGlow className="-inset-x-2 -top-4 rounded-3xl" />
          <PageHeader
            title={`${activeTab} leaderboard`}
            description={`${activeCategory} rankings by points earned from practice, quizzes and events.`}
            icon={<BarChart3 />}
            className="mb-0"
          />
        </div>

        {error && (
          <Card className="rounded-2xl border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{error}</Card>
        )}

        {loading && entries.length === 0 ? (
          <div className="space-y-6" aria-busy="true" aria-label="Loading leaderboard">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3 md:items-end pt-8">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i} className="rounded-3xl border-border/70 p-8 flex flex-col items-center gap-4 animate-pulse">
                  <div className="h-24 w-24 rounded-full bg-muted/60" />
                  <div className="h-4 w-24 bg-muted/60 rounded" />
                  <div className="h-3 w-16 bg-muted/50 rounded" />
                </Card>
              ))}
            </div>
            <Card className="rounded-3xl border-border/70 p-6 h-28 animate-pulse" />
            <Card className="rounded-3xl border-border/70 p-6 space-y-3 animate-pulse">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-10 w-full bg-muted/50 rounded-xl" />
              ))}
            </Card>
          </div>
        ) : entries.length === 0 ? (
          <EmptyState
            title="Nobody's on this leaderboard yet"
            description="Solve a problem to earn points and be the first name here."
            actionLabel="Practise problems"
            actionHref="/dashboard/problems"
          />
        ) : (
          <>
            {/* Podium */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3 md:items-end pt-8" data-tour="leaderboard-podium">
              {podiumOrder.map((ranker) => {
                const isRank1 = ranker.rank === 1
                const isRank2 = ranker.rank === 2
                const isRank3 = ranker.rank === 3

                const cardGradient = isRank1 
                  ? 'from-amber-100 to-card dark:from-amber-500/15 dark:to-card border-amber-300 dark:border-amber-500/40' 
                  : isRank2
                  ? 'from-primary/15 to-card border-primary/30'
                  : 'from-orange-100 to-card dark:from-orange-500/15 dark:to-card border-orange-300 dark:border-orange-500/40'

                const bottomBar = isRank1 ? 'bg-amber-400 text-amber-950' : isRank2 ? 'bg-primary text-primary-foreground' : 'bg-orange-600 text-white'
                const rankColor = isRank1 ? 'bg-amber-400 text-amber-950' : isRank2 ? 'bg-primary text-primary-foreground' : 'bg-orange-600 text-white'
                const rankIcon = isRank1 ? <Trophy className="w-4 h-4" /> : isRank2 ? <Medal className="w-4 h-4" /> : <Award className="w-4 h-4" />

                return (
                  <Card
                    key={ranker.userId}
                    className={cn(
                      'relative overflow-hidden rounded-3xl border-2 transition-shadow duration-300 flex flex-col',
                      `bg-linear-to-b ${cardGradient}`,
                      isRank1 ? 'md:-translate-y-8 z-10 shadow-[0_18px_40px_-20px_rgba(15,23,41,0.35)]' : ''
                    )}
                  >
                    <div className="flex-1 flex flex-col items-center p-8 space-y-4 pt-12 text-center">
                      <div className="relative">
                        <UserAvatar
                          src={ranker.avatar}
                          seed={ranker.userId}
                          name={ranker.name}
                          className="h-24 w-24 border-4 border-card shadow-lg bg-card"
                        />
                        <div className={cn("absolute -bottom-3 -right-3 flex items-center justify-center w-10 h-10 rounded-full font-bold tabular-nums shadow-md border-2 border-card", rankColor)}>
                          #{ranker.rank}
                        </div>
                      </div>

                      <div className="pt-2">
                        <p className="text-xl font-extrabold text-foreground">{ranker.name || 'Anonymous'}</p>
                        <p className="mt-1 text-xs font-medium text-muted-foreground h-8 overflow-hidden">{ranker.title || ''}</p>
                      </div>
                    </div>

                    <div className={cn("py-3 text-center font-bold tabular-nums flex items-center justify-center gap-2", bottomBar)}>
                      <div className="bg-white/25 p-1 rounded-full">{rankIcon}</div>
                      {(ranker.xp || 0).toLocaleString()} points
                    </div>
                  </Card>
                )
              })}
            </div>

            {/* My Rank Card */}
            <div className="relative overflow-hidden rounded-3xl bg-linear-to-br from-[#2f5be7] via-[#2448c9] to-[#17224d] p-6 text-white shadow-[0_18px_40px_-20px_rgba(47,91,231,0.55)] flex flex-col sm:flex-row sm:items-center justify-between gap-4" data-tour="leaderboard-my-rank">
              {/* Decorative background */}
              <div aria-hidden className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-[#38bdf8]/30 blur-3xl" />
              
              <div className="relative z-10 flex items-center gap-4">
                <div className="relative">
                  <Badge className="absolute -top-3 -left-3 rotate-[-15deg] bg-white text-[#2448c9] shadow-md z-20">You</Badge>
                  <UserAvatar src={user?.photoURL} seed={user?.email} name={user?.displayName} className="w-16 h-16 border-2 border-white/60 shadow-md bg-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold">{user?.displayName || "You"}</h3>
                  {user?.email && <p className="text-sm text-white/75">{user.email}</p>}
                  <div className="flex items-center gap-4 mt-2">
                     <Badge variant="secondary" className="border border-white/30 bg-white/15 text-white font-semibold tabular-nums">
                        <BarChart3 className="w-3 h-3 mr-1" />
                        {myPoints.toLocaleString()} points
                     </Badge>
                  </div>
                </div>
              </div>

              <div className="relative z-10 flex flex-col items-end">
                  <div className="flex items-center gap-2 font-bold text-lg tabular-nums border border-white/30 bg-white/15 px-4 py-2 rounded-xl">
                     <Trophy className="w-5 h-5 text-amber-300" aria-hidden />
                     Your rank: {myRank ? `#${myRank}` : '—'}
                  </div>
              </div>
            </div>

            <div className="space-y-4 pt-4" data-tour="leaderboard-table">
              <h2 className="text-lg font-semibold text-foreground">Rankings</h2>
              <Card className="overflow-hidden rounded-3xl border-border/70">
                <div className="flex flex-col gap-3 border-b border-border px-6 py-4 sm:flex-row sm:items-center sm:justify-between bg-muted/20">
                  <div className="relative w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Find a person…"
                      aria-label="Find a person"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-9 bg-background/50 border-border/60"
                    />
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-sm font-semibold text-muted-foreground">
                        <th className="px-6 py-4">Name</th>
                        <th className="px-6 py-4 text-center">Rank</th>
                        <th className="px-6 py-4 text-right">Points</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60 bg-background">
                      {filtered.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-6 py-16 text-center text-sm text-muted-foreground">
                            Nobody's on this leaderboard yet. Solve a problem to be the first.
                          </td>
                        </tr>
                      ) : (
                        filtered.map((u, i) => (
                          <tr
                            key={u.userId}
                            className="transition-colors hover:bg-muted/30 group"
                          >
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-4">
                                <div className="relative">
                                    <div className="w-10 h-10 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center border border-primary/20 shrink-0">
                                       {((u.name || '').substring(0, 2) || '?').toUpperCase()}
                                    </div>
                                </div>
                                <div>
                                  <p className="font-bold text-foreground group-hover:text-primary transition-colors">{u.name}</p>
                                  <p className="text-xs text-muted-foreground font-medium">{u.title}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span className="font-bold text-lg tabular-nums text-foreground">#{u.rank}</span>
                            </td>
                             <td className="px-6 py-4 text-right">
                               <span className="font-bold text-primary text-lg tabular-nums">
                                 {(u.xp || 0).toLocaleString()}
                               </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  )
}


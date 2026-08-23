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
    <div className="flex flex-col md:flex-row gap-8 min-h-screen">
      {/* Left Sidebar */}
      <div className="w-full md:w-64 shrink-0 space-y-6">
        <div className="flex border-b border-border">
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

        <div className="flex flex-col gap-1 p-2 bg-muted/30 rounded-xl">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all',
                activeCategory === cat.id ? 'bg-primary/10 text-primary shadow-sm' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              )}
            >
              <cat.icon className="w-4 h-4" />
              {cat.id}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 space-y-8 pb-12">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold flex items-center gap-3">
            {activeTab} Leaderboard ({activeCategory})
            <BarChart3 className="w-8 h-8 text-amber-500" />
          </h1>
        </div>

        {error && (
          <Card className="border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{error}</Card>
        )}

        {loading && entries.length === 0 ? (
          <Card className="flex items-center justify-center gap-2 py-20 text-muted-foreground bg-transparent border-dashed">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading rankings…
          </Card>
        ) : (
          <>
            {/* Podium */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3 md:items-end pt-8">
              {podiumOrder.map((ranker) => {
                const isRank1 = ranker.rank === 1
                const isRank2 = ranker.rank === 2
                const isRank3 = ranker.rank === 3

                const cardGradient = isRank1 
                  ? 'from-amber-100 to-amber-50 dark:from-amber-950 dark:to-background border-amber-300' 
                  : isRank2
                  ? 'from-indigo-100 to-indigo-50 dark:from-indigo-950 dark:to-background border-indigo-300'
                  : 'from-orange-100 to-orange-50 dark:from-orange-950 dark:to-background border-orange-300'

                const bottomBar = isRank1 ? 'bg-amber-400' : isRank2 ? 'bg-indigo-500' : 'bg-orange-500'
                const rankColor = isRank1 ? 'bg-amber-400 text-amber-950' : isRank2 ? 'bg-indigo-500 text-white' : 'bg-orange-500 text-white'
                const rankIcon = isRank1 ? <Trophy className="w-4 h-4" /> : isRank2 ? <Medal className="w-4 h-4" /> : <Award className="w-4 h-4" />

                return (
                  <Card
                    key={ranker.userId}
                    className={cn(
                      'relative overflow-hidden rounded-2xl border-2 transition-all hover:shadow-xl flex flex-col',
                      `bg-gradient-to-b ${cardGradient}`,
                      isRank1 ? 'md:-translate-y-8 z-10 shadow-2xl' : 'opacity-90 hover:opacity-100'
                    )}
                  >
                    <div className="flex-1 flex flex-col items-center p-8 space-y-4 pt-12 text-center">
                      <div className="relative">
                        <img
                          src={ranker.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(ranker.userId || 'x')}`}
                          alt={ranker.name || 'User'}
                          className="h-24 w-24 rounded-full border-4 border-white shadow-lg object-cover bg-white"
                        />
                        <div className={cn("absolute -bottom-3 -right-3 flex items-center justify-center w-10 h-10 rounded-full font-bold shadow-md border-2 border-white", rankColor)}>
                          #{ranker.rank}
                        </div>
                      </div>

                      <div className="pt-2">
                        <p className="text-xl font-extrabold text-foreground">{ranker.name || 'Anonymous'}</p>
                        <p className="mt-1 text-xs font-medium tracking-wide text-muted-foreground uppercase h-8 overflow-hidden">{ranker.title || ''}</p>
                      </div>
                    </div>

                    <div className={cn("py-3 text-center font-bold flex items-center justify-center gap-2 text-white", bottomBar)}>
                      <div className="bg-white/20 p-1 rounded-full">{rankIcon}</div>
                      {(ranker.xp || 0).toLocaleString()} Points
                    </div>
                  </Card>
                )
              })}
            </div>

            {/* My Rank Card */}
            <Card className="relative overflow-hidden rounded-2xl bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900/50 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
               {/* Decorative background */}
              <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] mix-blend-overlay pointer-events-none" />
              
              <div className="relative z-10 flex items-center gap-4">
                <div className="relative">
                  <Badge className="absolute -top-3 -left-3 rotate-[-15deg] bg-blue-600 text-white shadow-md z-20">My Rank</Badge>
                  <img src={user?.photoURL || "https://api.dicebear.com/7.x/avataaars/svg?seed=fallback"} alt="You" className="w-16 h-16 rounded-full border-2 border-white shadow-md bg-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold">{user?.displayName || "Anonymous User"}</h3>
                  <p className="text-sm text-muted-foreground">{user?.email || "No org available"}</p>
                  <div className="flex items-center gap-4 mt-2">
                     <Badge variant="secondary" className="bg-white/60 dark:bg-black/20 font-semibold">
                        <BarChart3 className="w-3 h-3 mr-1 text-blue-500" />
                        {myPoints.toLocaleString()} Points
                     </Badge>
                    <Badge variant="secondary" className="bg-white/60 dark:bg-black/20 font-semibold">
                       <Trophy className="w-3 h-3 mr-1 text-yellow-500" />
                       0 Certificates
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="relative z-10 flex flex-col items-end">
                  <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 font-bold text-lg bg-blue-100/50 dark:bg-blue-900/30 px-4 py-2 rounded-lg">
                     <BarChart3 className="w-5 h-5" />
                     Global Rank: {myRank ? `#${myRank}` : '—'}
                  </div>
              </div>
            </Card>

            {/* Rankings Table */}
            <div className="space-y-4 pt-4">
              <h2 className="text-2xl font-bold">Rankings</h2>
              <Card className="overflow-hidden rounded-2xl">
                <div className="flex flex-col gap-3 border-b border-border px-6 py-4 sm:flex-row sm:items-center sm:justify-between bg-muted/20">
                  <div className="relative w-full sm:max-w-xs">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Find developer…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-9 bg-background/50 border-border/60"
                    />
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-sm font-bold text-muted-foreground uppercase tracking-wider">
                        <th className="px-6 py-4 rounded-tl-lg">Student Name</th>
                        <th className="px-6 py-4 bg-primary text-primary-foreground text-center">Rank</th>
                        <th className="px-6 py-4 text-center">Rank Change</th>
                        <th className="px-6 py-4 text-center">Certificates</th>
                        <th className="px-6 py-4 text-right rounded-tr-lg">Points</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60 bg-background">
                      {filtered.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-16 text-center text-sm text-muted-foreground">
                            No rows found for this category.
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
                              <span className="font-bold text-lg text-foreground"># {u.rank}</span>
                            </td>
                            <td className="px-6 py-4 text-center text-muted-foreground font-semibold">
                              -
                            </td>
                            <td className="px-6 py-4 text-center text-muted-foreground font-semibold">
                               {Math.floor(Math.random() * 2000)} {/* Mock Certificates */}
                            </td>
                             <td className="px-6 py-4 text-right">
                               <span className="font-bold text-blue-500 text-lg tabular-nums">
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


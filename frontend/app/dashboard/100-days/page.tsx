'use client'

import { useMemo, useState, useEffect } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { 
  Flame, CheckCircle2, Lock, Code2, Trophy, TrendingUp, BookOpen, 
  ArrowRight, Loader2, ChevronDown, ChevronUp, Bookmark, Target
} from 'lucide-react'
import { HUNDRED_DAYS, type HundredDay } from '@/lib/100-days-data'
import { difficultyTotals } from '@/lib/hundred-days-progress'
import { usePageGuard } from '@/lib/use-page-guard'
import { ContributionGraph } from '@/components/dashboard/contribution-graph'
import { UserAvatar } from '@/components/ui/user-avatar'
import { useTour, autoPlayPageTour, type TourStep } from '@/components/tour/tour-context'
import { SkeletonCard, SkeletonStats, SkeletonList, SkeletonText } from '@/components/ui/skeleton-boneyard'
import { PageHeader, Panel } from '@/components/app/page-kit'
import { SoftGlow } from '@/components/visuals'
import { useT } from '@/lib/i18n/client'

function getCompletedLocal(): Set<number> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem('100-days-completed')
    return new Set<number>(raw ? JSON.parse(raw) as number[] : [])
  } catch { return new Set() }
}

export default function HundredDaysPage() {
  const { t: tr } = useT()
  const gate = usePageGuard('user')
  const { startTour, setTourSeen } = useTour()

  // W4-10: localStorage is read after mount (same first render on server and client).
  const [completed, setCompleted] = useState<Set<number>>(() => new Set())
  useEffect(() => {
    const local = getCompletedLocal()
    if (local.size) setCompleted((cur) => (cur.size ? cur : local))
  }, [])
  const [filter, setFilter] = useState<'all' | 'available' | 'completed' | 'locked'>('all')
  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set([1]))
  const [loadingProgress, setLoadingProgress] = useState(true)

  const [heatmapData, setHeatmapData] = useState<any>(null)
  const [leaderboard, setLeaderboard] = useState<any[]>([])
  const [userRank, setUserRank] = useState<{points: number, rank: number}>({points: 0, rank: 0})
  
  const [solvedProblems, setSolvedProblems] = useState<Set<string>>(new Set())

  // Load progress from the server (it records every accepted sprint submission).
  useEffect(() => {
    if (!gate.ready) return
    setLoadingProgress(true)
    fetch('/api/user/100-days', { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data.completedDays)) {
          const serverCompleted = new Set<number>(data.completedDays as number[])
          setCompleted(serverCompleted)
          // Cache for the next visit's first paint.
          try { localStorage.setItem('100-days-completed', JSON.stringify([...serverCompleted])) } catch {}
        }
        if (Array.isArray(data.solvedProblems)) setSolvedProblems(new Set<string>(data.solvedProblems as string[]))
      })
      .catch(() => {})
      .finally(() => setLoadingProgress(false))
  }, [gate.ready])

  useEffect(() => {
    fetch('/api/user/heatmap?weeks=12', { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (data && !data.error && data.cells) {
           setHeatmapData(data)
        }
      })
      .catch(() => {})

    fetch('/api/leaderboard', { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (data && !data.error) {
          setLeaderboard(Array.isArray(data.entries) ? data.entries : [])
          setUserRank({ points: Number(data.currentUser?.points) || 0, rank: Number(data.currentUser?.rank) || 0 })
        }
      })
      .catch(() => {})
  }, [])

  const stats = useMemo(() => {
    const total = HUNDRED_DAYS.length
    const allDays = Array.from({ length: 100 }, (_, i) => i + 1)
    const done = completed.size
    const streak = (() => {
      let s = 0
      for (let d = 1; d <= 100; d++) {
        if (completed.has(d)) s++
        else break
      }
      return s
    })()
    
    // Counts come from this sprint's own problem list and the problems the server saw solved.
    const t = difficultyTotals(solvedProblems, HUNDRED_DAYS)
    const easyTotal = t.easy.total; const mediumTotal = t.medium.total; const hardTotal = t.hard.total
    const totalQ = t.all.total
    const easySolved = t.easy.solved
    const mediumSolved = t.medium.solved
    const hardSolved = t.hard.solved
    const totalSolved = t.all.solved

    return { 
      total, done, streak, pct: Math.round((done / 100) * 100), 
      totalProblems: HUNDRED_DAYS.reduce((s, d) => s + d.problems.length, 0),
      easyTotal, mediumTotal, hardTotal, totalQ,
      easySolved, mediumSolved, hardSolved, totalSolved
    }
  }, [completed, solvedProblems])

  const toggleDay = (day: number) => {
    setExpandedDays(prev => {
      const next = new Set(prev)
      if (next.has(day)) next.delete(day)
      else next.add(day)
      return next
    })
  }

  // First-visit guided tour (same pattern as the other dashboard pages).
  useEffect(() => {
    if (gate.ready) {
      const hundredDaysTour: TourStep[] = [
        {
          target: '[data-tour="100-days-header"]',
          title: tr('practice.sprintOverview'),
          description: tr('practice.your100DayCodingJourneyLives42c'),
          position: 'bottom',
        },
        {
          target: '[data-tour="100-days-progress"]',
          title: tr('practice.resumeYourJourney'),
          description: tr('practice.checkYourProgressJarAndJump73b'),
          position: 'top',
        },
        {
          target: '[data-tour="100-days-list"]',
          title: tr('practice.workTheDays'),
          description: tr('practice.expandAnyUnlockedDayToSolve37c'),
          position: 'top',
        },
      ]
      autoPlayPageTour('100-days', hundredDaysTour)}
  }, [gate.ready, startTour, setTourSeen])

  if (!gate.ready) return null

  return (
    <div className="space-y-6 w-full pb-12">
      <div data-tour="100-days-header">
        <div className="relative isolate">
          <SoftGlow className="-inset-x-2 -top-4 rounded-3xl" />
          <PageHeader
            illustration="launch"
            title={tr('practice.n100DayCodingSprint')}
            description={tr('practice.oneThemeADayAFew52d')}
            icon={<Flame />}
            className="mb-0"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        
        {/* Left Column (Main Content) */}
        <div className="space-y-6">
          
          {/* Top Stats Cards Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             {/* Progress Card */}
             <Card className="rounded-3xl p-5 border-border/70 flex flex-col md:flex-row gap-6 items-center md:items-start justify-between">
                <div>
                   <h2 className="text-base font-semibold text-foreground mb-4">{tr('practice.progress')}</h2>
                   
                   {/* Radial Progress (SVG) */}
                   <div className="relative w-32 h-32 flex items-center justify-center">
                     <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                        {/* Background track */}
                        <circle cx="50" cy="50" r="40" fill="transparent" stroke="currentColor" strokeWidth="8" className="text-muted/50" />
                        {/* Progress track */}
                        <circle cx="50" cy="50" r="40" fill="transparent" stroke="currentColor" strokeWidth="8" strokeDasharray={`${stats.totalQ ? (stats.totalSolved / stats.totalQ) * 251.2 : 0} 251.2`} className="text-primary" strokeLinecap="round" />
                     </svg>
                     <div className="absolute flex flex-col items-center justify-center">
                       <span className="text-2xl font-bold tabular-nums text-foreground">{stats.totalSolved}<span className="text-sm font-medium text-muted-foreground">/{stats.totalQ}</span></span>
                       <span className="text-[11px] text-muted-foreground font-medium">{tr('practice.solved')}</span>
                     </div>
                   </div>
                </div>

                <div className="flex-1 w-full space-y-4 pt-2">
                   <div>
                     <div className="flex justify-between text-xs font-semibold mb-1.5">
                       <span className="text-green-700 dark:text-green-400">{tr('practice.easy')}</span>
                       <span className="text-muted-foreground tabular-nums">{stats.easySolved}/{stats.easyTotal}</span>
                     </div>
                     <div className="w-full bg-muted/40 rounded-full h-1.5">
                       <div className="h-full bg-green-500 rounded-full" style={{ width: `${stats.easyTotal ? (stats.easySolved / stats.easyTotal) * 100 : 0}%` }} />
                     </div>
                   </div>
                   <div>
                     <div className="flex justify-between text-xs font-semibold mb-1.5">
                       <span className="text-orange-700 dark:text-orange-400">{tr('practice.medium')}</span>
                       <span className="text-muted-foreground tabular-nums">{stats.mediumSolved}/{stats.mediumTotal}</span>
                     </div>
                     <div className="w-full bg-muted/40 rounded-full h-1.5">
                       <div className="h-full bg-orange-400 rounded-full" style={{ width: `${stats.mediumTotal ? (stats.mediumSolved / stats.mediumTotal) * 100 : 0}%` }} />
                     </div>
                   </div>
                   <div>
                     <div className="flex justify-between text-xs font-semibold mb-1.5">
                       <span className="text-red-700 dark:text-red-400">{tr('practice.hard')}</span>
                       <span className="text-muted-foreground tabular-nums">{stats.hardSolved}/{stats.hardTotal}</span>
                     </div>
                     <div className="w-full bg-muted/40 rounded-full h-1.5">
                       <div className="h-full bg-red-500 rounded-full" style={{ width: `${stats.hardTotal ? (stats.hardSolved / stats.hardTotal) * 100 : 0}%` }} />
                     </div>
                   </div>
                </div>
             </Card>

             {/* Heatmap Card */}
             <Card className="rounded-3xl p-5 border-border/70 flex flex-col">
               <div className="flex items-center justify-between mb-4">
                 <h2 className="text-base font-semibold text-foreground">{tr('practice.recentActivity')}</h2>
               </div>

               <div className="flex-1 overflow-x-auto min-h-25 mb-2 -mx-2 px-2 custom-scrollbar">
                  {heatmapData ? (
                     <ContributionGraph
                        cells={heatmapData.cells}
                        dayLabels={heatmapData.dayLabels}
                        monthLabels={heatmapData.monthLabels}
                        tooltipData={heatmapData.tooltipData}
                        totalContributions={0}
                        totalActiveDays={0}
                        compactEmpty
                     />
                   ) : (
                      <SkeletonCard />
                   )}
               </div>

               <div className="flex justify-between items-center gap-3 pt-3 border-t border-border/40 mt-auto text-xs text-muted-foreground">
                 <div>{tr('practice.currentStreak')}{' '}<span className="font-semibold tabular-nums text-foreground">{stats.streak} {stats.streak === 1 ? tr('practice.day2') : tr('practice.days')}</span></div>
               </div>
             </Card>
          </div>

          {/* Current Progress Jar */}
          <div className="relative overflow-hidden rounded-3xl bg-linear-to-br from-[#2f5be7] via-[#2448c9] to-[#17224d] p-6 text-white shadow-[0_18px_40px_-20px_rgba(47,91,231,0.55)]" data-tour="100-days-progress">
             <div aria-hidden className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-blue-300/25 blur-3xl" />
             <div className="relative flex flex-col sm:flex-row items-center gap-6">
                <div className="flex-1">
                   <p className="text-sm font-medium text-white/80 mb-1">{tr('practice.currentProgress')}</p>
                   <h2 className="text-xl font-bold tabular-nums mb-2">{tr('practice.dayDoneOf100Complete', { done: stats.done })}</h2>
                   <p className="text-sm text-white/80 max-w-sm">{tr('practice.aLittleEveryDayPickUp7e8')}</p>
                    <Button className="mt-4 gap-2 rounded-full bg-white font-semibold text-[#2448c9] hover:bg-white/90"
                      onClick={() => {
                        const firstIncomplete = HUNDRED_DAYS.find(d => !completed.has(d.day))?.day
                        if (firstIncomplete) {
                          document.getElementById(`day-${firstIncomplete}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                          setExpandedDays(prev => new Set([...prev, firstIncomplete]))
                        }
                      }}>{tr('practice.resume')}{' '}<ArrowRight className="h-4 w-4" />
                    </Button>
                </div>
                {/* Visual Jar Illustration */}
                <div className="w-32 h-40 relative">
                   {/* Simplified CSS Jar representation */}
                   <div aria-hidden className="absolute bottom-0 w-full h-32 bg-white/10 border-4 border-white/40 rounded-b-3xl rounded-t-xl overflow-hidden backdrop-blur-sm">
                      {/* Jar Lid */}
                      <div className="absolute top-0 left-[-4px] w-[calc(100%+8px)] h-6 bg-white/70 border-b-4 border-white/40 z-10 rounded-t-xl" />
                      {/* Contents inside jar (simulated tokens) */}
                      <div className="absolute bottom-0 w-full bg-white/15 flex flex-wrap-reverse gap-1 p-2 content-end" style={{ height: `${Math.max(15, stats.pct)}%` }}>
                         {Array.from({length: Math.min(stats.done * 3, 20)}).map((_, i) => (
                           <div key={i} className="h-2 w-4 rounded-full bg-white/80 border border-white/40" />
                         ))}
                      </div>
                   </div>
                </div>
             </div>
          </div>

          {/* Days Accordion List */}
          <div className="space-y-3" data-tour="100-days-list">
            {HUNDRED_DAYS.map((d, index) => {
              const isCompleted = completed.has(d.day)
              const isExpanded = expandedDays.has(d.day)
              const isAvailable = index <= stats.done; // Unlocks sequentially

              if (filter === 'completed' && !isCompleted) return null;
              if (filter === 'locked' && isAvailable) return null;
              if (filter === 'available' && (!isAvailable || isCompleted)) return null;

              return (
                <Card key={d.day} id={`day-${d.day}`} className={`overflow-hidden rounded-2xl border-border/70 transition-colors ${!isAvailable ? 'opacity-60' : ''}`}>
                  <div 
                    role="button"
                    tabIndex={isAvailable ? 0 : -1}
                    aria-expanded={isAvailable ? isExpanded : undefined}
                    aria-disabled={!isAvailable}
                    className={`p-4 flex items-center justify-between focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary ${isAvailable ? 'cursor-pointer hover:bg-muted/40' : 'cursor-not-allowed'}`}
                    onClick={() => { if(isAvailable) toggleDay(d.day) }}
                    onKeyDown={(e) => { if (isAvailable && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggleDay(d.day) } }}
                  >
                     <div>
                       <h3 className="text-base font-semibold text-foreground">{tr('practice.dayDay2', { day: d.day })}</h3>
                       <p className="text-xs text-muted-foreground mt-0.5">{d.theme}</p>
                     </div>
                     <div className="flex items-center gap-3">
                        {isAvailable ? (
                           <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                             {isExpanded ? <ChevronUp className="h-4 w-4 text-primary" /> : <ChevronDown className="h-4 w-4 text-primary" />}
                           </div>
                        ) : (
                           <Lock className="h-4 w-4 text-muted-foreground" aria-label={tr('practice.locked')} />
                        )}
                     </div>
                  </div>

                  {isExpanded && isAvailable && (
                    <div className="border-t border-border/40 bg-muted/5">
                      <div className="grid grid-cols-12 text-xs font-semibold text-muted-foreground p-3 border-b border-border/40">
                         <div className="col-span-7">{tr('practice.problem')}</div>
                         <div className="col-span-2 text-center">{tr('practice.difficulty')}</div>
                         <div className="col-span-3 text-right"><span className="sr-only">{tr('practice.action')}</span></div>
                      </div>
                      
                      <div className="divide-y divide-border/40">
                        {d.problems.map((prob, pi) => {
                          const probDone = isCompleted || solvedProblems.has(prob.id)
                          return (
                            <div key={pi} className="grid grid-cols-12 items-center p-3 text-sm hover:bg-muted/30 transition-colors group">
                               <div className="col-span-7 flex items-center gap-3 min-w-0">
                                  <Bookmark className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" aria-hidden />
                                   <span className="font-medium text-foreground truncate" title={prob.title}>{prob.title}</span>
                               </div>
                               <div className="col-span-2 text-center">
                                  <span className={`font-medium text-xs capitalize ${prob.difficulty === 'hard' ? 'text-red-700 dark:text-red-400' : prob.difficulty === 'medium' ? 'text-orange-700 dark:text-orange-400' : 'text-green-700 dark:text-green-400'}`}>{prob.difficulty || tr('practice.easy2')}</span>
                               </div>
                               <div className="col-span-3 text-right">
                                   {probDone ? (
                                      <span className="inline-flex items-center gap-1.5 text-green-700 dark:text-green-400 text-xs font-semibold">
                                        <CheckCircle2 className="h-3.5 w-3.5" />{' '}{tr('practice.solved')}</span>
                                    ) : (
                                      <Button size="sm" variant="outline" className="h-7 text-xs rounded-full"
                                        asChild>
                                        <Link href={`/dashboard/problems/${prob.id}`}>{tr('practice.solve')}</Link>
                                      </Button>
                                    )}
                               </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </Card>
              )
            })}
          </div>

        </div>

        {/* Right Column (Sidebar) */}
        <div className="space-y-6">
           
           {/* Leaderboard Card */}
           <Card className="rounded-3xl p-5 border-border/70">
             <h2 className="text-base font-semibold text-foreground mb-4">{tr('practice.leaderboard')}</h2>
             
             <div className="flex justify-between items-end gap-2 mb-6 h-36 px-4">
                {/* Rank 2 */}
                {leaderboard[1] && (
                <div className="flex flex-col items-center gap-2 relative w-1/3">
                   <UserAvatar seed={leaderboard[1].name} name={leaderboard[1].name} className="h-10 w-10 bg-muted" />
                   <div className="text-center w-full">
                     <div className="text-[11px] font-semibold truncate px-1">{leaderboard[1].name}</div>
                     <div className="text-[9px] text-muted-foreground whitespace-nowrap">{tr('practice.nPts', { n: Number(leaderboard[1].xp || 0) })}</div>
                   </div>
                   <div className="w-full h-16 bg-primary/10 rounded-t-lg flex items-center justify-center border-t-4 border-primary/40">
                      <span className="text-2xl font-black text-primary/70">2</span>
                   </div>
                </div>
                )}

                {/* Rank 1 */}
                {leaderboard[0] && (
                <div className="flex flex-col items-center gap-2 relative w-1/3">
                   <div className="absolute -top-3 text-amber-500"><Trophy className="h-5 w-5 fill-amber-500" /></div>
                   <UserAvatar seed={leaderboard[0].name} name={leaderboard[0].name} className="h-12 w-12 bg-amber-100 dark:bg-amber-900/40 ring-2 ring-amber-400" />
                   <div className="text-center w-full">
                     <div className="text-[11px] font-semibold truncate px-1 text-amber-700 dark:text-amber-400">{leaderboard[0].name}</div>
                     <div className="text-[9px] font-bold text-amber-600/70 dark:text-amber-400/70 whitespace-nowrap">{tr('practice.nPts', { n: Number(leaderboard[0].xp || 0) })}</div>
                   </div>
                   <div className="w-full h-20 bg-amber-100 dark:bg-amber-900/40 rounded-t-lg flex items-start pt-2 justify-center border-t-4 border-amber-400 shadow-inner">
                      <span className="text-3xl font-black text-amber-600 dark:text-amber-400">1</span>
                   </div>
                </div>
                )}

                {/* Rank 3 */}
                {leaderboard[2] && (
                <div className="flex flex-col items-center gap-2 relative w-1/3">
                   <UserAvatar seed={leaderboard[2].name} name={leaderboard[2].name} className="h-10 w-10 bg-muted" />
                   <div className="text-center w-full">
                     <div className="text-[11px] font-semibold truncate px-1">{leaderboard[2].name}</div>
                     <div className="text-[9px] text-muted-foreground whitespace-nowrap">{tr('practice.nPts', { n: Number(leaderboard[2].xp || 0) })}</div>
                   </div>
                   <div className="w-full h-12 bg-orange-100 dark:bg-orange-900/40 rounded-t-lg flex items-center justify-center border-t-4 border-orange-300">
                      <span className="text-2xl font-black text-orange-500 dark:text-orange-300">3</span>
                   </div>
                </div>
                )}
             </div>

             <div className="rounded-xl border border-border bg-muted/30 p-3 flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                   <UserAvatar seed="You" name="You" className="h-8 w-8 bg-muted" />
                   <div>
                     <div className="font-bold text-sm">{tr('practice.you')}</div>
                     <div className="text-[10px] text-muted-foreground">{tr('practice.nPts', { n: userRank.points })}</div>
                   </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-sm tabular-nums text-foreground">{userRank.rank || '-'}</div>
                  <div className="text-[10px] text-muted-foreground">{tr('practice.rank')}</div>
                </div>
             </div>

              <Button variant="outline" className="w-full rounded-full text-xs font-semibold" asChild>
                <Link href="/dashboard/leaderboard">{tr('practice.viewLeaderboard')}</Link>
              </Button>
           </Card>

           {/* Badges Card */}
           <Card className="rounded-3xl p-5 border-border/70">
             <h2 className="text-base font-semibold text-foreground mb-1">{tr('practice.badges')}</h2>
             <p className="text-xs text-muted-foreground mb-4">{tr('practice.unlockABadgeAtEachPoints529')}</p>
             
             <div className="flex justify-between items-center gap-1.5 mb-2 mt-4 px-1">
                {[100, 500, 1000, 5000, 10000].map((num, i) => {
                  const unlocked = userRank.points >= num;
                  return (
                    <div key={i} className="flex flex-col items-center group relative">
                      <div className="relative w-12 h-12 flex items-center justify-center transition-transform duration-300 hover:scale-110 motion-reduce:hover:scale-100" title={tr('practice.numPointsValue', { num, value: unlocked ? tr('practice.unlockedSuffix') : '' })}>
                        {/* 3D Hexagon effect */}
                        <div className={`absolute inset-0 rounded-xl rotate-45 border shadow-lg ${unlocked ? 'border-amber-400 bg-amber-200/20 shadow-amber-500/30 dark:shadow-amber-900/30' : 'border-muted bg-muted/20 shadow-none grayscale opacity-50'} `}></div>
                        <div className={`absolute inset-1 rounded-xl rotate-45 border border-white/20 bg-linear-to-br ${unlocked ? 'from-amber-300 to-amber-600' : 'from-muted to-muted-foreground/30'} backdrop-blur-sm z-0`}></div>
                        
                        <div className="z-10 relative flex flex-col items-center justify-center">
                          {unlocked && <CheckCircle2 className="h-3 w-3 text-white drop-shadow mb-0.5" />}
                          <span className={`text-[9px] font-black ${unlocked ? 'text-white' : 'text-muted-foreground'} drop-shadow-md leading-none`}>{num}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
             </div>
           </Card>

           {/* Promotion Card */}
           <Card className="rounded-3xl p-5 border-primary/20 bg-linear-to-br from-primary/10 to-card relative overflow-hidden">
              <div className="relative z-10">
                <h2 className="text-base font-semibold text-foreground mb-2">{tr('practice.courses')}</h2>
                <p className="text-xs text-muted-foreground mb-4 max-w-[160px]">{tr('practice.learnTheTopicsBehindCommonInterview87d')}</p>
                <Button size="sm" className="rounded-full w-full" asChild>
                  <Link href="/dashboard/courses">{tr('practice.startNow')}{' '}<ArrowRight className="h-3 w-3 ml-2" /></Link>
                </Button>
              </div>
              <div aria-hidden className="absolute right-[-20px] top-1/2 -translate-y-1/2 opacity-80 pointer-events-none">
                 <div className="w-24 h-24 bg-card rounded-lg shadow-lg border border-border p-2 transform rotate-12">
                   <div className="h-2 bg-muted rounded w-full mb-2" />
                   <div className="h-1 bg-primary/70 rounded w-3/4 mb-1" />
                   <div className="h-1 bg-primary/40 rounded w-1/2 mb-1" />
                   <div className="h-1 bg-primary/25 rounded w-5/6 mb-1" />
                 </div>
              </div>
           </Card>

        </div>
      </div>
    </div>
  )
}
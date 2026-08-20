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
import { usePageGuard } from '@/lib/use-page-guard'
import { ContributionGraph } from '@/components/dashboard/contribution-graph'

function getCompleted(): Set<number> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem('100-days-completed')
    return new Set(raw ? JSON.parse(raw) as number[] : [])
  } catch { return new Set() }
}

export default function HundredDaysPage() {
  const gate = usePageGuard('user')

  const [completed, setCompleted] = useState<Set<number>>(getCompleted)
  const [filter, setFilter] = useState<'all' | 'available' | 'completed' | 'locked'>('all')
  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set([1]))

  const [heatmapData, setHeatmapData] = useState<any>(null)
  const [leaderboard, setLeaderboard] = useState<any[]>([])
  const [userRank, setUserRank] = useState<{points: number, rank: number}>({points: 0, rank: 0})
  
  useEffect(() => {
    fetch('/api/user/heatmap?weeks=12')
      .then(r => r.json())
      .then(data => {
        if (data && !data.error && data.cells) {
           setHeatmapData(data)
        }
      })
      .catch(() => {})

    fetch('/api/leaderboard')
      .then(r => r.json())
      .then(data => {
        if (data && !data.error) {
          setLeaderboard(data.leaderboard || [])
          setUserRank(data.currentUser || {points: 0, rank: 0})
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
    
    // Simulate Easy/Medium/Hard breakdown based on completion
    const easyTotal = 338; const mediumTotal = 572; const hardTotal = 271;
    const totalQ = easyTotal + mediumTotal + hardTotal
    
    // Mock solved
    const easySolved = Math.floor(done * 2.5);
    const mediumSolved = Math.floor(done * 1.5);
    const hardSolved = Math.floor(done * 0.5);
    const totalSolved = easySolved + mediumSolved + hardSolved

    return { 
      total, done, streak, pct: Math.round((done / 100) * 100), 
      totalProblems: HUNDRED_DAYS.reduce((s, d) => s + d.problems.length, 0),
      easyTotal, mediumTotal, hardTotal, totalQ,
      easySolved, mediumSolved, hardSolved, totalSolved
    }
  }, [completed])

  const toggleDay = (day: number) => {
    setExpandedDays(prev => {
      const next = new Set(prev)
      if (next.has(day)) next.delete(day)
      else next.add(day)
      return next
    })
  }

  if (!gate.ready) return null

  return (
    <div className="space-y-6 w-full pb-12">
      <div className="flex items-center justify-between">
         <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
           100-Day Coding Sprint
         </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        
        {/* Left Column (Main Content) */}
        <div className="space-y-6">
          
          {/* Top Stats Cards Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             {/* Progress Card */}
             <Card className="p-5 border-border/60 shadow-sm flex flex-col md:flex-row gap-6 items-center md:items-start justify-between">
                <div>
                   <h3 className="font-bold text-foreground mb-4">Progress</h3>
                   
                   {/* Radial Progress (SVG) */}
                   <div className="relative w-32 h-32 flex items-center justify-center">
                     <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                        {/* Background track */}
                        <circle cx="50" cy="50" r="40" fill="transparent" stroke="currentColor" strokeWidth="8" className="text-muted/50" />
                        {/* Progress track */}
                        <circle cx="50" cy="50" r="40" fill="transparent" stroke="currentColor" strokeWidth="8" strokeDasharray={`${(stats.totalSolved / stats.totalQ) * 251.2} 251.2`} className="text-blue-500" strokeLinecap="round" />
                     </svg>
                     <div className="absolute flex flex-col items-center justify-center">
                       <span className="text-2xl font-bold text-foreground">{stats.totalSolved}<span className="text-sm font-medium text-muted-foreground">/{stats.totalQ}</span></span>
                       <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Question solved</span>
                     </div>
                   </div>
                </div>

                <div className="flex-1 w-full space-y-4 pt-2">
                   <div>
                     <div className="flex justify-between text-xs font-semibold mb-1.5">
                       <span className="text-green-500">Easy</span>
                       <span className="text-muted-foreground">{stats.easySolved}/{stats.easyTotal}</span>
                     </div>
                     <div className="w-full bg-muted/40 rounded-full h-1.5">
                       <div className="h-full bg-green-500 rounded-full" style={{ width: `${(stats.easySolved / stats.easyTotal) * 100}%` }} />
                     </div>
                   </div>
                   <div>
                     <div className="flex justify-between text-xs font-semibold mb-1.5">
                       <span className="text-orange-400">Medium</span>
                       <span className="text-muted-foreground">{stats.mediumSolved}/{stats.mediumTotal}</span>
                     </div>
                     <div className="w-full bg-muted/40 rounded-full h-1.5">
                       <div className="h-full bg-orange-400 rounded-full" style={{ width: `${(stats.mediumSolved / stats.mediumTotal) * 100}%` }} />
                     </div>
                   </div>
                   <div>
                     <div className="flex justify-between text-xs font-semibold mb-1.5">
                       <span className="text-red-500">Hard</span>
                       <span className="text-muted-foreground">{stats.hardSolved}/{stats.hardTotal}</span>
                     </div>
                     <div className="w-full bg-muted/40 rounded-full h-1.5">
                       <div className="h-full bg-red-500 rounded-full" style={{ width: `${(stats.hardSolved / stats.hardTotal) * 100}%` }} />
                     </div>
                   </div>
                </div>
             </Card>

             {/* Heatmap Card */}
             <Card className="p-5 border-border/60 shadow-sm flex flex-col">
               <div className="flex items-center justify-between mb-4">
                 <h3 className="font-bold text-foreground">Jun 2026 - Aug 2026</h3>
                 <div className="flex gap-2">
                   <Button variant="outline" size="icon" className="h-6 w-6"><ChevronDown className="h-3 w-3 rotate-90" /></Button>
                   <Button variant="outline" size="icon" className="h-6 w-6"><ChevronDown className="h-3 w-3 -rotate-90" /></Button>
                 </div>
               </div>

               <div className="flex-1 overflow-x-auto min-h-[100px] mb-2 -mx-2 px-2 custom-scrollbar">
                  {heatmapData ? (
                     <ContributionGraph
                        cells={heatmapData.cells}
                        dayLabels={heatmapData.dayLabels}
                        monthLabels={heatmapData.monthLabels}
                        tooltipData={heatmapData.tooltipData}
                        totalContributions={0}
                        totalActiveDays={0}
                     />
                  ) : (
                     <div className="flex items-center justify-center h-full">
                       <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                     </div>
                  )}
               </div>

               <div className="flex items-center justify-between text-xs text-muted-foreground font-medium pt-2 border-t border-border/40 mt-auto">
                 <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-green-500"></span> Questions</div>
                 <div className="flex items-center gap-1.5"><Target className="h-3 w-3 text-green-500" /> POTD question</div>
               </div>

               <div className="flex justify-between items-center mt-3 text-xs">
                 <div>Current Streak: <span className="font-bold text-foreground">{stats.streak} Day</span></div>
                 <div>Max Streak: <span className="font-bold text-foreground">{Math.max(stats.streak, 1)} Day</span></div>
                 <div>Global Max: <span className="font-bold text-foreground">530 Days</span></div>
               </div>
             </Card>
          </div>

          {/* Current Progress Jar */}
          <Card className="p-6 border-border/60 shadow-sm bg-gradient-to-r from-blue-50/50 to-transparent dark:from-blue-950/20">
             <div className="flex flex-col sm:flex-row items-center gap-6">
                <div className="flex-1">
                   <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Current progress</p>
                   <h2 className="text-xl font-bold text-foreground mb-2">Day {stats.done}/100 Completed</h2>
                   <p className="text-sm text-muted-foreground max-w-sm">
                     Embark on a 100-day coding journey to achieve mastery in programming!
                   </p>
                   <Button className="mt-4 gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full">
                     Resume Journey <ArrowRight className="h-4 w-4" />
                   </Button>
                </div>
                {/* Visual Jar Illustration */}
                <div className="w-32 h-40 relative">
                   {/* Simplified CSS Jar representation */}
                   <div className="absolute bottom-0 w-full h-32 bg-white/10 dark:bg-slate-800/50 border-4 border-slate-300 dark:border-slate-700 rounded-b-3xl rounded-t-xl overflow-hidden backdrop-blur-sm">
                      {/* Jar Lid */}
                      <div className="absolute top-0 left-[-4px] w-[calc(100%+8px)] h-6 bg-[#d4a373] border-b-4 border-[#b5835a] z-10 rounded-t-xl" />
                      {/* Contents inside jar (simulated tokens) */}
                      <div className="absolute bottom-0 w-full bg-blue-500/20 flex flex-wrap-reverse gap-1 p-2 content-end" style={{ height: `${Math.max(15, stats.pct)}%` }}>
                         {Array.from({length: Math.min(stats.done * 3, 20)}).map((_, i) => (
                           <div key={i} className="h-2 w-4 rounded-full bg-blue-500/60 border border-blue-600/40" />
                         ))}
                      </div>
                   </div>
                </div>
             </div>
          </Card>

          {/* Days Accordion List */}
          <div className="space-y-3">
            {HUNDRED_DAYS.map((d, index) => {
              const isCompleted = completed.has(d.day)
              const isExpanded = expandedDays.has(d.day)
              const isAvailable = index <= stats.done; // Unlocks sequentially

              if (filter === 'completed' && !isCompleted) return null;
              if (filter === 'locked' && isAvailable) return null;
              if (filter === 'available' && (!isAvailable || isCompleted)) return null;

              return (
                <Card key={d.day} className={`overflow-hidden border-border/60 transition-all ${!isAvailable ? 'opacity-60 grayscale' : ''}`}>
                  <div 
                    className="p-4 flex items-center justify-between cursor-pointer hover:bg-muted/20"
                    onClick={() => { if(isAvailable) toggleDay(d.day) }}
                  >
                     <div>
                       <h4 className="font-bold text-foreground">Day {d.day}</h4>
                       <p className="text-xs text-muted-foreground mt-0.5">{d.theme}</p>
                     </div>
                     <div className="flex items-center gap-3">
                        {isAvailable ? (
                           <div className="h-8 w-8 rounded-full bg-blue-50 dark:bg-blue-950 flex items-center justify-center">
                             {isExpanded ? <ChevronUp className="h-4 w-4 text-blue-600" /> : <ChevronDown className="h-4 w-4 text-blue-600" />}
                           </div>
                        ) : (
                           <Lock className="h-4 w-4 text-muted-foreground" />
                        )}
                     </div>
                  </div>

                  {isExpanded && isAvailable && (
                    <div className="border-t border-border/40 bg-muted/5">
                      <div className="grid grid-cols-12 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground p-3 border-b border-border/40">
                         <div className="col-span-6">Problem Title</div>
                         <div className="col-span-2 text-center">Difficulty</div>
                         <div className="col-span-2 text-center">Points</div>
                         <div className="col-span-2 text-right">Action</div>
                      </div>
                      
                      <div className="divide-y divide-border/40">
                        {d.problems.map((prob, pi) => {
                          const probDone = isCompleted || pi === 0; // Mock some progress
                          return (
                            <div key={pi} className="grid grid-cols-12 items-center p-3 text-sm hover:bg-muted/30 transition-colors group">
                               <div className="col-span-6 flex items-center gap-3">
                                  <Bookmark className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                                  <span className="font-medium text-foreground">{prob.title}</span>
                               </div>
                               <div className="col-span-2 text-center">
                                  <span className="text-green-500 font-medium text-xs">Easy</span>
                               </div>
                               <div className="col-span-2 text-center font-mono text-xs font-semibold text-muted-foreground">
                                  {probDone ? '100/100' : '0/100'}
                               </div>
                               <div className="col-span-2 text-right">
                                  {probDone ? (
                                     <span className="inline-flex items-center gap-1.5 text-green-500 text-xs font-semibold">
                                       <CheckCircle2 className="h-3.5 w-3.5" /> Solved
                                     </span>
                                  ) : (
                                     <Button size="sm" variant="outline" className="h-7 text-xs rounded-full">
                                       Solve
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
           <Card className="p-5 border-border/60 shadow-sm">
             <h3 className="font-bold text-foreground mb-4">Leaderboard</h3>
             
             <div className="flex justify-between items-end gap-2 mb-6 h-36 px-4">
                {/* Rank 2 */}
                {leaderboard[1] && (
                <div className="flex flex-col items-center gap-2 relative w-1/3">
                   <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${leaderboard[1].name}`} className="h-10 w-10 rounded-full bg-slate-100" />
                   <div className="text-center w-full">
                     <div className="text-[10px] font-bold uppercase truncate px-1">{leaderboard[1].name}</div>
                     <div className="text-[9px] text-muted-foreground whitespace-nowrap">{leaderboard[1].points.toLocaleString()} Pts</div>
                   </div>
                   <div className="w-full h-16 bg-blue-100 dark:bg-blue-900/40 rounded-t-lg flex items-center justify-center border-t-4 border-blue-300">
                      <span className="text-2xl font-black text-blue-300">2</span>
                   </div>
                </div>
                )}

                {/* Rank 1 */}
                {leaderboard[0] && (
                <div className="flex flex-col items-center gap-2 relative w-1/3">
                   <div className="absolute -top-3 text-amber-500"><Trophy className="h-5 w-5 fill-amber-500" /></div>
                   <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${leaderboard[0].name}`} className="h-12 w-12 rounded-full bg-amber-100 ring-2 ring-amber-400" />
                   <div className="text-center w-full">
                     <div className="text-[10px] font-bold uppercase truncate px-1 text-amber-600 dark:text-amber-400">{leaderboard[0].name}</div>
                     <div className="text-[9px] font-bold text-amber-600/70 dark:text-amber-400/70 whitespace-nowrap">{leaderboard[0].points.toLocaleString()} Pts</div>
                   </div>
                   <div className="w-full h-20 bg-amber-100 dark:bg-amber-900/40 rounded-t-lg flex items-start pt-2 justify-center border-t-4 border-amber-400 shadow-inner">
                      <span className="text-3xl font-black text-amber-400">1</span>
                   </div>
                </div>
                )}

                {/* Rank 3 */}
                {leaderboard[2] && (
                <div className="flex flex-col items-center gap-2 relative w-1/3">
                   <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${leaderboard[2].name}`} className="h-10 w-10 rounded-full bg-slate-100" />
                   <div className="text-center w-full">
                     <div className="text-[10px] font-bold uppercase truncate px-1">{leaderboard[2].name}</div>
                     <div className="text-[9px] text-muted-foreground whitespace-nowrap">{leaderboard[2].points.toLocaleString()} Pts</div>
                   </div>
                   <div className="w-full h-12 bg-orange-100 dark:bg-orange-900/40 rounded-t-lg flex items-center justify-center border-t-4 border-orange-300">
                      <span className="text-2xl font-black text-orange-300">3</span>
                   </div>
                </div>
                )}
             </div>

             <div className="rounded-xl border border-border bg-muted/30 p-3 flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                   <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=You" className="h-8 w-8 rounded-full bg-slate-200" />
                   <div>
                     <div className="font-bold text-sm">You</div>
                     <div className="text-[10px] text-muted-foreground">{userRank.points.toLocaleString()} Pts</div>
                   </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-sm text-foreground">{userRank.rank || '-'}</div>
                  <div className="text-[10px] text-muted-foreground">Rank</div>
                </div>
             </div>

             <Button variant="outline" className="w-full rounded-full text-xs font-semibold">
                View Leaderboard
             </Button>
           </Card>

           {/* Badges Card */}
           <Card className="p-5 border-border/60 shadow-sm">
             <h3 className="font-bold text-foreground mb-1">Badges</h3>
             <p className="text-xs text-muted-foreground mb-4">Congratulations on earning all the badges!</p>
             
             <div className="flex justify-between items-center gap-1.5 mb-2 mt-4 px-1">
                {[100, 500, 1000, 5000, 10000].map((num, i) => {
                  const unlocked = userRank.points >= num;
                  return (
                    <div key={i} className="flex flex-col items-center group relative">
                      <div className={`relative w-12 h-12 flex items-center justify-center transform transition-all duration-300 hover:scale-110 cursor-pointer`}>
                        {/* 3D Hexagon effect */}
                        <div className={`absolute inset-0 rounded-xl rotate-45 border shadow-lg ${unlocked ? 'border-amber-400 bg-amber-200/20 shadow-amber-500/30 dark:shadow-amber-900/30' : 'border-muted bg-muted/20 shadow-none grayscale opacity-50'} `}></div>
                        <div className={`absolute inset-1 rounded-xl rotate-45 border border-white/20 bg-gradient-to-br ${unlocked ? 'from-amber-300 to-amber-600' : 'from-slate-200 to-slate-400 dark:from-slate-700 dark:to-slate-800'} backdrop-blur-sm z-0`}></div>
                        
                        <div className="z-10 relative flex flex-col items-center justify-center">
                          {unlocked && <CheckCircle2 className="h-3 w-3 text-white drop-shadow mb-0.5" />}
                          <span className={`text-[9px] font-black ${unlocked ? 'text-white' : 'text-slate-500 dark:text-slate-400'} drop-shadow-md leading-none`}>{num}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
             </div>
           </Card>

           {/* Promotion Card */}
           <Card className="p-5 border-amber-200 bg-amber-50 dark:bg-amber-950/20 shadow-sm relative overflow-hidden">
              <div className="relative z-10">
                <h3 className="font-bold text-amber-900 dark:text-amber-100 mb-2">Code Conquest</h3>
                <p className="text-xs text-amber-700/80 dark:text-amber-200/80 mb-4 max-w-[160px]">
                  Master Top Tech Interview Qs and get hired!
                </p>
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white rounded-full w-full">
                  Start now <ArrowRight className="h-3 w-3 ml-2" />
                </Button>
              </div>
              <div className="absolute right-[-20px] top-1/2 -translate-y-1/2 opacity-80 pointer-events-none">
                 <div className="w-24 h-24 bg-white dark:bg-slate-900 rounded-lg shadow-lg border border-slate-200 dark:border-slate-800 p-2 transform rotate-12">
                   <div className="h-2 bg-slate-200 rounded w-full mb-2" />
                   <div className="h-1 bg-amber-400 rounded w-3/4 mb-1" />
                   <div className="h-1 bg-blue-400 rounded w-1/2 mb-1" />
                   <div className="h-1 bg-green-400 rounded w-5/6 mb-1" />
                 </div>
              </div>
           </Card>

        </div>
      </div>
    </div>
  )
}
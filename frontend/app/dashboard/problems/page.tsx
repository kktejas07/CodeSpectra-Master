'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Search, ChevronDown, ChevronUp, CheckCircle2, Bookmark, Flame, Target, Trophy, ArrowRight, Loader2, Play
} from 'lucide-react'
import { DIFFICULTY_LEVELS, DIFFICULTY_LABELS, DIFFICULTY_COLORS, toDifficultyLevel } from '@/lib/difficulty-levels'
import { Button } from '@/components/ui/button'
import { UserAvatar } from '@/components/ui/user-avatar'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { usePageGuard } from '@/lib/use-page-guard'
import { useProblemsViewModel, type ProblemSummary } from './use-problems-viewmodel'
import { ContributionGraph } from '@/components/dashboard/contribution-graph'
import { useTour, autoPlayPageTour, type TourStep } from '@/components/tour/tour-context'

function FilterAccordion({ title, items, selected, onToggle }: { title: string, items: {id: string, label: string}[], selected: string[], onToggle: (id: string) => void }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="border-b border-border/60 py-3">
      <button onClick={() => setOpen(!open)} className="flex items-center justify-between w-full text-left font-semibold text-sm">
        {title}
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="mt-3 flex flex-col gap-2">
          {items.map(item => (
            <label key={item.id} className="flex items-center gap-2 cursor-pointer group">
              <div className={`w-4 h-4 rounded-sm border flex items-center justify-center transition-colors ${selected.includes(item.id) ? 'bg-primary border-primary text-primary-foreground' : 'border-input group-hover:border-primary/50'}`}>
                {selected.includes(item.id) && <CheckCircle2 className="h-3 w-3" />}
              </div>
              <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">{item.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ProblemsListPage() {
  const gate = usePageGuard('user')
  const { loading, error, q, setQ, difficulty, setDifficulty, filtered } = useProblemsViewModel()
  const router = useRouter()
  const { startTour, setTourSeen } = useTour()

  const [heatmapData, setHeatmapData] = useState<any>(null)
  useEffect(() => {
    fetch('/api/user/heatmap?weeks=12').then(r => r.json()).then(data => {
      if (data && !data.error && data.cells) setHeatmapData(data)
    }).catch(() => {})
  }, [])

  // Initialize tour if this is the first visit to problems page
  useEffect(() => {
    if (gate.ready) {
      const problemsTour: TourStep[] = [
        {
          target: '[data-tour="problems-search"]',
          title: 'Coding Practice Library',
          description: 'Practice library for placements and interviews; type here to filter questions.',
          position: 'bottom',
        },
        {
          target: '[data-tour="problems-stats"]',
          title: 'Track Solved Progress',
          description: 'Track solved totals and Easy, Medium, Hard bars to gauge readiness.',
          position: 'bottom',
        },
        {
          target: '[data-tour="problems-table"]',
          title: 'Start Solving Problems',
          description: 'Tip: click Solve on any row to open its coding workspace.',
          position: 'bottom',
        },
      ]
      autoPlayPageTour('problems', problemsTour)}
  }, [gate.ready, startTour, setTourSeen])

  // Compute real stats from problems data
  const stats = useMemo(() => {
    const total = filtered.length
    const easyTotal = filtered.filter((p: any) => p.difficulty === 'easy').length
    const mediumTotal = filtered.filter((p: any) => p.difficulty === 'medium').length
    const hardTotal = filtered.filter((p: any) => p.difficulty === 'hard').length
    return {
      total,
      done: 0, // Will be computed from submissions
      easyTotal,
      easySolved: 0,
      mediumTotal,
      mediumSolved: 0,
      hardTotal,
      hardSolved: 0,
      streak: 0,
      maxStreak: 1
    }
  }, [filtered])

  // Skeleton components for loading state
  const StatsSkeleton = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card className="p-5 border-border/60 shadow-sm flex flex-col md:flex-row gap-6 items-center animate-pulse">
        <div className="flex flex-col items-center flex-1 w-full relative h-32 justify-center">
          <div className="w-28 h-28 rounded-full bg-muted/60" />
        </div>
        <div className="flex-1 w-full space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i}>
              <div className="flex justify-between text-xs font-semibold mb-1.5">
                <span className="h-3 w-8 bg-muted/60 rounded" />
                <span className="h-3 w-8 bg-muted/60 rounded" />
              </div>
              <div className="w-full bg-muted/50 rounded-full h-1.5" />
            </div>
          ))}
        </div>
      </Card>
      <Card className="p-5 border-border/60 shadow-sm flex flex-col animate-pulse">
        <div className="flex items-center justify-between mb-4">
          <div className="h-4 w-32 bg-muted/60 rounded" />
          <div className="flex gap-1">
            <div className="h-6 w-6 rounded-full bg-muted/60" />
            <div className="h-6 w-6 rounded-full bg-muted/60" />
          </div>
        </div>
        <div className="flex-1 overflow-x-auto min-h-25 mb-2">
          <div className="flex items-center justify-center h-full">
            <div className="h-5 w-5 rounded-full bg-muted/40 animate-pulse" />
          </div>
        </div>
        <div className="flex items-center justify-between text-[10px] text-muted-foreground font-semibold pt-3 border-t border-border/40 mt-auto">
          <div className="h-3 w-16 bg-muted/60 rounded" />
          <div className="h-3 w-20 bg-muted/60 rounded" />
        </div>
        <div className="flex justify-between items-center mt-2 text-[10px]">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-3 w-16 bg-muted/60 rounded" />
          ))}
        </div>
      </Card>
    </div>
  )

  const TableSkeleton = () => (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden animate-pulse">
      <div className="grid grid-cols-12 gap-4 p-4 border-b border-border/40 bg-muted/20">
        <div className="col-span-6 h-4 bg-muted/60 rounded" />
        <div className="col-span-2 h-4 bg-muted/60 rounded" />
        <div className="col-span-2 h-4 bg-muted/60 rounded" />
        <div className="col-span-1 h-4 bg-muted/60 rounded" />
        <div className="col-span-1 h-4 bg-muted/60 rounded" />
      </div>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="grid grid-cols-12 gap-4 p-4 items-center border-b border-border/40">
          <div className="col-span-6 flex gap-3 min-w-0">
            <div className="h-4 w-4 bg-muted/60 rounded mt-1" />
            <div className="min-w-0 space-y-1">
              <div className="h-4 w-32 bg-muted/60 rounded" />
              <div className="h-3 w-24 bg-muted/50 rounded" />
            </div>
          </div>
          <div className="col-span-2 flex justify-center">
            <div className="h-5 w-16 bg-muted/60 rounded" />
          </div>
          <div className="col-span-2 flex items-center justify-center gap-2">
            <div className="h-4 w-12 bg-muted/60 rounded" />
            <div className="flex items-end h-3 gap-px">
              {Array.from({ length: 7 }).map((_, j) => (
                <div key={j} className="w-[2px] h-full bg-muted/50" />
              ))}
            </div>
          </div>
          <div className="col-span-1 flex justify-center">
            <div className="h-4 w-8 bg-muted/60 rounded" />
          </div>
          <div className="col-span-1 flex justify-center">
            <div className="h-8 w-16 bg-muted/60 rounded" />
          </div>
        </div>
      ))}
    </div>
  )

  // Filter state (mock functionality for now)
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([])
  const [selectedTopics, setSelectedTopics] = useState<string[]>([])
  
  if (!gate.ready) return null

  return (
    <div className="max-w-[1400px] mx-auto pb-12 space-y-6">
      
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search Opportunities" className="pl-9 h-10 rounded-full bg-muted/50 border-none" />
        </div>
        <Button variant="outline" className="rounded-full h-10 px-6 gap-2 text-primary font-semibold border-primary/20 bg-primary/5">
          For Business
        </Button>
      </div>

      <div className="text-center py-4">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Coding Practice for Placements & Interviews</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column (Filters) */}
        <div className="hidden lg:block lg:col-span-2 space-y-2">
           <h3 className="font-bold text-foreground mb-4">Filters</h3>
           <FilterAccordion 
             title="Companies" 
             items={[{id: 'tcs', label: 'TCS'}, {id: 'wipro', label: 'Wipro'}, {id: 'infosys', label: 'Infosys'}]}
             selected={selectedCompanies} onToggle={(id) => setSelectedCompanies(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])}
           />
           <FilterAccordion 
             title="Topics" 
             items={[{id: 'arrays', label: 'Arrays'}, {id: 'strings', label: 'Strings'}, {id: 'dp', label: 'Dynamic Programming'}]}
             selected={selectedTopics} onToggle={(id) => setSelectedTopics(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])}
           />
           <FilterAccordion
              title="Difficulty"
              items={DIFFICULTY_LEVELS.map(l => ({ id: l, label: DIFFICULTY_LABELS[l] }))}
              selected={difficulty !== 'all' ? [difficulty] : []}
              onToggle={(id) => setDifficulty(prev => prev === id ? 'all' : id)}
            />
           <FilterAccordion title="Status" items={[{id: 'solved', label: 'Solved'}, {id: 'unsolved', label: 'Unsolved'}]} selected={[]} onToggle={() => {}} />
           <FilterAccordion title="Domain" items={[{id: 'core', label: 'Core CS'}, {id: 'web', label: 'Web Dev'}]} selected={[]} onToggle={() => {}} />
        </div>

        {/* Center Column (Main Content) */}
        <div className="lg:col-span-7 space-y-6">
           
           {/* Top Stats Row */}
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             {/* Progress Card */}
             <Card className="p-5 border-border/60 shadow-sm flex flex-col md:flex-row gap-6 items-center" data-tour="problems-stats">
                <div className="flex flex-col items-center flex-1 w-full relative h-32 justify-center">
                   <svg className="w-28 h-28 transform -rotate-90" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="40" fill="transparent" stroke="currentColor" strokeWidth="8" className="text-muted/30" />
                      <circle cx="50" cy="50" r="40" fill="transparent" stroke="currentColor" strokeWidth="8" strokeDasharray={`${(stats.done / stats.total) * 251.2} 251.2`} className="text-blue-500" strokeLinecap="round" />
                   </svg>
                   <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                     <div className="text-2xl font-black text-foreground leading-none">{stats.done}<span className="text-sm font-semibold text-muted-foreground">/{stats.total}</span></div>
                     <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mt-1 max-w-[80px]">Question solved</div>
                   </div>
                </div>
                <div className="flex-1 w-full space-y-4">
                   <div>
                     <div className="flex justify-between text-xs font-semibold mb-1.5">
                       <span className="text-foreground">Easy</span>
                       <span className="text-muted-foreground">{stats.easySolved}/{stats.easyTotal}</span>
                     </div>
                     <div className="w-full bg-muted/50 rounded-full h-1.5">
                       <div className="h-full bg-green-500 rounded-full" style={{ width: `${(stats.easySolved / stats.easyTotal) * 100}%` }} />
                     </div>
                   </div>
                   <div>
                     <div className="flex justify-between text-xs font-semibold mb-1.5">
                       <span className="text-foreground">Medium</span>
                       <span className="text-muted-foreground">{stats.mediumSolved}/{stats.mediumTotal}</span>
                     </div>
                     <div className="w-full bg-muted/50 rounded-full h-1.5">
                       <div className="h-full bg-orange-400 rounded-full" style={{ width: `${(stats.mediumSolved / stats.mediumTotal) * 100}%` }} />
                     </div>
                   </div>
                   <div>
                     <div className="flex justify-between text-xs font-semibold mb-1.5">
                       <span className="text-foreground">Hard</span>
                       <span className="text-muted-foreground">{stats.hardSolved}/{stats.hardTotal}</span>
                     </div>
                     <div className="w-full bg-muted/50 rounded-full h-1.5">
                       <div className="h-full bg-red-500 rounded-full" style={{ width: `${(stats.hardSolved / stats.hardTotal) * 100}%` }} />
                     </div>
                   </div>
                </div>
             </Card>

             {/* Heatmap Card */}
             <Card className="p-5 border-border/60 shadow-sm flex flex-col">
               <div className="flex items-center justify-between mb-4">
                 <h3 className="font-bold text-foreground">Jun 2026 - Aug 2026</h3>
                 <div className="flex gap-1">
                   <Button variant="outline" size="icon" className="h-6 w-6 rounded-full"><ChevronDown className="h-3 w-3 rotate-90" /></Button>
                   <Button variant="outline" size="icon" className="h-6 w-6 rounded-full"><ChevronDown className="h-3 w-3 -rotate-90" /></Button>
                 </div>
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
                     />
                  ) : (
                     <div className="flex items-center justify-center h-full">
                       <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                     </div>
                  )}
               </div>

               <div className="flex items-center justify-between text-[10px] text-muted-foreground font-semibold pt-3 border-t border-border/40 mt-auto">
                 <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-green-500"></span> Questions</div>
                 <div className="flex items-center gap-1.5"><Target className="h-3 w-3 text-green-500" /> POTD question</div>
               </div>
               <div className="flex justify-between items-center mt-2 text-[10px] text-muted-foreground font-semibold">
                 <div>Current Streak: <span className="font-bold text-foreground">{stats.streak} Day</span></div>
                 <div>Max Streak: <span className="font-bold text-foreground">{stats.maxStreak} Day</span></div>
                 <div>Global Max Streak: <span className="font-bold text-foreground">530 Days</span></div>
               </div>
             </Card>
           </div>

           {/* Problem of the Day Banner */}
           <Card className="overflow-hidden border-border/60 shadow-sm bg-linear-to-r from-blue-600 to-blue-800 text-white flex flex-col sm:flex-row items-center justify-between p-1 sm:p-0">
              <div className="p-5 sm:p-6 flex-1">
                <div className="inline-flex items-center gap-1.5 bg-yellow-400 text-yellow-900 text-[10px] font-bold px-2 py-0.5 rounded-sm uppercase tracking-wider mb-2">
                  <Flame className="h-3 w-3 fill-yellow-900" /> Problem of the day
                </div>
                <h2 className="text-xl font-black uppercase tracking-tight">CONTAINER MERGE LINE</h2>
              </div>
              <div className="flex flex-wrap items-center gap-8 px-6 pb-5 sm:py-6 sm:bg-white/10 w-full sm:w-auto">
                 <div className="text-center">
                    <div className="text-[10px] text-blue-200 uppercase font-bold tracking-wider mb-1">Difficulty</div>
                    <div className="font-bold">Medium</div>
                 </div>
                 <div className="text-center">
                    <div className="text-[10px] text-blue-200 uppercase font-bold tracking-wider mb-1">Accuracy</div>
                    <div className="font-bold">88.34%</div>
                 </div>
                 <div className="text-center">
                    <div className="text-[10px] text-blue-200 uppercase font-bold tracking-wider mb-1">Points</div>
                    <div className="font-bold">0 /120</div>
                 </div>
                 <div className="ml-2">
                    <Button className="bg-white text-blue-700 hover:bg-blue-50 rounded-full font-bold px-6">
                      Solve
                    </Button>
                 </div>
              </div>
           </Card>

           {/* Search & Problems Table */}
           <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1" data-tour="problems-search">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search code questions" className="pl-9 h-10 rounded-full bg-card" />
                </div>
                <Button variant="outline" className="rounded-full h-10 gap-2 border-border/60">
                   <Play className="h-4 w-4" /> Pick Random
                </Button>
              </div>

              <div className="rounded-xl border border-border/60 bg-card overflow-hidden" data-tour="problems-table">
               <div className="overflow-x-auto">
                <div className="min-w-[600px] md:min-w-0">
                  <div className="grid grid-cols-12 gap-4 p-4 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground border-b border-border/40 bg-muted/20">
                    <div className="col-span-6 pl-2">Problem Title</div>
                    <div className="col-span-2 text-center">Difficulty</div>
                    <div className="col-span-2 text-center">Accuracy</div>
                    <div className="col-span-1 text-center">Points</div>
                    <div className="col-span-1 text-center">Action</div>
                 </div>

                 {loading ? (
                    <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                 ) : error ? (
                    <div className="p-6 text-center text-destructive text-sm font-medium">{error}</div>
                 ) : filtered.length === 0 ? (
                    <div className="p-12 text-center text-muted-foreground text-sm font-medium">No problems found.</div>
                 ) : (
                    <div className="divide-y divide-border/40">
                       {filtered.map((p, i) => (
                         <div key={p.id || i} className="grid grid-cols-12 gap-4 p-4 items-center hover:bg-muted/10 transition-colors group">
                            <div className="col-span-6 flex gap-3 min-w-0">
                               <div className="pt-0.5 shrink-0"><Bookmark className="h-4 w-4 text-muted-foreground/50 group-hover:text-primary transition-colors cursor-pointer" /></div>
                               <div className="min-w-0">
                                  <Link href={`/dashboard/problems/${p.slug}`} className="font-bold text-foreground text-sm truncate block hover:text-blue-600 transition-colors uppercase">
                                    {p.title}
                                  </Link>
                                  <div className="text-xs text-muted-foreground mt-1 truncate">
                                    {p.topics?.join(', ')} {p.topics?.length > 3 && <span className="text-blue-500 font-medium">+{p.topics.length - 3}</span>}
                                  </div>
                               </div>
                            </div>
                            <div className="col-span-2 text-center">
                               <span className={`text-xs font-semibold capitalize ${(() => {
                                 const dl = toDifficultyLevel(p.difficulty === 'easy' ? 'beginner' : p.difficulty === 'hard' ? 'advanced' : 'intermediate')
                                 return dl ? DIFFICULTY_COLORS[dl] : 'text-muted-foreground'
                               })()}`}>
                                 {p.difficulty}
                               </span>
                            </div>
                            <div className="col-span-2 flex items-center justify-center gap-2">
                               <span className="text-xs font-bold text-foreground">43.62%</span>
                               {/* Mock bar chart visual */}
                               <div className="flex items-end h-3 gap-px">
                                 <div className="w-[2px] h-full bg-blue-500" />
                                 <div className="w-[2px] h-full bg-blue-500" />
                                 <div className="w-[2px] h-[70%] bg-blue-500" />
                                 <div className="w-[2px] h-[40%] bg-blue-500" />
                                 <div className="w-[2px] h-[90%] bg-blue-500" />
                                 <div className="w-[2px] h-[30%] bg-muted" />
                                 <div className="w-[2px] h-[30%] bg-muted" />
                               </div>
                            </div>
                            <div className="col-span-1 text-center text-xs font-semibold text-muted-foreground">
                               0/100
                            </div>
                            <div className="col-span-1 flex justify-center">
                               <Button size="sm" variant="outline" className="h-8 rounded-full font-semibold border-border/80" onClick={() => router.push(`/dashboard/problems/${p.slug}`)}>
                                 Solve
                               </Button>
                            </div>
                         </div>
                       ))}
                    </div>
                 )}
                </div>
               </div>
              </div>
           </div>
        </div>

        {/* Right Column (Sidebar Gamification) */}
        <div className="hidden lg:block lg:col-span-3 space-y-6">
           
           {/* Leaderboard Card */}
           <Card className="p-5 border-border/60 shadow-sm">
             <h3 className="font-bold text-foreground mb-4">Leaderboard</h3>
             
             <div className="flex justify-between items-end gap-1 mb-6 h-36 px-1">
                {/* Rank 2 */}
                <div className="flex flex-col items-center gap-2 relative">
                   <UserAvatar seed="Aniket" name="Aniket" className="h-10 w-10 bg-slate-100" />
                   <div className="text-center leading-tight">
                     <div className="text-[9px] font-bold uppercase truncate w-14">Aniket</div>
                     <div className="text-[8px] text-muted-foreground font-semibold">142,975 Pts</div>
                   </div>
                   <div className="w-12 h-16 bg-blue-100 dark:bg-blue-900/40 rounded-t-lg flex items-center justify-center border-t-4 border-blue-300">
                      <span className="text-2xl font-black text-blue-300">2</span>
                   </div>
                </div>

                {/* Rank 1 */}
                <div className="flex flex-col items-center gap-2 relative">
                   <div className="absolute -top-3 text-amber-500"><Trophy className="h-5 w-5 fill-amber-500" /></div>
                   <UserAvatar seed="Prakash" name="Prakash" className="h-12 w-12 bg-amber-100 ring-2 ring-amber-400" />
                   <div className="text-center leading-tight">
                     <div className="text-[10px] font-bold uppercase truncate w-16 text-amber-600 dark:text-amber-400">Prakash</div>
                     <div className="text-[9px] font-bold text-amber-600/70 dark:text-amber-400/70">143,137 Pts</div>
                   </div>
                   <div className="w-16 h-20 bg-amber-100 dark:bg-amber-900/40 rounded-t-lg flex items-start pt-2 justify-center border-t-4 border-amber-400 shadow-inner">
                      <span className="text-3xl font-black text-amber-400">1</span>
                   </div>
                </div>

                {/* Rank 3 */}
                <div className="flex flex-col items-center gap-2 relative">
                   <UserAvatar seed="Purbayon" name="Purbayon" className="h-10 w-10 bg-slate-100" />
                   <div className="text-center leading-tight">
                     <div className="text-[9px] font-bold uppercase truncate w-14">Purbayon</div>
                     <div className="text-[8px] text-muted-foreground font-semibold">139,425 Pts</div>
                   </div>
                   <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/40 rounded-t-lg flex items-center justify-center border-t-4 border-orange-300">
                      <span className="text-2xl font-black text-orange-300">3</span>
                   </div>
                </div>
             </div>

             <div className="rounded-xl border border-border bg-muted/30 p-3 flex items-center justify-between mb-4 shadow-inner">
                <div className="flex items-center gap-3">
                   <UserAvatar seed="You" name="You" className="h-8 w-8 bg-slate-200" />
                   <div>
                     <div className="font-bold text-sm">You</div>
                     <div className="text-[10px] text-muted-foreground font-semibold">100 Pts</div>
                   </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-sm text-foreground">51914</div>
                  <div className="text-[10px] text-amber-600 dark:text-amber-500 font-bold uppercase tracking-wider">Rank</div>
                </div>
             </div>

             <Button variant="outline" className="w-full rounded-full text-xs font-bold border-border/80">
                View Leaderboard
             </Button>
           </Card>

           {/* Badges Card */}
           <Card className="p-5 border-border/60 shadow-sm">
             <h3 className="font-bold text-foreground mb-1">Badges</h3>
             <p className="text-[11px] text-muted-foreground mb-4">Congratulations on earning all the badges!</p>
             
             <div className="flex justify-between items-center gap-1 mb-2">
                {[10, 50, 100, 200, 500].map((num, i) => (
                  <div key={i} className="flex flex-col items-center group relative">
                    <svg viewBox="0 0 100 115" className={`w-12 h-12 ${i === 0 ? 'text-green-500' : 'text-slate-300 dark:text-slate-700'} fill-current filter drop-shadow-sm transition-transform hover:scale-110 cursor-pointer`}>
                       <path d="M50 0 L93.3 25 L93.3 75 L50 100 L6.7 75 L6.7 25 Z" stroke="currentColor" strokeWidth="2" />
                       <path d="M50 5 L88 27 L88 73 L50 95 L12 73 L12 27 Z" fill="rgba(0,0,0,0.1)" />
                       <text x="50" y="85" fontSize="18" fontWeight="bold" fill="currentColor" textAnchor="middle" className="opacity-60">{num}</text>
                    </svg>
                    {i === 0 && <span className="absolute inset-0 flex items-center justify-center pb-2"><CheckCircle2 className="h-5 w-5 text-white drop-shadow" /></span>}
                  </div>
                ))}
             </div>
           </Card>

           {/* 100 Days Promo */}
           <Card className="p-6 border-blue-200/50 bg-linear-to-br from-blue-50 to-white dark:from-blue-950/30 dark:to-background shadow-sm flex flex-col items-center text-center">
              <h3 className="text-xl font-bold text-foreground mb-2">100 Days<br/>Coding Sprint</h3>
              <p className="text-xs text-muted-foreground mb-6">Transform your coding skills with a 100-day marathon</p>
              
              {/* Mock visualization of days */}
              <div className="w-full bg-card rounded-xl p-3 border border-border/50 shadow-inner mb-6 space-y-2">
                <div className="flex items-center justify-between text-[10px] bg-muted/50 p-2 rounded-md">
                   <div className="flex items-center gap-2"><span className="h-4 w-4 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold">1</span> Day 1</div>
                   <div className="text-muted-foreground font-semibold px-2 py-0.5 rounded border bg-background">Two Pointers</div>
                </div>
                <div className="flex items-center justify-between text-[10px] bg-muted/50 p-2 rounded-md">
                   <div className="flex items-center gap-2"><span className="h-4 w-4 rounded-full bg-foreground text-background flex items-center justify-center font-bold">2</span> Day 2</div>
                   <div className="text-muted-foreground font-semibold px-2 py-0.5 rounded border bg-background opacity-50">Locked</div>
                </div>
              </div>

              <Button onClick={() => router.push('/dashboard/100-days')} className="w-full rounded-full bg-blue-600 hover:bg-blue-700 text-white font-bold gap-2">
                 Start now <ArrowRight className="h-4 w-4" />
              </Button>
           </Card>

        </div>
      </div>
    </div>
  )
}

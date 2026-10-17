'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Search, ChevronDown, ChevronUp, CheckCircle2, Bookmark, Flame, Target, Trophy, ArrowRight, Loader2, Play, Code, Award
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
import { PageHeader, Panel } from '@/components/app/page-kit'

function FilterAccordion({ title, items, selected, onToggle }: { title: string, items: {id: string, label: string}[], selected: string[], onToggle: (id: string) => void }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="border-b border-border/60 py-3">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex items-center justify-between w-full rounded-lg text-left font-semibold text-sm text-foreground focus-visible:outline-2 focus-visible:outline-primary">
        {title}
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="mt-3 flex flex-col gap-2">
          {items.map(item => (
            <button type="button" role="checkbox" aria-checked={selected.includes(item.id)} key={item.id} onClick={() => onToggle(item.id)} className="flex items-center gap-2 cursor-pointer group rounded-md text-left focus-visible:outline-2 focus-visible:outline-primary">
              <div className={`w-4 h-4 rounded-sm border flex items-center justify-center transition-colors ${selected.includes(item.id) ? 'bg-primary border-primary text-primary-foreground' : 'border-input group-hover:border-primary/50'}`}>
                {selected.includes(item.id) && <CheckCircle2 className="h-3 w-3" />}
              </div>
              <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">{item.label}</span>
            </button>
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
      <Card className="rounded-3xl p-5 border-border/70 flex flex-col md:flex-row gap-6 items-center animate-pulse">
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
      <Card className="rounded-3xl p-5 border-border/70 flex flex-col animate-pulse">
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
    <div className="rounded-3xl border border-border/70 bg-card overflow-hidden animate-pulse">
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
      
      <PageHeader
        title="Coding practice for placements and interviews"
        description="Pick a problem, write your solution in the browser and run it against the tests."
        icon={<Code />}
        className="mb-0"
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column (Filters) */}
        <div className="hidden lg:block lg:col-span-2 space-y-2">
           <h2 className="font-semibold text-foreground mb-4">Filters</h2>
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
             <Card className="rounded-3xl p-5 border-border/70 flex flex-col md:flex-row gap-6 items-center" data-tour="problems-stats">
                <div className="flex flex-col items-center flex-1 w-full relative h-32 justify-center">
                   <svg className="w-28 h-28 transform -rotate-90" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="40" fill="transparent" stroke="currentColor" strokeWidth="8" className="text-muted/30" />
                      <circle cx="50" cy="50" r="40" fill="transparent" stroke="currentColor" strokeWidth="8" strokeDasharray={`${stats.total ? (stats.done / stats.total) * 251.2 : 0} 251.2`} className="text-primary" strokeLinecap="round" />
                   </svg>
                   <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                     <div className="text-2xl font-black tabular-nums text-foreground leading-none">{stats.done}<span className="text-sm font-semibold text-muted-foreground">/{stats.total}</span></div>
                     <div className="text-[11px] text-muted-foreground font-medium mt-1 max-w-[80px]">Solved</div>
                   </div>
                </div>
                <div className="flex-1 w-full space-y-4">
                   <div>
                     <div className="flex justify-between text-xs font-semibold mb-1.5">
                       <span className="text-foreground">Easy</span>
                       <span className="text-muted-foreground tabular-nums">{stats.easySolved}/{stats.easyTotal}</span>
                     </div>
                     <div className="w-full bg-muted/50 rounded-full h-1.5">
                       <div className="h-full bg-green-500 rounded-full" style={{ width: `${stats.easyTotal ? (stats.easySolved / stats.easyTotal) * 100 : 0}%` }} />
                     </div>
                   </div>
                   <div>
                     <div className="flex justify-between text-xs font-semibold mb-1.5">
                       <span className="text-foreground">Medium</span>
                       <span className="text-muted-foreground tabular-nums">{stats.mediumSolved}/{stats.mediumTotal}</span>
                     </div>
                     <div className="w-full bg-muted/50 rounded-full h-1.5">
                       <div className="h-full bg-orange-400 rounded-full" style={{ width: `${stats.mediumTotal ? (stats.mediumSolved / stats.mediumTotal) * 100 : 0}%` }} />
                     </div>
                   </div>
                   <div>
                     <div className="flex justify-between text-xs font-semibold mb-1.5">
                       <span className="text-foreground">Hard</span>
                       <span className="text-muted-foreground tabular-nums">{stats.hardSolved}/{stats.hardTotal}</span>
                     </div>
                     <div className="w-full bg-muted/50 rounded-full h-1.5">
                       <div className="h-full bg-red-500 rounded-full" style={{ width: `${stats.hardTotal ? (stats.hardSolved / stats.hardTotal) * 100 : 0}%` }} />
                     </div>
                   </div>
                </div>
             </Card>

             {/* Heatmap Card */}
             <Card className="rounded-3xl p-5 border-border/70 flex flex-col">
               <div className="flex items-center justify-between mb-4">
                 <h2 className="font-semibold text-foreground">Last 12 weeks</h2>
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

               <div className="flex justify-between items-center gap-3 pt-3 border-t border-border/40 mt-auto text-xs text-muted-foreground">
                 <div>Current streak: <span className="font-semibold tabular-nums text-foreground">{stats.streak} {stats.streak === 1 ? 'day' : 'days'}</span></div>
                 <div>Best streak: <span className="font-semibold tabular-nums text-foreground">{stats.maxStreak} {stats.maxStreak === 1 ? 'day' : 'days'}</span></div>
               </div>
             </Card>
           </div>

           {/* Daily practice banner */}
           <div className="relative overflow-hidden rounded-3xl bg-linear-to-br from-[#2f5be7] via-[#2448c9] to-[#17224d] p-6 text-white shadow-[0_18px_40px_-20px_rgba(47,91,231,0.55)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div aria-hidden className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-[#38bdf8]/30 blur-3xl" />
              <div className="relative">
                <div className="inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-white/15 px-2.5 py-0.5 text-xs font-semibold mb-2">
                  <Flame className="h-3.5 w-3.5 text-amber-300" aria-hidden /> Daily practice
                </div>
                <h2 className="text-xl font-bold tracking-tight">Solve one problem a day</h2>
                <p className="mt-1 text-sm text-white/80">Keep your streak going — small daily practice adds up before placements.</p>
              </div>
              <Button onClick={() => router.push('/dashboard/100-days')} className="relative shrink-0 rounded-full bg-white px-6 font-semibold text-[#2448c9] hover:bg-white/90">
                Start the 100-day sprint <ArrowRight className="h-4 w-4" />
              </Button>
           </div>

           {/* Search & Problems Table */}
           <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1" data-tour="problems-search">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search problems" aria-label="Search problems" className="pl-9 h-10 rounded-full bg-card" />
                </div>
                <Button variant="outline" className="rounded-full h-10 gap-2 border-border/60">
                   <Play className="h-4 w-4" /> Pick random
                </Button>
              </div>

              <div className="rounded-3xl border border-border/70 bg-card overflow-hidden" data-tour="problems-table">
               <div className="overflow-x-auto">
                <div className="min-w-[600px] md:min-w-0">
                  <div className="grid grid-cols-12 gap-4 p-4 text-xs font-semibold text-muted-foreground border-b border-border/40 bg-muted/30">
                    <div className="col-span-8 pl-2">Problem</div>
                    <div className="col-span-2 text-center">Difficulty</div>
                    <div className="col-span-2 text-center"><span className="sr-only">Action</span></div>
                 </div>

                 {loading ? (
                    <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                 ) : error ? (
                    <div className="p-6 text-center text-destructive text-sm font-medium">{error}</div>
                 ) : filtered.length === 0 ? (
                    <div className="p-12 text-center text-muted-foreground text-sm">No problems match your search. Try a different word or clear the difficulty filter.</div>
                 ) : (
                    <div className="divide-y divide-border/40">
                       {filtered.map((p, i) => (
                         <div key={p.id || i} className="grid grid-cols-12 gap-4 p-4 items-center hover:bg-muted/40 transition-colors group">
                            <div className="col-span-8 flex gap-3 min-w-0">
                               <div className="pt-0.5 shrink-0"><Bookmark className="h-4 w-4 text-muted-foreground/50 group-hover:text-primary transition-colors cursor-pointer" /></div>
                               <div className="min-w-0">
                                  <Link href={`/dashboard/problems/${p.slug}`} className="font-semibold text-foreground text-sm truncate block hover:text-primary transition-colors">
                                    {p.title}
                                  </Link>
                                  <div className="text-xs text-muted-foreground mt-1 truncate">
                                    {p.topics?.join(', ')} {p.topics?.length > 3 && <span className="text-primary font-medium">+{p.topics.length - 3}</span>}
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
                            <div className="col-span-2 flex justify-center">
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
           <Panel className="p-5">
             <div className="flex items-center gap-3 mb-3">
               <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary"><Trophy className="h-5 w-5" aria-hidden /></span>
               <h2 className="font-semibold text-foreground">Leaderboard</h2>
             </div>
             <p className="text-sm text-muted-foreground mb-4">See how your points compare with other learners.</p>
             <Button variant="outline" className="w-full rounded-full text-sm font-semibold" onClick={() => router.push('/dashboard/leaderboard')}>
                View leaderboard
             </Button>
           </Panel>

           {/* Badges Card */}
           <Panel className="p-5">
             <div className="flex items-center gap-3 mb-3">
               <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary"><Award className="h-5 w-5" aria-hidden /></span>
               <h2 className="font-semibold text-foreground">Badges</h2>
             </div>
             <p className="text-sm text-muted-foreground mb-4">Solve problems and keep your streak to unlock badges.</p>
             <Button variant="outline" className="w-full rounded-full text-sm font-semibold" onClick={() => router.push('/dashboard/achievements')}>
                See your badges
             </Button>
           </Panel>

           {/* 100 Days Promo */}
           <Card className="rounded-3xl p-6 border-primary/20 bg-linear-to-br from-primary/10 to-card flex flex-col items-center text-center">
              <h2 className="text-xl font-bold text-foreground mb-2">100-day<br/>coding sprint</h2>
              <p className="text-xs text-muted-foreground mb-6">Transform your coding skills with a 100-day marathon</p>
              
              {/* Mock visualization of days */}
              <div className="w-full bg-card rounded-xl p-3 border border-border/50 shadow-inner mb-6 space-y-2">
                <div className="flex items-center justify-between text-[10px] bg-muted/50 p-2 rounded-md">
                   <div className="flex items-center gap-2"><span className="h-4 w-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">1</span> Day 1</div>
                   <div className="text-muted-foreground font-semibold px-2 py-0.5 rounded border bg-background">Two Pointers</div>
                </div>
                <div className="flex items-center justify-between text-[10px] bg-muted/50 p-2 rounded-md">
                   <div className="flex items-center gap-2"><span className="h-4 w-4 rounded-full bg-foreground text-background flex items-center justify-center font-bold">2</span> Day 2</div>
                   <div className="text-muted-foreground font-semibold px-2 py-0.5 rounded border bg-background opacity-50">Locked</div>
                </div>
              </div>

              <Button onClick={() => router.push('/dashboard/100-days')} className="w-full rounded-full font-semibold gap-2">
                 Start now <ArrowRight className="h-4 w-4" />
              </Button>
           </Card>

        </div>
      </div>
    </div>
  )
}

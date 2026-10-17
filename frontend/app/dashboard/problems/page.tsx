'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Search, ChevronDown, ChevronUp, CheckCircle2, Target, Trophy, ArrowRight, Loader2, Play, Award
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
import { Panel } from '@/components/app/page-kit'
import { AppBanner, Illustration, bannerBtnPrimary, bannerBtnSecondary } from '@/components/visuals'
import { EmptyState } from '@/components/ui/empty-state'

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
  const { loading, error, q, setQ, difficulty, setDifficulty, filtered, load } = useProblemsViewModel()
  const router = useRouter()
  const { startTour, setTourSeen } = useTour()

  const [heatmapData, setHeatmapData] = useState<any>(null)
  const [heatmapFailed, setHeatmapFailed] = useState(false)
  useEffect(() => {
    fetch('/api/user/heatmap?weeks=12').then(r => r.json()).then(data => {
      if (data && !data.error && !data._error && data.cells) setHeatmapData(data)
      else setHeatmapFailed(true)
    }).catch(() => setHeatmapFailed(true))
  }, [])

  // Topic filter is built from the problems actually loaded (no made-up options).
  const [selectedTopics, setSelectedTopics] = useState<string[]>([])
  const topicOptions = useMemo(() => {
    const set = new Map<string, string>()
    for (const p of filtered) for (const t of p.topics || []) {
      const key = t.toLowerCase()
      if (!set.has(key)) set.set(key, t)
    }
    return Array.from(set, ([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label)).slice(0, 12)
  }, [filtered])
  const visible = useMemo(
    () => selectedTopics.length === 0
      ? filtered
      : filtered.filter(p => (p.topics || []).some(t => selectedTopics.includes(t.toLowerCase()))),
    [filtered, selectedTopics],
  )

  const pickRandom = () => {
    if (visible.length === 0) return
    const p = visible[Math.floor(Math.random() * visible.length)]
    router.push(`/dashboard/problems/${p.slug}`)
  }

  // Initialize tour if this is the first visit to problems page
  useEffect(() => {
    if (gate.ready) {
      const problemsTour: TourStep[] = [
        {
          target: '[data-tour="problems-search"]',
          title: 'Coding practice library',
          description: 'Practice library for placements and interviews; type here to filter questions.',
          position: 'bottom',
        },
        {
          target: '[data-tour="problems-stats"]',
          title: 'Problems by difficulty',
          description: 'See how many Easy, Medium and Hard problems match your filters.',
          position: 'bottom',
        },
        {
          target: '[data-tour="problems-table"]',
          title: 'Start solving',
          description: 'Tip: click Solve on any row to open its coding workspace.',
          position: 'bottom',
        },
      ]
      autoPlayPageTour('problems', problemsTour)}
  }, [gate.ready, startTour, setTourSeen])

  // Counts from the problems shown. Solved/streak numbers aren't available on
  // this page yet, so we don't show them rather than showing zeros.
  const stats = useMemo(() => ({
    total: visible.length,
    easyTotal: visible.filter(p => p.difficulty === 'easy').length,
    mediumTotal: visible.filter(p => p.difficulty === 'medium').length,
    hardTotal: visible.filter(p => p.difficulty === 'hard').length,
  }), [visible])

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

  if (!gate.ready) return null

  return (
    <div className="max-w-[1400px] mx-auto pb-12 space-y-6">
      
      <AppBanner
        eyebrow="Practice"
        title="Coding practice for placements and interviews"
        description="Pick a problem, write your solution in the browser and run it against the tests. One a day keeps your streak going."
        actions={
          <>
            <Link href="/dashboard/100-days" className={bannerBtnPrimary}>
              Start the 100-day sprint <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link href="/dashboard/leaderboard" className={bannerBtnSecondary}>
              <Trophy className="h-4 w-4" aria-hidden /> Leaderboard
            </Link>
          </>
        }
        art={
          <Illustration name="coding" inverse className="w-44" />
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column (Filters) */}
        <div className="hidden lg:block lg:col-span-2 space-y-2">
           <h2 className="mb-1 text-base font-semibold text-foreground">Filters</h2>
           <FilterAccordion
              title="Difficulty"
              items={DIFFICULTY_LEVELS.map(l => ({ id: l, label: DIFFICULTY_LABELS[l] }))}
              selected={difficulty !== 'all' ? [difficulty] : []}
              onToggle={(id) => setDifficulty(prev => prev === id ? 'all' : id)}
            />
           {topicOptions.length > 0 && (
             <FilterAccordion
               title="Topics"
               items={topicOptions}
               selected={selectedTopics}
               onToggle={(id) => setSelectedTopics(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])}
             />
           )}
           {selectedTopics.length > 0 && (
             <Button variant="ghost" size="sm" className="mt-2 px-0 text-primary" onClick={() => setSelectedTopics([])}>
               Clear topics
             </Button>
           )}
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
                      <circle cx="50" cy="50" r="40" fill="transparent" stroke="currentColor" strokeWidth="8" strokeDasharray="251.2 251.2" className="text-primary/70" strokeLinecap="round" />
                   </svg>
                   <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                     <div className="text-2xl font-black tabular-nums text-foreground leading-none">{stats.total}</div>
                     <div className="text-[11px] text-muted-foreground font-medium mt-1 max-w-[80px]">{stats.total === 1 ? 'Problem' : 'Problems'}</div>
                   </div>
                </div>
                <div className="flex-1 w-full space-y-4">
                   <div>
                     <div className="flex justify-between text-xs font-semibold mb-1.5">
                       <span className="text-foreground">Easy</span>
                       <span className="text-muted-foreground tabular-nums">{stats.easyTotal}</span>
                     </div>
                     <div className="w-full bg-muted/50 rounded-full h-1.5">
                       <div className="h-full bg-green-500 rounded-full" style={{ width: `${stats.total ? (stats.easyTotal / stats.total) * 100 : 0}%` }} />
                     </div>
                   </div>
                   <div>
                     <div className="flex justify-between text-xs font-semibold mb-1.5">
                       <span className="text-foreground">Medium</span>
                       <span className="text-muted-foreground tabular-nums">{stats.mediumTotal}</span>
                     </div>
                     <div className="w-full bg-muted/50 rounded-full h-1.5">
                       <div className="h-full bg-orange-400 rounded-full" style={{ width: `${stats.total ? (stats.mediumTotal / stats.total) * 100 : 0}%` }} />
                     </div>
                   </div>
                   <div>
                     <div className="flex justify-between text-xs font-semibold mb-1.5">
                       <span className="text-foreground">Hard</span>
                       <span className="text-muted-foreground tabular-nums">{stats.hardTotal}</span>
                     </div>
                     <div className="w-full bg-muted/50 rounded-full h-1.5">
                       <div className="h-full bg-red-500 rounded-full" style={{ width: `${stats.total ? (stats.hardTotal / stats.total) * 100 : 0}%` }} />
                     </div>
                   </div>
                </div>
             </Card>

             {/* Heatmap Card */}
             <Card className="rounded-3xl p-5 border-border/70 flex flex-col">
               <div className="flex items-center justify-between mb-4">
                 <h2 className="text-base font-semibold text-foreground">Last 12 weeks</h2>
               </div>

               <div className="flex-1 overflow-x-auto min-h-25 mb-2 -mx-2 px-2 custom-scrollbar">
                  {heatmapData ? (
                     <ContributionGraph
                        cells={heatmapData.cells}
                        dayLabels={heatmapData.dayLabels}
                        monthLabels={heatmapData.monthLabels}
                        tooltipData={heatmapData.tooltipData}
                        totalContributions={heatmapData.totalContributions ?? 0}
                        totalActiveDays={heatmapData.totalActiveDays ?? 0}
                        compactEmpty
                     />
                  ) : heatmapFailed ? (
                     <div className="flex items-center justify-center h-full text-sm text-muted-foreground">Activity isn&apos;t available right now.</div>
                  ) : (
                     <div className="flex items-center justify-center h-full">
                       <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                     </div>
                  )}
               </div>

               <div className="flex justify-between items-center gap-3 pt-3 border-t border-border/40 mt-auto text-xs text-muted-foreground">
                 {heatmapData ? (
                   <>
                     <div>Active days: <span className="font-semibold tabular-nums text-foreground">{heatmapData.totalActiveDays ?? 0}</span></div>
                     <div>Activity: <span className="font-semibold tabular-nums text-foreground">{heatmapData.totalContributions ?? 0}</span></div>
                   </>
                 ) : <div>&nbsp;</div>}
               </div>
             </Card>
           </div>

           {/* Search & Problems Table */}
           <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1" data-tour="problems-search">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search problems" aria-label="Search problems" className="pl-9 h-10 rounded-full bg-card" />
                </div>
                <Button variant="outline" className="rounded-full h-10 gap-2 border-border/60" onClick={pickRandom} disabled={loading || visible.length === 0}>
                   <Play className="h-4 w-4" aria-hidden /> Pick random
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
                    <EmptyState illustration="error" title="Couldn't load problems" description="Check your connection and try again." actionLabel="Try again" onAction={() => void load()} className="rounded-none border-0 bg-transparent" />
                 ) : visible.length === 0 ? (
                    <EmptyState variant="search" title="No problems match" description="Try a different word or clear the filters." className="rounded-none border-0 bg-transparent" />
                 ) : (
                    <div className="divide-y divide-border/40">
                       {visible.map((p, i) => (
                         <div key={p.id || i} className="grid grid-cols-12 gap-4 p-4 items-center hover:bg-muted/40 transition-colors group">
                            <div className="col-span-8 flex gap-3 min-w-0">
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
               <h2 className="text-base font-semibold text-foreground">Leaderboard</h2>
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
               <h2 className="text-base font-semibold text-foreground">Badges</h2>
             </div>
             <p className="text-sm text-muted-foreground mb-4">Solve problems and keep your streak to unlock badges.</p>
             <Button variant="outline" className="w-full rounded-full text-sm font-semibold" onClick={() => router.push('/dashboard/achievements')}>
                See your badges
             </Button>
           </Panel>

           {/* 100 Days Promo */}
           <Card className="rounded-3xl p-6 border-primary/20 bg-linear-to-br from-primary/10 to-card flex flex-col items-center text-center">
              <h2 className="mb-2 text-lg font-semibold text-foreground">100-day coding sprint</h2>
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
